// Búsqueda de pendientes con los filtros de Gestión (Rodny, 11 de octubre de 2026: «Todos los pendientes de Jarlan,
// pónselos a Kamila como responsable» … «Dime cuántos pendientes están sin asignar»). Es **una sola** función para
// la herramienta `buscar_pendientes` y para el lote de `cambiar_pendientes`: así lo que Bria cuenta y lo que Bria
// cambia es exactamente el mismo conjunto. Los nombres se buscan primero tal cual y, sin resultado, por parecido
// (`fuzzyMatch`, como `buscar_cliente`), diciendo que fue una aproximación. El conteo es real (`count` con el mismo
// `where`); la lista se corta en 50. La base entra inyectada: las pruebas corren sin PostgreSQL.

import { knowledgeError } from '../lib/briaKnowledge.js';
import { rankByName } from '../lib/fuzzyMatch.js';

export const OPEN_TASK_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
export const TASK_STATUS_FILTERS = {
  pendientes: ['PENDIENTE'],
  en_proceso: ['EN_CURSO'],
  devueltas: ['DEVUELTA'],
  realizadas: ['REALIZADA'],
  todas: OPEN_TASK_STATUSES
};
export const TASK_SEARCH_MAX = 50;
export const statusesFor = (estado) => TASK_STATUS_FILTERS[String(estado || 'todas').toLowerCase()] || OPEN_TASK_STATUSES;

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const same = (a, b) => fold(a) === fold(b);
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'es');

const MEMBER_SELECT = { id: true, name: true, email: true, isActive: true };
const CLIENT_SELECT = { id: true, name: true, slug: true, isArchived: true };

// Con una coincidencia se elige; con varias, solo la exacta (nombre, correo o id). En una búsqueda aproximada se
// toma la primera si se despega claramente de la segunda: «jarlan peres» es Jarlan Pérez aunque haya más gente.
const pick = (rows, term, approximate) => {
  if (rows.length === 1) return rows[0];
  const exact = rows.filter((row) => same(row.name, term) || same(row.email, term) || same(row.id, term));
  if (exact.length === 1) return exact[0];
  if (approximate && rows.length > 1 && rows[0].score - (rows[1].score || 0) >= 0.15) return rows[0];
  return null;
};

const ambiguous = (field, term, rows) => {
  const options = [...new Set(rows.map((row) => row.name))].sort((a, b) => a.localeCompare(b, 'es'));
  return Object.assign(knowledgeError(`¿Cuál ${term}? Puede ser ${options.join(', ')}.`, 400, 'BRIA_SEARCH_AMBIGUOUS'), { field, options });
};

/** Una persona del equipo por su nombre (o correo), también si ya no está activa: sus pendientes siguen existiendo. */
export const findMemberByTerm = async (db, term) => {
  let rows = await db.teamMember.findMany({
    where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { equals: term, mode: 'insensitive' } }] },
    select: MEMBER_SELECT, orderBy: { name: 'asc' }, take: 8
  });
  let approximate = false;
  if (!rows.length) {
    const all = await db.teamMember.findMany({ select: MEMBER_SELECT, take: 500 });
    rows = rankByName(all, term, (row) => row.name);
    approximate = rows.length > 0;
  }
  return { rows: approximate ? rows : [...rows].sort(byName), chosen: pick(rows, term, approximate), approximate };
};

/** Un cliente por su id o por parte de su nombre, también archivado. */
export const findClientByTerm = async (db, term) => {
  let rows = await db.client.findMany({
    where: { OR: [{ id: term }, { name: { contains: term, mode: 'insensitive' } }] },
    select: CLIENT_SELECT, orderBy: [{ isArchived: 'asc' }, { name: 'asc' }], take: 8
  });
  let approximate = false;
  if (!rows.length) {
    const all = await db.client.findMany({ select: CLIENT_SELECT, take: 2000 });
    rows = rankByName(all, term, (row) => row.name);
    approximate = rows.length > 0;
  }
  return { rows, chosen: pick(rows, term, approximate), approximate };
};

