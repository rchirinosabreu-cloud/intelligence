// Las herramientas de Bria (6 de octubre de 2026). Cada una aplica exactamente el permiso de la pantalla
// que muestra ese dato: sin el módulo no hay herramienta; con el módulo, la persona ve lo mismo que vería
// en la pantalla. Devuelven datos compactos para el modelo (nunca el guion, la descripción ni nada que la
// pantalla esconda) y las fuentes que la plataforma muestra aparte.
//
// El contexto que reciben (`db`, `getTasks`, `operations`, `searchMemory`, `now`) entra inyectado desde
// el servicio, así las pruebas corren sin base de datos.

import { hasModulePermission, isManagerRole } from '../config/security.js';
import { pieceStage, shortDate } from '../lib/clientOperations.js';
import { approvalState, APPROVAL_STATES } from '../lib/contentApproval.js';
import { lastClientRequest } from '../lib/clientUpdate.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { rankByName } from '../lib/fuzzyMatch.js';
import { formatDuration } from '../lib/teamRhythm.js';
import { getTaskElapsedMs } from '../lib/taskTiming.js';
import { taskPrivacyFilter } from '../lib/taskPrivacy.js';
import { searchTasks, statusesFor } from './taskSearch.js';
import { profilePredictionProblem, RHYTHM_POLICY } from '../lib/workPrediction.js';
import { readDecisionContext, decisionContract } from './briaDecisionContext.js';

const STAGE_LABELS = ['sin texto', 'redactada', 'diseñada', 'aprobada', 'programada', 'publicada'];
const LEVEL_LABELS = { red: 'rojo', yellow: 'amarillo', green: 'verde', gray: 'gris' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MAX_PUBLICATION_DAYS = 30;
const DAY_MS = 86_400_000;

const text = (value) => String(value ?? '').trim();
const hasText = (value) => text(value).length > 0;
const dayOf = (value) => (value ? bogotaDate(value) : null);
// La fecha de publicación de una pieza se guarda al mediodía UTC para que el día no se corra.
const pieceDay = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const bogota = (value) => new Date(new Date(value).getTime() - 5 * 3600000).toISOString();
const bogotaClock = (value) => (value ? bogota(value).slice(11, 16) : null);
const bogotaStamp = (value) => (value ? `${bogota(value).slice(0, 10)} ${bogota(value).slice(11, 16)}` : null);
const monthLabel = (month, year) => `${MONTHS[month - 1]} de ${year}`;

// Las listas de Gestión solo leen la cabecera pública. Distinguirla del detalle evita exigir
// abrir un pendiente privado para poder resumir lo mismo que ya se ve en el tablero.
const taskSource = (task) => ({ kind: 'tarea_resumen', id: task.id, label: task.title, url: `/gestion?taskId=${task.id}` });
const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'INFO'];
const LEVEL_ORDER = ['red', 'yellow', 'gray', 'green'];
const fold = (value) => text(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Lo último que pidió el cliente vive en la biblioteca compartida (19 de octubre de 2026), porque también lo lee el
// mensaje para el cliente; se reexporta para quien ya lo importaba desde aquí.
export { lastClientRequest };
const referenceLinks = (item) => [...(item.assetsLinks || []), ...(Array.isArray(item.mediaUrl) ? item.mediaUrl : [item.mediaUrl])].filter(Boolean).slice(0, 10);
// El tiempo registrado de cada tarea viaja con la tarea (Rodny, 23 de octubre de 2026: Bria dio las horas de los
// trabajos de 2X Global en una respuesta y en la siguiente dijo que no las tenía). Es el mismo total que muestra el
// historial de la tarea (`getTaskElapsedMs`: lo acumulado más lo que corre ahora), así que una persona y Bria leen la
// misma cifra. Solo se añade cuando la lectura trae el reloj de la tarea.
const timeOf = (task, now) => (task.accumulatedWorkMs === undefined ? null : getTaskElapsedMs(task, now));
const compactTask = (task, today, now = new Date()) => {
  const vence = dayOf(task.dueDate);
  const ms = timeOf(task, now);
  return {
    id: task.id,
    titulo: task.title,
    estado: task.status,
    cliente: task.client?.name || null,
    responsable: task.assignee?.name || null,
    vence,
    vencida: Boolean(vence && vence < today && task.status !== 'REALIZADA'),
    privada: Boolean(task.isPrivate),
    ...(task.completedAt ? { cerrada: dayOf(task.completedAt) } : {}),
    ...(ms === null ? {} : { tiempoRegistrado: ms >= 60_000 ? formatDuration(ms) : 'sin tiempo registrado', minutosRegistrados: Math.round(ms / 60_000) })
  };
};
/** El total de tiempo de una lista de tareas, en palabras y en minutos, para que la suma la haga la plataforma. */
const timeTotal = (rows, now) => {
  const ms = rows.reduce((sum, task) => sum + (timeOf(task, now) || 0), 0);
  return { tiempoTotal: formatDuration(ms), minutosTotales: Math.round(ms / 60_000), sinTiempo: rows.filter((task) => (timeOf(task, now) || 0) < 60_000).length };
};

const buscarCliente = {
  name: 'buscar_cliente',
  description: 'Busca clientes de la agencia por parte del nombre. Devuelve id, slug, estado, community manager y project manager. Úsala antes de cualquier consulta sobre un cliente.',
  parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Parte del nombre del cliente, como lo dijo la persona' } }, required: ['nombre'] },
  allowed: () => true,
  async run({ nombre } = {}, { db }) {
    const term = text(nombre);
    if (!term) return { data: { clientes: [] } };
    const select = { id: true, name: true, slug: true, status: true, isArchived: true, responsible: { select: { name: true } }, projectManager: { select: { name: true } } };
    let rows = await db.client.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      select,
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
      take: 8
    });
    // Sin coincidencia exacta, se busca lo que se le parece: «aristia» es Aristea (Rodny, 9 de octubre de 2026).
    const approximate = rows.length === 0;
    if (approximate) {
      const all = await db.client.findMany({ select, take: 2000 });
      rows = rankByName(all, term, (row) => row.name).sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || b.score - a.score);
    }
    return {
      data: {
        clientes: rows.map((row) => ({
          id: row.id, nombre: row.name, slug: row.slug, estado: row.status, archivado: Boolean(row.isArchived),
          communityManager: row.responsible?.name || null, projectManager: row.projectManager?.name || null
        })),
        ...(approximate && rows.length ? { aproximado: true, instruccion: 'No había un cliente con ese nombre exacto; estos son los de nombre más parecido. Si el primero es claramente lo que la persona quiso decir, úsalo sin preguntar; si hay dudas entre varios, pregunta cuál.' } : {})
      }
    };
  }
};

