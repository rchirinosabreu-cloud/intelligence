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
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { canUseBria } from '../lib/briaLivingMemory.js';

const OPEN_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const STATUS_FILTERS = {
  pendientes: ['PENDIENTE'],
  en_proceso: ['EN_CURSO'],
  devueltas: ['DEVUELTA'],
  realizadas: ['REALIZADA'],
  todas: OPEN_STATUSES
};
const STAGE_LABELS = ['sin texto', 'redactada', 'diseñada', 'aprobada', 'programada', 'publicada'];
const LEVEL_LABELS = { red: 'rojo', yellow: 'amarillo', green: 'verde', gray: 'gris' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
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
const statusesFor = (estado) => STATUS_FILTERS[String(estado || 'todas').toLowerCase()] || OPEN_STATUSES;

const taskSource = (task) => ({ kind: 'tarea', id: task.id, label: task.title, url: `/gestion?taskId=${task.id}` });
const compactTask = (task, today) => {
  const vence = dayOf(task.dueDate);
  return {
    id: task.id,
    titulo: task.title,
    estado: task.status,
    cliente: task.client?.name || null,
    responsable: task.assignee?.name || null,
    vence,
    vencida: Boolean(vence && vence < today && task.status !== 'REALIZADA'),
    privada: Boolean(task.isPrivate)
  };
};

const buscarCliente = {
  name: 'buscar_cliente',
  description: 'Busca clientes de la agencia por parte del nombre. Devuelve id, slug, estado, community manager y project manager. Úsala antes de cualquier consulta sobre un cliente.',
  parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Parte del nombre del cliente, como lo dijo la persona' } }, required: ['nombre'] },
  allowed: () => true,
  async run({ nombre } = {}, { db }) {
    const term = text(nombre);
    if (!term) return { data: { clientes: [] } };
    const rows = await db.client.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, slug: true, status: true, isArchived: true, responsible: { select: { name: true } }, projectManager: { select: { name: true } } },
      orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
      take: 8
    });
    return {
      data: {
        clientes: rows.map((row) => ({
          id: row.id, nombre: row.name, slug: row.slug, estado: row.status, archivado: Boolean(row.isArchived),
          communityManager: row.responsible?.name || null, projectManager: row.projectManager?.name || null
        }))
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
    return { data: { tareas }, sources: rows.map(taskSource) };
  }
};

const tareasDeCliente = {
  name: 'tareas_de_cliente',
  description: 'Las tareas de Gestión de un cliente (por su id), con responsable, estado y fecha. Por defecto las no cerradas; con estado «realizadas», las últimas cerradas.',
  parameters: { type: 'object', properties: { clientId: { type: 'string' }, estado: { type: 'string', enum: ['pendientes', 'en_proceso', 'devueltas', 'realizadas', 'todas'] } }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'gestion'),
  async run({ clientId, estado } = {}, { getTasks, user, today }) {
    const id = text(clientId);
    if (!id) return { data: { tareas: [], mensaje: 'Falta el id del cliente: búscalo primero con buscar_cliente.' } };
    const wanted = new Set(statusesFor(estado));
    // Misma lectura que el tablero: la reserva de los pendientes privados se aplica en el servidor.
    const rows = (await getTasks(id, user?.userId || user?.id || null)).filter((task) => wanted.has(task.status)).slice(0, 40);
    return { data: { tareas: rows.map((task) => compactTask(task, today)) }, sources: rows.map(taskSource) };
  }
};

const parrillaDeCliente = {
  name: 'parrilla_de_cliente',
  description: 'La parrilla de contenido de un cliente (por su id) en un mes: cada pieza con formato, fecha, estado, hasta qué etapa llegó (sin texto, redactada, diseñada, aprobada, programada, publicada) y si el cliente la aprobó. Sin mes y año, la del mes actual.',
  parameters: { type: 'object', properties: { clientId: { type: 'string' }, mes: { type: 'integer', minimum: 1, maximum: 12 }, anio: { type: 'integer' } }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'parrillas'),
  async run({ clientId, mes, anio } = {}, { db, today }) {
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
          select: { id: true, objective: true, format: true, publishDate: true, publishTime: true, status: true, copyText: true, captionText: true, finalAssetKey: true, revisionRequestedAt: true, _count: { select: { finalAssets: true } }, publications: { select: { status: true } } }
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
      return {
        id: item.id, titulo: item.objective, formato: item.format, fecha: pieceDay(item.publishDate), hora: item.publishTime || null, estado: item.status,
        etapa: STAGE_LABELS[pieceStage(facts)], aprobacion: approvalState(item),
        tieneTexto: hasText(item.copyText) || hasText(item.captionText), tieneMaterial: facts.hasFinalAsset
      };
    });
    const resumen = {
      piezas: piezas.length,
      sinTexto: piezas.filter((p) => !p.tieneTexto).length,
      sinMaterial: piezas.filter((p) => !p.tieneMaterial).length,
      porAprobar: piezas.filter((p) => p.aprobacion !== APPROVAL_STATES.APROBADA).length,
      vencidas: piezas.filter((p) => p.fecha && p.fecha < today && p.estado !== 'PUBLICADO').length
    };
    return {
      data: { parrilla: { id: plan.id, cliente: plan.client?.name || null, mes: monthLabel(plan.month, plan.year), estado: plan.status, resumen, piezas } },
      sources: piezas.map((p) => ({ kind: 'pieza', id: p.id, label: `${p.titulo} (${shortDate(p.fecha)})`, url: `/parrillas/${plan.id}?item=${p.id}` }))
    };
  }
};

