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
import { rankByName } from '../lib/fuzzyMatch.js';
import { formatDuration } from '../lib/teamRhythm.js';

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
const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'INFO'];
const LEVEL_ORDER = ['red', 'yellow', 'gray', 'green'];
const fold = (value) => text(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// El portal escribe cada pedido del cliente al final de `comments` como «[Cliente - dd/mm/aaaa]: texto»
// (`addClientComment`). Lo último que pidió es lo que producción tiene que atender.
export const lastClientRequest = (comments) => {
  const matches = [...String(comments || '').matchAll(/\[Cliente - ([^\]]+)\]:\s*([\s\S]*?)(?=\n\n\[Cliente - |$)/g)];
  const last = matches.at(-1);
  return last ? { fecha: last[1].trim(), texto: last[2].trim().slice(0, 600) } : null;
};
const referenceLinks = (item) => [...(item.assetsLinks || []), ...(Array.isArray(item.mediaUrl) ? item.mediaUrl : [item.mediaUrl])].filter(Boolean).slice(0, 10);
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
  description: 'La parrilla de contenido de un cliente (por su id) en un mes: cada pieza con formato, fecha, estado, hasta qué etapa llegó (sin texto, redactada, diseñada, aprobada, programada, publicada), si el cliente la aprobó, lo último que el cliente pidió cambiar, si ya está en producción y con quién, y cuántas referencias tiene; el resumen cuenta piezas por formato para compararlas con el contrato. Sin mes y año, la del mes actual.',
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
    return {
      data: { parrilla: { id: plan.id, cliente: plan.client?.name || null, mes: monthLabel(plan.month, plan.year), estado: plan.status, resumen, piezas } },
      sources: piezas.map((p) => ({ kind: 'pieza', id: p.id, label: `${p.titulo} (${shortDate(p.fecha)})`, url: `/parrillas/${plan.id}?item=${p.id}` }))
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
    return { data: { operacion }, sources: [{ kind: 'cliente', id: row.id, label: row.name, url: `/clientes/operacion/${row.slug}` }] };
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
  async run({ semaforo = null, agencia = null, responsable = null } = {}, { operations }) {
    const rows = await operations.listOperations();
    const wantedLevel = Object.entries(LEVEL_LABELS).find(([, label]) => label === semaforo)?.[0] || null;
    const who = fold(responsable);
    const cuentas = rows
      .filter((row) => !wantedLevel || row.evaluation?.level === wantedLevel)
      .filter((row) => !agencia || fold(row.agency) === fold(agencia))
      .filter((row) => !who || [row.projectManager?.name, row.communityManager?.name].some((name) => fold(name).includes(who)))
      .sort((a, b) => LEVEL_ORDER.indexOf(a.evaluation?.level) - LEVEL_ORDER.indexOf(b.evaluation?.level) || String(a.name).localeCompare(String(b.name), 'es'))
      .slice(0, 60)
      .map((row) => {
        const current = row.cycles?.current;
        return {
          cliente: row.name, slug: row.slug, agencia: row.agency || null,
          projectManager: row.projectManager?.name || null, communityManager: row.communityManager?.name || null,
          semaforo: LEVEL_LABELS[row.evaluation?.level] || null,
          motivos: (row.evaluation?.reasons || []).slice(0, 2).map((reason) => reason.text),
          mesActual: current ? { contratadas: current.quota ?? 0, creadas: current.created ?? 0, aprobadas: current.reached?.aprobada ?? 0, publicadas: current.reached?.publicada ?? 0, vencidas: current.overdueItems ?? 0 } : null,
          tareasVencidas: (row.openTasks || []).filter((task) => task.overdue).length
        };
      });
    const porSemaforo = { rojo: 0, amarillo: 0, verde: 0, gris: 0 };
    for (const row of rows) { const label = LEVEL_LABELS[row.evaluation?.level]; if (label in porSemaforo) porSemaforo[label] += 1; }
    return { data: { cuentas, porSemaforo, total: rows.length }, sources: cuentas.map((row) => ({ kind: 'cliente', id: row.slug, label: row.cliente, url: `/clientes/operacion/${row.slug}` })) };
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
  description: 'Cuánto tarda cada persona del equipo por tipo de trabajo (Reel, Post, Carrusel, publicación, diseño…) según el cronómetro de sus tareas cerradas: cuánto de lo cerrado tiene tiempo medido, mediana y rango por tipo, comparación con el resto del equipo y hallazgos para revisar (tareas fuera de lo habitual, días largos, retrabajo, relojes olvidados o simultáneos). Úsala cuando pregunten cómo va alguien, cuánto se demora en algo o por qué una tarea tomó tanto.',
  parameters: { type: 'object', properties: {
    persona: { type: 'string', description: 'Nombre de la persona, si preguntan por alguien. Vacío para todo el equipo.' },
    dias: { type: 'integer', enum: [7, 30, 90], description: 'Periodo: 30 por defecto.' }
  } },
  allowed: (user) => hasModulePermission(user, 'manager') && isManagerRole(user?.role),
  async run({ persona, dias } = {}, { rhythm }) {
    const out = await rhythm.get({ days: Number(dias) || 30 });
    const wanted = fold(persona).split(/\s+/).filter(Boolean);
    const people = wanted.length ? out.people.filter((p) => wanted.every((word) => fold(p.personName).includes(word))) : out.people;
    const pct = (value) => `${Math.round(value * 100)} %`;
    return {
      data: {
        periodo: `${out.period.days} días`,
        equipo: { cerradas: out.team.closed, medidas: out.team.measured, cobertura: pct(out.team.coverage) },
        personas: people.slice(0, wanted.length ? 3 : 20).map((p) => ({
          nombre: p.personName, cerradas: p.closed, medidas: p.measured, cobertura: pct(p.coverage),
          porTipo: p.byType.slice(0, 8).map((t) => ({ tipo: t.workType, medidas: t.measured, mediana: formatDuration(t.medianMs), rango: `${formatDuration(t.minMs)} a ${formatDuration(t.maxMs)}`, restoDelEquipo: t.teamMedianMs ? formatDuration(t.teamMedianMs) : null, comparable: t.comparable })),
          hallazgos: p.findings.map((f) => ({ texto: f.message, tareas: f.taskIds.slice(0, 5).map((id) => out.tasks[id]?.title).filter(Boolean) }))
        })),
        instruccion: 'Lo medido es solo lo que pasó por «En proceso» con el cronómetro: di la cobertura antes de sacar conclusiones y no leas como rápido lo que no se midió. Los hallazgos son preguntas para revisar con la persona, nunca juicios sobre ella. «Operaciones & Reuniones» y «Marketing & Social Media» mezclan trabajos distintos y no se comparan. Si nadie coincide con el nombre, dilo.'
      },
      sources: [{ kind: 'ritmo', id: `ritmo-${out.period.days}`, label: 'Ritmo del equipo', url: '/manager?tab=ritmo' }]
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
export const briaAssistantTools = [buscarCliente, misTareas, tareasDeCliente, parrillaDeCliente, leerPiezasDeParrilla, operacionDeCliente, carteraDeOperacion, criteriosYHallazgos, memoriaDeReuniones, ritmoDelEquipo, publicacionesProgramadas, memoriaDeAgencia, leerDocumentoDeAgencia];

export const toolByName = (name) => briaAssistantTools.find((tool) => tool.name === name) || null;
