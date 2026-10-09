// Memoria de la agencia (Rodny, 9 de octubre de 2026: «que se alimente, que aprenda de todo, que interprete la
// información que tiene a menos que yo la contradiga o enseñe»). Cada hecho dice qué tan cierto es y de dónde
// sale; lo que el equipo confirma o corrige manda sobre lo que salió de leer el Drive y el correo, y nada se
// borra: un hecho reemplazado queda en el historial.
//
// Lógica pura, compartida por el repositorio, las herramientas de Bria y el script de importación.

import { createHash } from 'node:crypto';
import { hasModulePermission } from '../config/security.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { canUseBria } from './briaLivingMemory.js';

export const FACT_CERTAINTIES = ['CONFIRMADO', 'VIGENTE_DOCUMENTADO', 'VIGENTE_DE_HECHO', 'PRACTICA', 'PROPUESTA', 'NO_CONCLUYENTE', 'HISTORICO'];
export const FACT_PURPOSES = ['operacion', 'editorial', 'personas', 'comercial', 'financiero', 'direccion'];
export const FACT_ENTITY_TYPES = ['cliente', 'marca', 'pagador', 'canal', 'proyecto', 'servicio', 'proceso', 'agencia', 'rol', 'herramienta'];
export const FACT_MAX_LENGTH = 600;
export const AGENCY_ENTITY = 'Brain Studio';