const misTareas = {
  name: 'mis_tareas',
  description: 'Las tareas de la persona que pregunta: las que tiene como responsable y en las que colabora. Por defecto las que no están cerradas (pendientes, en proceso y devueltas).',
  parameters: { type: 'object', properties: { estado: { type: 'string', enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas'], description: '«todas» son las no cerradas' } } },
  allowed: () => true,
  async run({ estado } = {}, { db, person, today }) {
    if (!person?.memberId) return { data: { tareas: [], mensaje: 'Tu cuenta no está vinculada a una persona del equipo, así que no hay tareas que mostrar.' } };
    const rows = await db.task.findMany({
      where: { status: { in: statusesFor(estado) }, OR: [{ assigneeId: person.memberId }, { collaborators: { some: { memberId: person.memberId } } }] },
      select: { id: true, title: true, status: true, dueDate: true, focusDeadlineAt: true, priority: true, isPriority: true, isPrivate: true, client: { select: { name: true } }, assignee: { select: { name: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 50
    });
    const tareas = rows.map((task) => {
      const base = compactTask(task, today);
      return {
        id: base.id, titulo: base.titulo, estado: base.estado, cliente: base.cliente, responsable: base.responsable,
        vence: base.vence, vencida: base.vencida,
        horaCompromiso: bogotaClock(task.focusDeadlineAt),
        prioridad: task.priority || (task.isPriority ? 'Destacada' : null),
        privada: base.privada
      };
    });
    // Mis tareas también está disponible sin Gestión. Su autoría/asignación se revalida
    // con el permiso estricto de tarea; no abre cabeceras de tareas ajenas sin el módulo.
    return { data: { tareas }, sources: rows.map(task => ({ ...taskSource(task), kind: 'tarea' })) };
  }
};

const TASK_LIST_MAX = 60;
const tareasDeCliente = {
  name: 'tareas_de_cliente',
  description: 'Las tareas de Gestión de un cliente (por su id), con responsable, estado, fecha, fecha de cierre y el tiempo registrado de cada una, más el total sumado. Por defecto las no cerradas; con estado «realizadas», las cerradas. Con mes y año, solo las cerradas ese mes (los trabajos que se hicieron ese mes): úsala así para «qué se hizo para X en octubre y cuántas horas tomó». El tiempo de cada tarea es el registrado en la plataforma; no uses promedios de Ritmo para esto.',
  parameters: { type: 'object', properties: {
    clientId: { type: 'string' },
    estado: { type: 'string', enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas'] },
    mes: { type: 'integer', minimum: 1, maximum: 12, description: 'Con anio: solo las tareas cerradas ese mes.' },
    anio: { type: 'integer' }
  }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'gestion'),
  async run({ clientId, estado, mes, anio } = {}, { getTasks, user, today, now }) {
    const id = text(clientId);
    if (!id) return { data: { tareas: [], mensaje: 'Falta el id del cliente: búscalo primero con buscar_cliente.' } };
    const at = now?.() || new Date();
    const month = Number.isInteger(mes) ? `${Number.isInteger(anio) ? anio : Number(today.slice(0, 4))}-${String(mes).padStart(2, '0')}` : null;
    const wanted = new Set(statusesFor(month ? 'realizadas' : estado));
    // Misma lectura que el tablero: la reserva de los pendientes privados se aplica en el servidor.
    const all = (await getTasks(id, user?.userId || user?.id || null)).filter((task) => wanted.has(task.status) && (!month || dayOf(task.completedAt)?.startsWith(month)));
    const rows = all.slice(0, TASK_LIST_MAX);
    return {
      data: {
        ...(month ? { periodo: monthLabel(Number(month.slice(5)), Number(month.slice(0, 4))) } : {}),
        total: all.length, ...timeTotal(all, at),
        tareas: rows.map((task) => compactTask(task, today, at)),
        ...(all.length > rows.length ? { nota: `Son ${all.length}; aquí van ${rows.length}. El total de tiempo cuenta todas.` } : {}),
        instruccion: 'El tiempo de cada tarea y el total los calcula la plataforma: úsalos tal cual, sin estimar ni promediar. Si te piden lo mismo en otro formato, son estas mismas cifras.'
      },
      sources: rows.map(taskSource)
    };
  }
};

// Acciones masivas (Rodny, 11 de octubre de 2026: «Dime cuántos pendientes están sin asignar»). La misma búsqueda
// que resuelve el lote de cambiar_pendientes: lo que se cuenta aquí es lo que se cambia allá. Solo la cabecera de
// cada tarea; la reserva de los pendientes privados se aplica como en el tablero.
const SEARCH_SELECT = {
  id: true, title: true, status: true, dueDate: true, isPrivate: true, creatorId: true, completedAt: true, startedAt: true, accumulatedWorkMs: true,
  client: { select: { name: true } }, assignee: { select: { id: true, name: true, userId: true } },
  collaborators: { select: { member: { select: { userId: true } } } }, viewers: { select: { userId: true } }
};
const buscarPendientes = {
  name: 'buscar_pendientes',
  description: 'Busca tareas de Gestión por filtros combinables: responsable (nombre de la persona; se acepta mal escrito), sinResponsable (las que no tienen a nadie asignado), cliente (nombre o id), estado (pendientes, en_proceso, devueltas, realizadas; «todas» son las no cerradas) y vencidas. Devuelve el total real y hasta 50 tareas con su id, responsable, cliente, estado y fecha. Úsala para contar o listar («cuántos pendientes están sin asignar», «qué tiene vencido Jarlan»). Para cambiarlas en lote no hace falta llamarla antes: cambiar_pendientes acepta estos mismos filtros.',
  parameters: { type: 'object', properties: {
    responsable: { type: 'string', description: 'Nombre de la persona responsable, como lo dijo quien pregunta.' },
    sinResponsable: { type: 'boolean', description: 'Solo las tareas sin responsable asignado.' },
    cliente: { type: 'string', description: 'Nombre o id del cliente.' },
    estado: { type: 'string', enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas'], description: 'Sin estado, las no cerradas.' },
    vencidas: { type: 'boolean', description: 'Solo las que tienen fecha anterior a hoy y no están cerradas.' }
  } },
  allowed: (user) => hasModulePermission(user, 'gestion'),
  async run(args = {}, { db, user, today }) {
    const { total, rows, resolved, approximate, descripcion } = await searchTasks({ db, filters: args, today, select: SEARCH_SELECT });
    const viewer = user?.userId || user?.id || null;
    const tareas = rows.map(taskPrivacyFilter(viewer)).map((task) => compactTask(task, today));
    return {
      data: {
        total, descripcion, tareas, ...timeTotal(rows, new Date()),
        ...(resolved.responsable ? { responsable: resolved.responsable } : {}),
        ...(resolved.cliente ? { cliente: resolved.cliente } : {}),
        ...(approximate ? { aproximado: true, instruccion: 'No había nadie con ese nombre exacto; se buscó el más parecido. Di a quién se refiere el resultado y, si no era esa persona, pregunta.' } : {}),
        ...(total > rows.length ? { nota: `Hay ${total} en total; aquí van las ${rows.length} de fecha más próxima.` } : {})
      },
      sources: rows.map(taskSource)
    };
  }
};

const parrillaDeCliente = {
  name: 'parrilla_de_cliente',
  description: 'La parrilla de contenido de un cliente (por su id) en un mes: cada pieza con formato, fecha, estado, hasta qué etapa llegó (sin texto, redactada, diseñada, aprobada, programada, publicada), si el cliente la aprobó, lo último que el cliente pidió cambiar, si ya está en producción y con quién, y cuántas referencias tiene; el resumen cuenta piezas por formato para compararlas con el contrato. Sin mes y año, la del mes actual.',
  parameters: { type: 'object', properties: { clientId: { type: 'string' }, mes: { type: 'integer', minimum: 1, maximum: 12 }, anio: { type: 'integer' } }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'parrillas'),
  async run({ clientId, mes, anio } = {}, context) {
    const { db, today } = context;
    const id = text(clientId);
    if (!id) return { data: { parrilla: null, mensaje: 'Falta el id del cliente: búscalo primero con buscar_cliente.' } };
    const [todayYear, todayMonth] = String(today).split('-').map(Number);
    const month = Number.isInteger(Number(mes)) && mes >= 1 && mes <= 12 ? Number(mes) : todayMonth;
    const year = Number.isInteger(Number(anio)) && anio > 2000 ? Number(anio) : todayYear;
    const plan = await db.contentPlan.findFirst({
      where: { clientId: id, deletedAt: null, month, year },
      select: {
        id: true, month: true, year: true, status: true, client: { select: { name: true, slug: true } },
        contentItems: {
          where: { deletedAt: null },
          select: {
            id: true, objective: true, format: true, publishDate: true, publishTime: true, status: true, copyText: true, captionText: true, finalAssetKey: true, revisionRequestedAt: true,
            comments: true, assetsLinks: true, mediaUrl: true, _count: { select: { finalAssets: true } }, publications: { select: { status: true } },
            tasks: { where: { status: { not: 'REALIZADA' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, dueDate: true, assignee: { select: { name: true } } } }
          }
        }
      }
    });
    if (!plan) return { data: { parrilla: null, mensaje: `No hay parrilla de ${monthLabel(month, year)} para este cliente.` } };

    const items = [...(plan.contentItems || [])].sort((a, b) => String(pieceDay(a.publishDate)).localeCompare(String(pieceDay(b.publishDate))));
    const piezas = items.map((item) => {
      const facts = {
        status: item.status, copyText: item.copyText, captionText: item.captionText,
        hasFinalAsset: Boolean(item.finalAssetKey) || (item._count?.finalAssets || 0) > 0,
        hasActivePublication: (item.publications || []).some((p) => ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'].includes(p.status))
      };
      const task = item.tasks?.[0];
      const due = task ? dayOf(task.dueDate) : null;
      return {
        id: item.id, titulo: item.objective, formato: item.format, fecha: pieceDay(item.publishDate), hora: item.publishTime || null, estado: item.status,
        etapa: STAGE_LABELS[pieceStage(facts)], aprobacion: approvalState(item),
        tieneTexto: hasText(item.copyText) || hasText(item.captionText), tieneMaterial: facts.hasFinalAsset,
        pedidoDelCliente: lastClientRequest(item.comments),
        enProduccion: task ? { tareaId: task.id, responsable: task.assignee?.name || null, vence: due, estado: task.status, vencida: Boolean(due && due < today) } : null,
        referencias: referenceLinks(item).length
      };
    });
    const resumen = {
      piezas: piezas.length,
      porFormato: piezas.reduce((acc, p) => ({ ...acc, [p.formato]: (acc[p.formato] || 0) + 1 }), {}),
      sinTexto: piezas.filter((p) => !p.tieneTexto).length,
      sinMaterial: piezas.filter((p) => !p.tieneMaterial).length,
      porAprobar: piezas.filter((p) => p.aprobacion !== APPROVAL_STATES.APROBADA).length,
      devueltas: piezas.filter((p) => p.estado === 'DEVUELTO').length,
      enProduccion: piezas.filter((p) => p.enProduccion).length,
      vencidas: piezas.filter((p) => p.fecha && p.fecha < today && p.estado !== 'PUBLICADO').length
    };
    const decision = await readDecisionContext(context, [{ id, name: plan.client?.name }]);
    return {
      data: { contextoParcial: decision.partial, parrilla: { id: plan.id, clientId: id, cliente: plan.client?.name || null, mes: monthLabel(plan.month, plan.year), estado: plan.status, resumen, piezas, contexto: decision.forClient(id) } },
      sources: [...piezas.map((p) => ({ kind: 'pieza', id: p.id, label: `${p.titulo} (${shortDate(p.fecha)})`, url: `/parrillas/${plan.id}?item=${p.id}` })), ...decision.sources]
    };
  }
};

const leerPiezasDeParrilla = {
  name: 'leer_piezas_de_parrilla',
  description: 'Lee el contenido actual de una parrilla de la plataforma: objetivos, guiones internos, textos de publicación, notas, lo que el cliente pidió cambiar, enlaces de referencia y fechas. Devuelve hasta seis piezas por llamada; continúa con nextOffset. Para revisar contenido usa esta lectura después de localizar la parrilla, no documentos históricos.',
  parameters: { type: 'object', properties: { planId: { type: 'string' }, desde: { type: 'integer', minimum: 0 } }, required: ['planId'] },
  allowed: user => hasModulePermission(user, 'parrillas'),
  async run({ planId, desde = 0 }, { db }) {
    const offset = Number.isSafeInteger(desde) && desde >= 0 ? desde : 0;
    const rows = await db.contentItem.findMany({ where: { planId: text(planId), deletedAt: null, plan: { deletedAt: null } }, select: { id: true, objective: true, format: true, publishDate: true, status: true, copyText: true, captionText: true, internalNotes: true, comments: true, assetsLinks: true, mediaUrl: true, plan: { select: { id: true, strategicObjectives: true, client: { select: { name: true } } } } }, orderBy: [{ publishDate: 'asc' }, { id: 'asc' }], skip: offset, take: 7 });
    const pieces = rows.slice(0, 6), limit = value => String(value || '').slice(0, 4000);
    return { data: { source: 'platform_current', readAt: new Date().toISOString(), cliente: pieces[0]?.plan?.client?.name || null, objetivos: limit(pieces[0]?.plan?.strategicObjectives), piezas: pieces.map(row => ({ id: row.id, titulo: row.objective, formato: row.format, fecha: pieceDay(row.publishDate), estado: row.status, guion: limit(row.copyText), textoPublicacion: limit(row.captionText), notaInterna: limit(row.internalNotes), comentariosDelCliente: limit(row.comments), referencias: referenceLinks(row), textoRecortado: [row.copyText, row.captionText, row.internalNotes, row.comments].some(value => String(value || '').length > 4000) })), nextOffset: rows.length > 6 ? offset + 6 : null }, sources: pieces.map(row => ({ kind: 'pieza', id: row.id, label: row.objective, url: `/parrillas/${planId}?item=${row.id}`, authority: 'Plataforma actual' })) };
  }
};

const operacionDeCliente = {
  name: 'operacion_de_cliente',
  description: 'La operación de un cliente (por su slug): semáforo con sus motivos, contrato operativo (piezas por formato, historias por semana, jornadas por mes, notas; registrar el contrato aquí no prueba que esté firmado), avance del mes contra lo contratado, tareas abiertas y observaciones recientes del equipo. Solo administradores y project managers.',
  parameters: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  allowed: (user) => isManagerRole(user?.role),
  async run({ slug } = {}, context) {
    const { operations } = context;
    const key = text(slug);
    if (!key) return { data: { operacion: null, mensaje: 'Falta el slug del cliente: búscalo primero con buscar_cliente.' } };
    let row;
    try {
      row = await operations.getOperation(key);
    } catch (error) {
      if (error?.status === 404) return { data: { operacion: null, mensaje: 'No encontramos ese cliente.' } };
      throw error;
    }
    const current = row.cycles?.current || null;
    const contract = row.contract || null;
    const decision = await readDecisionContext(context, [row]);
    const operacion = {
      clientId: row.id, cliente: row.name, slug: row.slug, agencia: row.agency || null, complejidad: row.complexity || null, contexto: decision.forClient(row.id),
      projectManager: row.projectManager?.name || null, communityManager: row.communityManager?.name || null,
      semaforo: LEVEL_LABELS[row.evaluation?.level] || row.evaluation?.level || null,
      motivos: (row.evaluation?.reasons || []).map((reason) => reason.text),
      contrato: contract ? {
        tipo: contract.serviceType, estado: contract.status, inicio: contract.startDate, fin: contract.endDate ?? null, diaDeCorte: contract.cutDay ?? 1,
        piezasPorMes: (contract.deliverables || []).reduce((sum, d) => sum + (Number(d.quantity) || 0), 0),
        entregablesPorFormato: (contract.deliverables || []).map((d) => ({ formato: d.format, cantidad: Number(d.quantity) || 0 })),
        historiasPorSemana: contract.storiesPerWeek ?? 0, jornadasPorMes: contract.productionDays ?? 0, notas: contract.notes ?? null,
        informeMensual: Boolean(contract.monthlyReport)
      } : null,
      mesActual: current ? {
        nombre: current.label, dia: current.day, de: current.length, piezasContratadas: current.quota, piezasCreadas: current.created,
        redactadas: current.reached?.redactada ?? 0, disenadas: current.reached?.disenada ?? 0, aprobadas: current.reached?.aprobada ?? 0,
        programadas: current.reached?.programada ?? 0, publicadas: current.reached?.publicada ?? 0, vencidas: current.overdueItems ?? 0,
        informeEntregado: Boolean(current.report)
      } : null,
      tareasAbiertas: (row.openTasks || []).length,
      tareasVencidas: (row.openTasks || []).filter((task) => task.overdue).length,
      ultimaObservacion: row.latestObservation ? `${row.latestObservation.text} (${[row.latestObservation.by, row.latestObservation.date].filter(Boolean).join(', ')})` : null,
      observacionesRecientes: (row.observations || []).slice(0, 5).map((o) => `${String(o.text || '').slice(0, 400)} (${[o.by, o.date].filter(Boolean).join(', ')})`)
    };
    return { data: { operacion, contextoParcial: decision.partial }, sources: [{ kind: 'cliente', id: row.id, label: row.name, url: `/clientes/operacion/${row.slug}` }, ...decision.sources] };
  }
};

const carteraDeOperacion = {
  name: 'cartera_de_operacion',
  description: 'Todas las cuentas activas de una vez, con su semáforo y sus motivos, PM, community manager, agencia (Brain o MIO), avance del mes y tareas vencidas; las rojas primero. Úsala para «qué cuentas están en riesgo», «cómo vamos este mes» o para ver la carga de un PM. Filtros opcionales por semáforo, agencia o responsable. Solo administradores y project managers.',
  parameters: { type: 'object', properties: {
    semaforo: { type: ['string', 'null'], enum: ['rojo', 'amarillo', 'verde', 'gris', null] },
    agencia: { type: ['string', 'null'], description: 'BRAIN o MIO' },
    responsable: { type: ['string', 'null'], description: 'Parte del nombre del PM o del community manager' }
  } },
  allowed: (user) => isManagerRole(user?.role),
  async run({ semaforo = null, agencia = null, responsable = null } = {}, context) {
    const { operations } = context;
    const rows = await operations.listOperations();
    const wantedLevel = Object.entries(LEVEL_LABELS).find(([, label]) => label === semaforo)?.[0] || null;
    const who = fold(responsable);
    const eligible = rows
      .filter((row) => !wantedLevel || row.evaluation?.level === wantedLevel)
      .filter((row) => !agencia || fold(row.agency) === fold(agencia))
      .filter((row) => !who || [row.projectManager?.name, row.communityManager?.name].some((name) => fold(name).includes(who)))
      .sort((a, b) => LEVEL_ORDER.indexOf(a.evaluation?.level) - LEVEL_ORDER.indexOf(b.evaluation?.level) || String(a.name).localeCompare(String(b.name), 'es'));
    const selected = eligible.slice(0, 60);
    const decision = await readDecisionContext(context, selected);
    const cuentas = selected.map((row) => {
        const current = row.cycles?.current;
        return {
          clientId: row.id, cliente: row.name, slug: row.slug, agencia: row.agency || null,
          contrato: decisionContract(row.contract), contexto: decision.forClient(row.id),
          projectManager: row.projectManager?.name || null, communityManager: row.communityManager?.name || null,
          semaforo: LEVEL_LABELS[row.evaluation?.level] || null,
          motivos: (row.evaluation?.reasons || []).slice(0, 2).map((reason) => reason.text),
          mesActual: current ? { nombre: current.label, contratadas: current.quota ?? 0, creadas: current.created ?? 0, aprobadas: current.reached?.aprobada ?? 0, publicadas: current.reached?.publicada ?? 0, vencidas: current.overdueItems ?? 0 } : null,
          tareasVencidas: (row.openTasks || []).filter((task) => task.overdue).length
        };
      });
    const porSemaforo = { rojo: 0, amarillo: 0, verde: 0, gris: 0 };
    for (const row of rows) { const label = LEVEL_LABELS[row.evaluation?.level]; if (label in porSemaforo) porSemaforo[label] += 1; }
    return { data: { cuentas, porSemaforo, total: rows.length, parcial: eligible.length > cuentas.length, contextoParcial: decision.partial, alcance: 'Semáforos y fechas registrados. Contrasta contrato, periodo y contexto de cada cuenta antes de atribuir incumplimiento o recomendar prioridad.' }, sources: [...cuentas.map((row) => ({ kind: 'cliente', id: row.clientId, label: row.cliente, url: `/clientes/operacion/${row.slug}` })), ...decision.sources] };
  }
};

const criteriosYHallazgos = {
  name: 'criterios_y_hallazgos',
  description: 'Los criterios editoriales que el equipo aprobó para un cliente (y los propios de una parrilla, si das su planId) y los hallazgos abiertos de la revisión automática de esa parrilla. Úsala siempre antes de revisar o proponer contenido: revisa contra estos criterios, no contra un criterio propio. Las propuestas sin aprobar no aparecen.',
  parameters: { type: 'object', properties: { clientId: { type: 'string' }, planId: { type: ['string', 'null'] } }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'parrillas'),
  async run({ clientId, planId = null } = {}, { db }) {
    const client = text(clientId), plan = text(planId);
    if (!client) return { data: { criterios: [], hallazgosAbiertos: [], mensaje: 'Falta el id del cliente: búscalo primero con buscar_cliente.' } };
    const criteria = await db.clientEditorialCriterion.findMany({
      where: { clientId: client, status: 'APPROVED', ...(plan ? { OR: [{ scope: 'CLIENT' }, { scope: 'PLAN', sourcePlanId: plan }] } : { scope: 'CLIENT' }) },
      select: { id: true, category: true, text: true, scope: true, version: true }, orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }], take: 60
    });
    const findings = plan ? await db.contentPlanReviewFinding.findMany({
      where: { planId: plan, status: 'OPEN' },
      select: { id: true, itemId: true, severity: true, category: true, title: true, detail: true, recommendation: true }, take: 30
    }) : [];
    return {
      data: {
        criterios: criteria.map((row) => ({ categoria: row.category, criterio: row.text, alcance: row.scope === 'PLAN' ? 'esta parrilla' : 'cliente', version: row.version })),
        hallazgosAbiertos: [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
          .map((row) => ({ piezaId: row.itemId || null, gravedad: row.severity, categoria: row.category, titulo: row.title, detalle: String(row.detail || '').slice(0, 500), recomendacion: String(row.recommendation || '').slice(0, 500) }))
      },
      sources: findings.filter((row) => row.itemId).map((row) => ({ kind: 'pieza', id: row.itemId, label: row.title, url: `/parrillas/${plan}?item=${row.itemId}` }))
    };
  }
};

const memoriaDeReuniones = {
  name: 'memoria_de_reuniones',
  description: 'Busca en la memoria de reuniones de la agencia (minutas de Fireflies: resúmenes, decisiones y transcripciones) lo que se dijo sobre un tema o un cliente. Devuelve fragmentos literales con su reunión y fecha.',
  parameters: { type: 'object', properties: { consulta: { type: 'string', description: 'Qué buscar, con las palabras del tema' }, clientId: { type: 'string' } }, required: ['consulta'] },
  // La misma puerta que el panel de memoria en Manager.
  allowed: (user) => hasModulePermission(user, 'manager') && isManagerRole(user?.role),
  async run({ consulta, clientId } = {}, { searchMemory }) {
    const query = text(consulta);
    if (!query) return { data: { fragmentos: [] } };
    const rows = await searchMemory({ query, limit: 5, clientId: text(clientId) || null, includeUnscoped: true });
    return {
      data: { fragmentos: rows.map((row) => ({ reunion: row.title, fecha: row.subtitle || null, seccion: row.section, texto: String(row.content || '').slice(0, 1200) })) },
      sources: rows.map((row) => ({ kind: 'minuta', id: row.sourceRecordId, label: row.title, url: row.sourceUrl || '/minutas' }))
    };
  }
};

// Ritmo del equipo (Rodny, 9 de octubre de 2026: «necesito que Bria pueda responder eso pero también necesito esos
// análisis ya en el servidor»). Lee el mismo cálculo que la pestaña Ritmo de Manager, con su misma puerta.
const ritmoDelEquipo = {
  name: 'ritmo_del_equipo',
  description: 'Cuánto tarda cada persona por tipo de trabajo, cliente y complejidad: promedio, mediana, percentil 75, muestra y cobertura. También horas cronometradas y declaradas por día y semana, y hallazgos para revisar. Reel, Post, Carrusel y crear Parrilla son trabajos distintos. Úsala cuando pregunten cuánto tarda alguien para un cliente, cómo usa sus horas o por qué una tarea tomó tanto.',
  parameters: { type: 'object', properties: {
    persona: { type: 'string', description: 'Nombre de la persona, si preguntan por alguien. Vacío para todo el equipo.' },
    cliente: { type: 'string', description: 'Cliente cuyo historial se quiere comparar. Vacío para todos.' },
    tipo: { type: 'string', description: 'Reel, Post, Carrusel, Video, Historia, Parrilla u otro tipo de trabajo. Vacío para todos.' },
    complejidad: { type: 'string', description: 'BAJA, MEDIA o ALTA; vacío para todas. Clasificación orientativa.' },
    dias: { type: 'integer', enum: [7, 30, 90], description: 'Periodo: 30 por defecto.' }
  } },
  allowed: (user) => hasModulePermission(user, 'manager') && isManagerRole(user?.role),
  async run({ persona, dias, cliente, tipo, complejidad } = {}, { rhythm }) {
    const out = await rhythm.get({ days: Number(dias) || 30 });
    const wanted = fold(persona).split(/\s+/).filter(Boolean);
    const people = wanted.length ? out.people.filter((p) => wanted.every((word) => fold(p.personName).includes(word))) : out.people;
    const pct = (value) => `${Math.round(value * 100)} %`;
    const contexts = (out.profiles || []).filter(p => (!wanted.length || people.some(person => person.personId === p.personId)) &&
      (!cliente || fold(p.clientName).includes(fold(cliente))) && (!tipo || fold(p.workType) === fold(tipo)) && (!complejidad || fold(p.complexity) === fold(complejidad)));
    return {
      data: {
        periodo: `${out.period.days} días`,
        equipo: { cerradas: out.team.closed, medidas: out.team.measured, cobertura: pct(out.team.coverage) },
        personas: people.slice(0, wanted.length ? 3 : 20).map((p) => ({
          nombre: p.personName, cerradas: p.closed, medidas: p.measured, cobertura: pct(p.coverage),
          porTipo: p.byType.slice(0, 8).map((t) => ({ tipo: t.workType, medidas: t.measured, medianaRegistrada: formatDuration(t.medianMs), rangoRegistrado: `${formatDuration(t.minMs)} a ${formatDuration(t.maxMs)}`, soloRegistro: true })),
          hallazgos: p.findings.map((f) => ({ texto: f.message, tareas: f.taskIds.slice(0, 5).map((id) => out.tasks[id]?.title).filter(Boolean) }))
        })),
        porContexto: contexts.slice(0,30).map(p => ({ persona: p.personName, trabajo: p.workType, cliente: p.clientName, complejidad: p.complexity || 'sin clasificar', medidas: p.measured, cerradas: p.closed,
          soloRegistro: Boolean(profilePredictionProblem(p)), promedioRegistrado: p.measured ? formatDuration(p.meanMs) : null,
          habitual: profilePredictionProblem(p) ? null : formatDuration(p.medianMs), conMargen: profilePredictionProblem(p) ? null : formatDuration(p.p75Ms) })),
        contextosRestantes: Math.max(0, contexts.length - 30),
        horasRegistradas: (out.hours || []).filter(p => !wanted.length || people.some(person => person.personId === p.personId)).slice(0,20).map(p => ({ nombre: p.personName,
          dias: p.days.slice(-14).map(d => ({ fecha: d.day, cronometrado: formatDuration(d.measuredMs), declarado: formatDuration(d.declaredMs) })),
          semanas: p.weeks.slice(-13).map(w => ({ desde: w.week, cronometrado: formatDuration(w.measuredMs), declarado: formatDuration(w.declaredMs) })) })),
        horasParciales: Boolean(out.hoursIncomplete),
        instruccion: 'Para anticipar cuánto tardaría alguien usa solo porContexto con soloRegistro=false y el mismo tipo, persona, cliente y complejidad. Los valores null no se rellenan: falta base comparable. porTipo y promedioRegistrado describen lo que ocurrió; nunca sirven para predecir una tarea nueva ni comparar personas. Las horas registradas corresponden a la fecha real de las sesiones; el declarado va aparte. La complejidad es orientativa. Di la cobertura antes de sacar conclusiones y no leas como rápido lo que no se midió. Los hallazgos son preguntas para revisar, nunca juicios. «Operaciones & Reuniones» y «Marketing & Social Media» mezclan trabajos distintos y no se comparan. Si nadie coincide con el nombre, dilo.'
      },
      sources: [{ kind: 'ritmo', id: `ritmo-${out.period.days}`, label: 'Ritmo del equipo', url: '/manager?tab=ritmo' }]
    };
  }
};

// Mapa de carga (Rodny, 10 de octubre de 2026, Fase A de Ritmo): quién está saturado y quién tiene espacio en los
// próximos días hábiles, con lo comprometido según las tareas abiertas y lo que suele tomar cada tipo de trabajo.
const cargaDelEquipo = {
  name: 'carga_del_equipo',
  description: 'Previsión de cumplimiento para hoy, mañana, esta semana o la próxima: trabajo pendiente por persona y contexto frente a capacidad hasta el vencimiento y hora de publicación, con historial suficiente o débil. Incluye tareas en riesgo, vencidas y sin fecha. Úsala para anticipar entregas, decidir apoyo o revisar quién puede recibir trabajo. No ofrece probabilidades calibradas.',
  parameters: { type: 'object', properties: {
    persona: { type: 'string', description: 'Nombre de la persona, si preguntan por alguien. Vacío para todo el equipo.' },
    horizonte: { type: 'string', description: 'hoy, manana, semana o proxima_semana. Por defecto semana.' }
  } },
  allowed: (user) => hasModulePermission(user, 'manager') && isManagerRole(user?.role),
  async run({ persona, horizonte } = {}, { load }) {
    const window = { hoy: 'today', manana: 'tomorrow', semana: 'week', proxima_semana: 'next_week' }[fold(horizonte)] || 'week';
    const map = await load.get({ window });
    const reliablePolicy = map.forecast?.policy === RHYTHM_POLICY;
    const estimated = ms => reliablePolicy && ms != null ? formatDuration(ms) : null;
    const wanted = fold(persona).split(/\s+/).filter(Boolean);
    const people = wanted.length ? map.people.filter((p) => wanted.every((word) => fold(p.personName).includes(word))) : map.people;
    // Con el día de la semana: «el 19 de octubre» a secas se leyó como si fuera hoy (Rodny, 10 de octubre de 2026).
    const dayName = (day) => { const date = new Date(`${day}T12:00:00Z`); const [y, m, d] = day.split('-').map(Number); return `${WEEKDAYS[date.getUTCDay()]} ${d} de ${MONTHS[m - 1]}${y !== Number(map.today.slice(0, 4)) ? ` de ${y}` : ''}`; };
    // Sin la capacidad del periodo, 11 h en 10 días hábiles se leyó como «la mayor carga». Cada persona dice
    // qué parte de su tiempo tiene comprometida, y el equipo dice cuánto quedó fuera por no tener fecha.
    const periodMs = reliablePolicy ? map.forecast.capacityMs ?? map.forecast.people[0]?.capacityMs : null;
    const predictionFor = personId => reliablePolicy ? map.forecast.people.find(p => p.personId === personId) : null;
    const pct = ms => ms == null || !(periodMs > 0) ? null : `${Math.round(ms / periodMs * 100)} %`;
    const busiest = reliablePolicy && !map.forecast.incomplete && map.forecast.people.every(p => p.remainingMs != null) ? Math.max(0, ...map.forecast.people.map(p => p.remainingMs)) : null;
    return {
      data: {
        hoy: dayName(map.today),
        diasHabiles: reliablePolicy ? map.forecast.days.length : map.days.length,
        jornada: formatDuration(map.capacityMs),
        capacidadDelPeriodo: periodMs == null ? null : formatDuration(periodMs),
        equipo: {
          personas: map.people.length,
          ocupacionMaxima: pct(busiest),
          lectura: reliablePolicy ? `${map.forecast.incomplete ? 'Consulta incompleta; espacio sin confirmar.' : `${map.forecast.people.filter(p => p.canReceive).length} personas con espacio estimado según los límites de entrega.`} Lee la previsión y su confianza antes de proponer asignaciones.` : 'No hay una previsión validada: solo se pueden describir pendientes y fechas.',
          tareasVencidas: map.people.reduce((n, p) => n + p.overdue.count, 0),
          tareasSinFecha: map.people.reduce((n, p) => n + p.undated.count, 0)
        },
        personas: people.slice(0, wanted.length ? 3 : 20).map((p) => ({
          nombre: p.personName,
          horasComprometidas: estimated(predictionFor(p.personId)?.remainingMs),
          ocupacion: pct(predictionFor(p.personId)?.remainingMs),
          vencidas: p.overdue.count, sinFecha: p.undated.count,
          dias: p.cells.filter((c) => c.count > 0).map((c) => ({
            dia: dayName(c.day), horas: estimated(c.ms), nivel: reliablePolicy ? c.level : 'sin_datos', tareas: c.tasks.slice(0, 6).map((t) => `${t.title}${t.clientName ? ` (${t.clientName})` : ''} · ${estimated(t.ms) || 'sin estimación comparable'}`)
          }))
        })),
        senales: reliablePolicy ? map.signals.filter((s) => !wanted.length || people.some((p) => p.personId === s.personId)).map((s) => s.message) : [],
        ...(reliablePolicy ? { prevision: {
          dias: map.forecast.days.map(dayName), consultaIncompleta: map.forecast.incomplete,
          supuesto: 'Jornada nominal de 8 h; hoy se prorratea entre 8:00 y 18:00. Sin reuniones ni ausencias descontadas. No garantiza una entrega.',
          personas: map.forecast.people.filter(p => !wanted.length || people.some(visible => visible.personId === p.personId)).slice(0, wanted.length ? 3 : 20).map(p => ({
            nombre: p.personName, trabajoRestante: p.remainingMs == null ? null : `${formatDuration(p.remainingMs)} a ${formatDuration(p.upperMs)}`, capacidad: formatDuration(p.capacityMs),
            historial: p.confidence, puedeRecibir: p.canReceive, vencidas: p.overdueCount, enRiesgo: p.riskCount, ajustadas: p.tightCount, sinFecha: p.undatedCount, sinEstimacion: p.unknownCount,
            horasCronometradasHoy: formatDuration(p.recordedTodayMs || 0), horasCronometradasSemana: formatDuration(p.recordedWeekMs || 0),
            tareas: p.tasks.filter(t => t.risk !== 'ok').slice(0, 6).map(t => ({ id: t.id, titulo: t.title, fecha: t.dueDay ? dayName(t.dueDay) : null, limite: t.deadlineAt || null,
              estado: t.risk || 'sin_prevision', restante: t.remainingMs == null ? null : formatDuration(t.remainingMs), muestra: t.sample, alcanceMuestra: t.basis, complejidad: t.complexity, colaCompleta: t.queueComplete, capacidadHastaElLimite: t.capacityToDeadlineMs == null ? null : formatDuration(t.capacityToDeadlineMs) }))
          }))
        } } : {}),
        instruccion: 'Empieza por la prevision validada. Un valor null significa que no se sabe, nunca cero minutos ni una hora supuesta. No derives tiempos futuros de otros clientes, categorías generales, ni del promedio del equipo. El mapa solo muestra concentración de entregas, no demuestra saturación ni espacio libre. No afirmes que alguien puede recibir trabajo si puedeRecibir es false o falta parte de la cola. La capacidad es nominal y no descuenta reuniones ni ausencias. Sin previsión, describe únicamente tareas y fechas. Habla de trabajo, nunca de desempeño. Si nadie coincide con el nombre, dilo.'
      },
      sources: [{ kind: 'ritmo', id: `carga-${map.today}`, label: 'Mapa de carga', url: '/manager?tab=ritmo' }]
    };
  }
};

const publicacionesProgramadas = {
  name: 'publicaciones_programadas',
  description: 'Las publicaciones en redes (Instagram y Facebook) programadas para los próximos días, con cliente, cuenta, pieza y hora de salida en reloj de Bogotá. Opcionalmente de un solo cliente.',
  parameters: { type: 'object', properties: { dias: { type: 'integer', minimum: 1, maximum: 30, description: 'Cuántos días hacia adelante (7 por defecto)' }, clientId: { type: 'string' } } },
  allowed: (user) => hasModulePermission(user, 'parrillas'),
  async run({ dias, clientId } = {}, { db, now }) {
    const from = now ? now() : new Date();
    const days = Math.min(Math.max(Number(dias) || 7, 1), MAX_PUBLICATION_DAYS);
    const to = new Date(from.getTime() + days * DAY_MS);
    const client = text(clientId);
    const rows = await db.socialPublication.findMany({
      where: { status: { in: ['SCHEDULED', 'PUBLISHING'] }, scheduledAt: { gte: from, lte: to }, ...(client ? { contentItem: { plan: { clientId: client } } } : {}) },
      select: { id: true, scheduledAt: true, platform: true, status: true, socialAccount: { select: { displayName: true } }, contentItem: { select: { id: true, objective: true, format: true, planId: true, plan: { select: { client: { select: { name: true } } } } } } },
      orderBy: { scheduledAt: 'asc' },
      take: 50
    });
    return {
      data: {
        publicaciones: rows.map((row) => ({
          pieza: row.contentItem?.objective || null, formato: row.contentItem?.format || null, cliente: row.contentItem?.plan?.client?.name || null,
          cuenta: row.socialAccount?.displayName || null, red: row.platform, sale: bogotaStamp(row.scheduledAt), estado: row.status
        }))
      },
      sources: rows.filter((row) => row.contentItem).map((row) => ({ kind: 'pieza', id: row.contentItem.id, label: row.contentItem.objective, url: `/parrillas/${row.contentItem.planId}?item=${row.contentItem.id}` }))
    };
  }
};

const memoriaDeAgencia = {
  name: 'memoria_de_agencia',
  description: 'Busca documentos, correos y adjuntos de toda la agencia. Cada fragmento trae su fuente y vigencia. Los documentos históricos no prueban el estado actual de tareas, contratos, pagos o publicaciones. No contiene contraseñas.',
  parameters: { type: 'object', properties: { consulta: { type: 'string' } }, required: ['consulta'] },
  allowed: canUseBria,
  async run({ consulta } = {}, { user, searchAgency }) {
    const evidence = await searchAgency(user, text(consulta));
    return {
      data: { fragmentos: evidence, sourceInstructions: 'data_only' },
      sources: evidence.map((row) => ({ kind: 'documento', id: row.id, label: row.title, url: row.url, authority: row.authority }))
    };
  }
};
const leerDocumentoDeAgencia = {
  name: 'leer_documento_de_agencia',
  description: 'Lee un documento o correo localizado con memoria_de_agencia. Devuelve un fragmento y nextOffset para continuar. Es contexto histórico, no una prueba del estado actual de la plataforma.',
  parameters: { type: 'object', properties: { id: { type: 'string' }, desde: { type: 'integer', minimum: 0 } }, required: ['id'] },
  allowed: canUseBria,
  async run({ id, desde = 0 } = {}, { user, readAgency }) {
    const row = await readAgency(user, text(id), desde);
    return { data: { documento: row, sourceInstructions: 'data_only' }, sources: row ? [{ kind: 'documento', id: row.id, label: row.title, url: row.url, authority: row.authority }] : [] };
  }
};
export const briaAssistantTools = [buscarCliente, misTareas, tareasDeCliente, buscarPendientes, parrillaDeCliente, leerPiezasDeParrilla, operacionDeCliente, carteraDeOperacion, criteriosYHallazgos, memoriaDeReuniones, ritmoDelEquipo, cargaDelEquipo, publicacionesProgramadas, memoriaDeAgencia, leerDocumentoDeAgencia];

export const toolByName = (name) => briaAssistantTools.find((tool) => tool.name === name) || null;