const plural = (n, word) => (n === 1 ? word : `${word}s`);
const STATE_WORDS = { todas: 'abierto', pendientes: 'en Pendiente', en_proceso: 'en proceso', devueltas: 'devuelto', realizadas: 'realizado' };

/** «12 pendientes abiertos de Jarlan Pérez», «1 pendiente vencido del cliente Nattal»: cómo se resolvió la búsqueda. */
export const describeSearch = (total, filters = {}, resolved = {}) => {
  const estado = String(filters.estado || 'todas').toLowerCase();
  const parts = [`${total} ${plural(total, 'pendiente')}`];
  if (filters.vencidas) parts.push(plural(total, 'vencido'));
  else {
    const word = STATE_WORDS[estado] || STATE_WORDS.todas;
    parts.push(word.startsWith('en ') ? word : plural(total, word));
  }
  if (filters.sinResponsable) parts.push('sin responsable');
  else if (resolved.responsable) parts.push(`de ${resolved.responsable.nombre}`);
  if (resolved.cliente) parts.push(`del cliente ${resolved.cliente.nombre}`);
  return parts.join(' ');
};

/**
 * Las tareas que cumplen los filtros: `responsable` (nombre), `sinResponsable`, `cliente` (nombre o id), `estado`
 * (pendientes | en_proceso | devueltas | realizadas | todas = no cerradas) y `vencidas` (fecha anterior a hoy en
 * Bogotá y no cerradas). Devuelve el total real, hasta `take` filas con el `select` que pida quien llama, qué se
 * resolvió por nombre (y si fue aproximado) y la frase que lo describe. Un nombre que no existe responde 404; uno
 * con varias personas posibles, 400 con `field` y `options` para que Bria pregunte cuál.
 */
export const searchTasks = async ({ db, filters = {}, today, select, take = TASK_SEARCH_MAX }) => {
  const resolved = {};
  const where = {};
  let statuses = statusesFor(filters.estado);
  if (filters.vencidas) {
    statuses = statuses.filter((status) => status !== 'REALIZADA');
    // Las fechas se guardan al mediodía UTC; «antes de hoy» es antes de la medianoche de Bogotá (UTC−5).
    where.dueDate = { lt: new Date(`${today}T05:00:00.000Z`) };
  }
  where.status = { in: statuses };
  if (filters.sinResponsable) where.assigneeId = null;
  else if (tidy(filters.responsable)) {
    const term = tidy(filters.responsable).slice(0, 160);
    const found = await findMemberByTerm(db, term);
    if (!found.rows.length) throw knowledgeError(`No encontré a nadie en el equipo que se llame «${term}».`, 404, 'BRIA_SEARCH_PERSON');
    if (!found.chosen) throw ambiguous('responsable', term, found.rows);
    where.assigneeId = found.chosen.id;
    resolved.responsable = { id: found.chosen.id, nombre: found.chosen.name, aproximado: found.approximate };
  }
  if (tidy(filters.cliente)) {
    const term = tidy(filters.cliente).slice(0, 160);
    const found = await findClientByTerm(db, term);
    if (!found.rows.length) throw knowledgeError(`No encontré un cliente que se llame «${term}».`, 404, 'BRIA_SEARCH_CLIENT');
    if (!found.chosen) throw ambiguous('cliente', term, found.rows);
    where.clientId = found.chosen.id;
    resolved.cliente = { id: found.chosen.id, nombre: found.chosen.name, aproximado: found.approximate };
  }
  const limit = Math.min(Math.max(Number(take) || TASK_SEARCH_MAX, 1), TASK_SEARCH_MAX);
  const [total, rows] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({ where, select, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], take: limit })
  ]);
  const approximate = Boolean(resolved.responsable?.aproximado || resolved.cliente?.aproximado);
  return { total, rows, resolved, approximate, where, descripcion: describeSearch(total, filters, resolved) };
};