const leerPiezasDeParrilla = {
  name: 'leer_piezas_de_parrilla',
  description: 'Lee el contenido actual de una parrilla de la plataforma: objetivos, guiones internos, textos de publicación, notas y fechas. Devuelve hasta seis piezas por llamada; continúa con nextOffset. Para revisar contenido usa esta lectura después de localizar la parrilla, no documentos históricos.',
  parameters: { type: 'object', properties: { planId: { type: 'string' }, desde: { type: 'integer', minimum: 0 } }, required: ['planId'] },
  allowed: user => hasModulePermission(user, 'parrillas'),
  async run({ planId, desde = 0 }, { db }) {
    const offset = Number.isSafeInteger(desde) && desde >= 0 ? desde : 0;
    const rows = await db.contentItem.findMany({ where: { planId: text(planId), deletedAt: null, plan: { deletedAt: null } }, select: { id: true, objective: true, format: true, publishDate: true, status: true, copyText: true, captionText: true, internalNotes: true, plan: { select: { id: true, strategicObjectives: true, client: { select: { name: true } } } } }, orderBy: [{ publishDate: 'asc' }, { id: 'asc' }], skip: offset, take: 7 });
    const pieces = rows.slice(0, 6), limit = value => String(value || '').slice(0, 4000);
    return { data: { source: 'platform_current', readAt: new Date().toISOString(), cliente: pieces[0]?.plan?.client?.name || null, objetivos: limit(pieces[0]?.plan?.strategicObjectives), piezas: pieces.map(row => ({ id: row.id, titulo: row.objective, formato: row.format, fecha: pieceDay(row.publishDate), estado: row.status, guion: limit(row.copyText), textoPublicacion: limit(row.captionText), notaInterna: limit(row.internalNotes), textoRecortado: [row.copyText, row.captionText, row.internalNotes].some(value => String(value || '').length > 4000) })), nextOffset: rows.length > 6 ? offset + 6 : null }, sources: pieces.map(row => ({ kind: 'pieza', id: row.id, label: row.objective, url: `/parrillas/${planId}?item=${row.id}`, authority: 'Plataforma actual' })) };
  }
};

const operacionDeCliente = {
  name: 'operacion_de_cliente',
  description: 'La operación de un cliente (por su slug): semáforo con sus motivos, contrato vigente, avance del mes contra lo contratado, tareas abiertas y última observación del equipo. Solo administradores y project managers.',
  parameters: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
  allowed: (user) => isManagerRole(user?.role),
  async run({ slug } = {}, { operations }) {
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
    const operacion = {
      cliente: row.name, slug: row.slug, agencia: row.agency || null, complejidad: row.complexity || null,
      projectManager: row.projectManager?.name || null, communityManager: row.communityManager?.name || null,
      semaforo: LEVEL_LABELS[row.evaluation?.level] || row.evaluation?.level || null,
      motivos: (row.evaluation?.reasons || []).map((reason) => reason.text),
      contrato: contract ? {
        tipo: contract.serviceType, estado: contract.status, inicio: contract.startDate, fin: contract.endDate ?? null, diaDeCorte: contract.cutDay ?? 1,
        piezasPorMes: (contract.deliverables || []).reduce((sum, d) => sum + (Number(d.quantity) || 0), 0), informeMensual: Boolean(contract.monthlyReport)
      } : null,
      mesActual: current ? {
        nombre: current.label, dia: current.day, de: current.length, piezasContratadas: current.quota, piezasCreadas: current.created,
        redactadas: current.reached?.redactada ?? 0, disenadas: current.reached?.disenada ?? 0, aprobadas: current.reached?.aprobada ?? 0,
        programadas: current.reached?.programada ?? 0, publicadas: current.reached?.publicada ?? 0, vencidas: current.overdueItems ?? 0,
        informeEntregado: Boolean(current.report)
      } : null,
      tareasAbiertas: (row.openTasks || []).length,
      tareasVencidas: (row.openTasks || []).filter((task) => task.overdue).length,
      ultimaObservacion: row.latestObservation ? `${row.latestObservation.text} (${[row.latestObservation.by, row.latestObservation.date].filter(Boolean).join(', ')})` : null
    };
    return { data: { operacion }, sources: [{ kind: 'cliente', id: row.id, label: row.name, url: `/clientes/operacion/${row.slug}` }] };
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
export const briaAssistantTools = [buscarCliente, misTareas, tareasDeCliente, parrillaDeCliente, leerPiezasDeParrilla, operacionDeCliente, memoriaDeReuniones, publicacionesProgramadas, memoriaDeAgencia, leerDocumentoDeAgencia];

export const toolByName = (name) => briaAssistantTools.find((tool) => tool.name === name) || null;