// Cómo lo dice Bria. El orden de FACT_CERTAINTIES es también el orden en que se presentan.
export const CERTAINTY_WORDS = {
  CONFIRMADO: 'confirmado por el equipo',
  VIGENTE_DOCUMENTADO: 'vigente, con documento',
  VIGENTE_DE_HECHO: 'vigente de hecho, sin documento a la vista',
  PRACTICA: 'así se trabaja hoy',
  PROPUESTA: 'propuesta, no acordada',
  NO_CONCLUYENTE: 'por confirmar: las fuentes no coinciden o falta el documento',
  HISTORICO: 'histórico, ya no rige'
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const humanDay = (key) => {
  const [y, m, d] = String(key || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? `${d} de ${MONTHS[m - 1]} de ${y}` : null;
};

export const factError = (message, status = 400, code = 'BRIA_FACT_INVALID') => Object.assign(new Error(message), { status, code });
export const factKey = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const date = (value, field) => {
  if (value == null || value === '') return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw factError(`Indica una fecha válida en «${field}».`);
  return value;
};

// Lo que nunca entra a la memoria de la agencia, la escriba quien la escriba.
const FORBIDDEN = [
  [/(contrase(ñ|n)a|password|clave|pin)\s*[:=]\s*\S+/i, 'Las credenciales no se guardan en la memoria de la agencia.'],
  [/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)\b|\bsk-[a-zA-Z0-9_-]{12,}/i, 'Las credenciales no se guardan en la memoria de la agencia.'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'Los correos son un dato personal: guarda el nombre y el rol de la persona.'],
  [/(\+?57|\+1)?[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{4}\b/, 'Los teléfonos son un dato personal: guarda el nombre y el rol de la persona.'],
  [/\b\d{9,}\b/, 'Un número tan largo parece una cuenta o un documento: es un dato personal o una credencial.']
];

export const validateFact = (input = {}) => {
  const entity = String(input.entidad ?? input.entity ?? '').trim();
  const statement = String(input.afirmacion ?? input.statement ?? '').trim();
  const certainty = input.certeza ?? input.certainty;
  const purpose = input.proposito ?? input.purpose;
  const topic = String(input.tema ?? input.topic ?? '').trim();
  const entityType = input.tipoEntidad ?? input.entityType ?? 'cliente';
  if (!entity || entity.length > 160) throw factError('Indica a qué cliente, marca o proceso pertenece el hecho.');
  if (!topic || topic.length > 60) throw factError('Indica el tema del hecho.');
  if (!statement || statement.length > FACT_MAX_LENGTH) throw factError(`Escribe la afirmación en ${FACT_MAX_LENGTH} caracteres como máximo.`);
  if (!FACT_CERTAINTIES.includes(certainty)) throw factError('La certeza no es válida.');
  if (!FACT_PURPOSES.includes(purpose)) throw factError('El propósito no es válido.');
  if (!FACT_ENTITY_TYPES.includes(entityType)) throw factError('El tipo de entidad no es válido.');
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(statement)) throw factError(message, 400, 'BRIA_FACT_SENSITIVE');
  const validFrom = date(input.desde ?? input.validFrom ?? null, 'desde');
  const validUntil = date(input.hasta ?? input.validUntil ?? null, 'hasta');
  if (validFrom && validUntil && validUntil < validFrom) throw factError('La vigencia termina antes de empezar.');
  const sources = (Array.isArray(input.fuentes ?? input.sources) ? (input.fuentes ?? input.sources) : [])
    .slice(0, 3).map((s) => ({ tipo: String(s?.tipo || ''), ref: String(s?.ref || '').slice(0, 300), fecha: s?.fecha || null }));
  const sensitivity = purpose === 'direccion' ? 'restringida' : (input.sensibilidad ?? input.sensitivity) === 'restringida' ? 'restringida' : 'normal';
  return {
    ...(input.id ? { id: String(input.id).slice(0, 120) } : {}),
    entity, entityType, topic, statement, certainty, purpose, sensitivity, validFrom, validUntil, sources,
    nativeName: input.fichaNativa ?? input.nativeName ?? null,
    observedOn: date(input.observadoEl ?? input.observedOn ?? null, 'observadoEl')
  };
};

export const factDigest = (fact) => createHash('sha256').update(JSON.stringify([
  fact.entity, fact.entityType, fact.topic, fact.statement, fact.certainty, fact.purpose, fact.sensitivity,
  fact.validFrom, fact.validUntil, fact.sources, fact.observedOn
])).digest('hex').slice(0, 32);

/**
 * Qué propósitos puede leer esta persona y cuáles, además, en su versión restringida. Bria activada es la
 * puerta; cada propósito usa el permiso de la pantalla que muestra ese dato (Financiero, CRM o Cotizaciones),
 * y dirección es solo de administración.
 */
export const factAccess = (user) => {
  if (!canUseBria(user)) return { purposes: [], restricted: [] };
  const admin = String(user.role).toUpperCase() === 'ADMIN';
  const purposes = ['operacion', 'editorial', 'personas'];
  if (admin || hasModulePermission(user, 'crm') || hasModulePermission(user, 'cotizaciones')) purposes.push('comercial');
  const money = hasFinancialPermission(user, 'read');
  if (money) purposes.push('financiero');
  if (admin) purposes.push('direccion');
  return { purposes, restricted: admin ? [...purposes] : money ? ['financiero'] : [] };
};

export const factVisible = (fact, access) => Boolean(fact && access?.purposes?.includes(fact.purpose)
  && (fact.sensitivity !== 'restringida' || access.restricted.includes(fact.purpose)));

// Escribir pide lo mismo que leer; lo que es de toda la agencia lo confirma un administrador.
export const canWriteFact = (user, fact) => factVisible(fact, factAccess(user))
  && (factKey(fact.entity) !== factKey(AGENCY_ENTITY) || String(user?.role).toUpperCase() === 'ADMIN');

// Una corrección, una confirmación o una enseñanza dicha por la persona en este mensaje. Las preguntas y los
// pedidos de trabajo no lo son; lo que diga un archivo o un correo nunca cuenta.
// `\b` no reconoce letras con tilde («cambió»), así que los bordes se marcan con letras Unicode.
const CORRECTION = /(?<![\p{L}\p{N}])(te\s+corrijo|corr[ií]ge(lo|la)?|corrijo|correcci[oó]n|est[aá]\s+mal|no\s+es\s+as[ií]|es\s+incorrecto|ya\s+no|ya\s+cambi[oó]|cambi[oó]|en\s+realidad|recuerda|recu[eé]rdalo|apr[eé]ndete|aprende|gu[aá]rda(lo|la)?|tenlo\s+en\s+cuenta|ten\s+en\s+cuenta|para\s+que\s+sepas|confirmo|confirmado|as[ií]\s+es|actual[ií]za(lo|la)?|no\s+es\s+.+\s+sino)(?![\p{L}\p{N}])/iu;
export const correctionIntent = (text) => {
  const value = String(text || '').trim();
  if (!value) return false;
  return CORRECTION.test(value);
};

/** Qué hacer con cada hecho de una nueva lectura. Lo que el equipo tocó o retiró, no se pisa ni revive. */
export const planFactImport = (existing = [], incoming = []) => {
  const current = new Map(existing.map((row) => [row.id, row]));
  const plan = { create: [], update: [], unchanged: [], keep: [] };
  for (const fact of incoming) {
    const old = current.get(fact.id);
    const digest = factDigest(fact);
    if (!old) plan.create.push({ ...fact, digest });
    else if (old.origin !== 'LECTURA' || old.status !== 'ACTIVE') plan.keep.push({ ...fact, digest });
    else if (old.digest === digest) plan.unchanged.push({ ...fact, digest });
    else plan.update.push({ ...fact, digest });
  }
  return plan;
};

/**
 * Liga cada entidad de la lectura a una ficha de Intelligence. Solo por nombre exacto (sin tildes ni
 * mayúsculas), prefiriendo la ficha viva sobre su gemela archivada; si quedan dos vivas, no adivina.
 * `overrides` = { entidad: slug o id } que decide una persona.
 */
export const resolveClientLinks = (entities = [], clients = [], overrides = {}) => {
  const byName = new Map();
  for (const client of clients) {
    const key = factKey(client.name);
    byName.set(key, [...(byName.get(key) || []), client]);
  }
  const bySlugOrId = new Map(clients.flatMap((client) => [[client.slug, client], [client.id, client]]));
  const links = new Map();
  for (const { entidad, fichaNativa } of entities) {
    if (links.has(entidad)) continue;
    const forced = overrides[entidad];
    if (forced) {
      const client = bySlugOrId.get(forced);
      links.set(entidad, client ? { clientId: client.id, reason: 'Vínculo fijado a mano' } : { clientId: null, reason: `El vínculo a mano «${forced}» no existe` });
      continue;
    }
    if (!fichaNativa) { links.set(entidad, { clientId: null, reason: 'Sin ficha en la plataforma' }); continue; }
    const candidates = byName.get(factKey(fichaNativa)) || [];
    const live = candidates.filter((client) => !client.isArchived);
    const pick = live.length === 1 ? live[0] : live.length === 0 && candidates.length === 1 ? candidates[0] : null;
    links.set(entidad, pick
      ? { clientId: pick.id, reason: pick.isArchived ? 'Ficha archivada' : 'Nombre exacto' }
      : { clientId: null, reason: candidates.length ? `Hay varias fichas llamadas «${fichaNativa}»: elige una a mano` : `No hay ficha llamada «${fichaNativa}»` });
  }
  return links;
};

/** Lo que recibe el modelo: palabras, no claves internas. */
export const presentFact = (row) => ({
  id: row.id,
  entidad: row.entity,
  tema: row.topic,
  afirmacion: row.statement,
  certeza: CERTAINTY_WORDS[row.certainty] || row.certainty,
  periodo: [row.validFrom && `desde ${humanDay(row.validFrom)}`, row.validUntil && `hasta ${humanDay(row.validUntil)}`].filter(Boolean).join(' ') || null,
  fuente: (row.sources || []).map((s) => [s.ref, s.fecha && humanDay(s.fecha)].filter(Boolean).join(', ')).join(' · ') || null,
  origen: row.origin === 'EQUIPO'
    ? `Confirmado por ${row.actorName || 'el equipo'}${row.updatedAt ? ` el ${humanDay(new Date(row.updatedAt).toISOString())}` : ''}`
    : `Lectura del negocio${row.asOf ? ` (${humanDay(row.asOf)})` : ''}`,
  ...(row.revision ? { revision: row.revision } : {})
});
