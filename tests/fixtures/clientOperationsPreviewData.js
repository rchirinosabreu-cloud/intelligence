// Datos de ejemplo para la muestra de «Operación de clientes» (2 de octubre de 2026). Clientes, agencias,
// complejidad, cupos, responsables y casos salen del Excel «PENDIENTES BRAIN STUDIO 2026» y de la
// minuta del 30 de septiembre; las cifras de avance son inventadas. Nunca deciden nada en producción.

export const TODAY = '2026-10-02';

const person = (id, name, role = null, highlightedAction = null) => ({ id: `member-${id}`, name, role, highlightedAction, avatarUrl: null, isActive: true });
// Las «Acción destacada» son las del Excel.
export const team = [
  person('kamila', 'Kamila Ortiz', 'Project Manager'),
  person('jarlan', 'Jarlan Pérez', 'Community Manager', 'Informes y prospección de clientes'),
  person('helen', 'Helen Hernández', 'Community Manager', 'Parrillas de contenidos y piezas con GPT'),
  person('sara', 'Sara Gómez', 'Practicante', 'Practicante / apoyo piezas'),
  person('camila', 'Camila Ríos', 'Producción', 'Edición de videos y jornadas de producción'),
  person('rodny', 'Rodny Chirinos', 'Director'),
];
const excelNote = (id, text, label = 'Observaciones (MIO)') => ({ id, text, date: '2026-10-02', by: null, source: 'EXCEL', label, authorId: null });
const [kamila, jarlan, helen, sara, , rodny] = team;

const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const span = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
const reached = ([redactada, disenada, aprobada, programada, publicada]) => ({ redactada, disenada, aprobada, programada, publicada });
const deliver = (...pairs) => pairs.map(([quantity, format]) => ({ format, quantity }));
const STANDARD_12 = deliver([2, 'Reel'], [2, 'Carrusel'], [8, 'Post']);

const TITLES = {
  Reel: ['Detrás de cámaras', 'Un día con el equipo', 'Testimonio de cliente', 'Tendencia del mes', 'Recorrido por el lugar', 'Antes y después'],
  Carrusel: ['Tres razones para elegirnos', 'Guía rápida', 'Preguntas frecuentes', 'Lo nuevo del mes'],
  Post: ['Producto destacado', 'Frase de la semana', 'Promoción del mes', 'Fecha especial', 'Conoce al equipo', 'Dato curioso', 'Llamado a la acción', 'Horarios y ubicación', 'Novedad', 'Cliente feliz'],
  Otro: ['Pieza especial'],
};

/** Las piezas de un ciclo, coherentes con sus cifras: publicadas y atrasadas en el pasado, el resto por delante. */
function piecesFor(slug, cycle, deliverables) {
  const formats = deliverables.flatMap((row) => Array.from({ length: row.quantity }, () => row.format));
  const r = cycle.reached;
  const late = cycle.overdueItems || 0;
  const pastCount = r.publicada + late;
  const lastPast = addDays(TODAY, -1);
  const pastDays = span(cycle.start, lastPast);
  const futureFrom = addDays(TODAY, 1);
  const futureDays = span(futureFrom, cycle.end);
  const used = {};
  return Array.from({ length: cycle.created }, (_, i) => {
    const status = i < r.publicada ? 'PUBLICADO' : i < r.programada ? 'PROGRAMADO' : i < r.aprobada ? 'APROBADO' : i < r.disenada ? 'REALIZADO' : i < r.redactada ? 'EN_REVISION' : 'BORRADOR';
    const date = i < pastCount
      ? addDays(cycle.start, Math.round((pastDays * i) / Math.max(1, pastCount)))
      : addDays(futureFrom, Math.round((futureDays * (i - pastCount)) / Math.max(1, cycle.created - pastCount)));
    const format = formats[i % formats.length] || 'Post';
    used[format] = (used[format] || 0) + 1;
    return { id: `${slug}-${i}`, date, format, title: TITLES[format][(used[format] - 1) % TITLES[format].length], status };
  });
}

const month = (label, quota, published, report) => ({ label, quota, created: quota, reached: reached([quota, quota, quota, published, published]), report });
const delivered = (deliveredAt, by = 'Kamila Ortiz') => ({ deliveredAt, by });

function cycleOf({ label = 'Octubre', start = '2026-10-01', end = '2026-10-31', quota, created, stages, overdueItems = 0, longestGap = null, sameDay = [] }) {
  return { label, start, end, day: span(start, TODAY) + 1, length: span(start, end) + 1, quota, created, reached: reached(stages), overdueItems, longestGap, sameDay };
}

const task = (id, title, assignee, dueDate, overdue = false) => ({ id, title, assignee, dueDate, overdue });
const contract = (extra) => ({ serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: '2026-12-31', cutDay: 1, deliverables: STANDARD_12, storiesPerWeek: 3, productionDays: 0, monthlyReport: true, notes: '', ...extra });

/** Arma el cliente: ciclo actual con sus piezas, mes anterior e historial de los tres anteriores. */
function client(slug, name, { current, previous, earlier = [], ...extra }) {
  const base = { id: `client-${slug}`, slug, name, logoUrl: null, agency: 'BRAIN', projectManager: kamila, openTasks: [], observations: [], ...extra };
  base.latestObservation = base.observations[0] ? { text: base.observations[0].text, date: base.observations[0].date, by: base.observations[0].by } : null;
  if (!current) return { ...base, cycles: {}, history: [] };
  const cycle = cycleOf(current);
  cycle.pieces = piecesFor(slug, cycle, base.contract.deliverables);
  return { ...base, cycles: { current: cycle, previous }, history: [previous, ...earlier].filter(Boolean) };
}

const full = (q) => [q, q, q, q, q];
const sepFull = (q, report = delivered('2026-10-01')) => month('Septiembre', q, q, report);
const earlierFull = (q) => [month('Agosto', q, q, delivered('2026-09-02')), month('Julio', q, q, delivered('2026-08-03'))];

export const clients = [
  client('titanes', 'Corporación Deportiva Titanes', {
    communityManager: jarlan, complexity: 'BAJA',
    observations: [
      excelNote('ti1', 'Sept 100% OCT 10%. Hay que revisar la pauta con Keila y hay que mandar los post al grupo del cliente y dejar para el desarrollo de piezas y videos después de que paguen así sea un mes.'),
      excelNote('ti2', 'Faltan 2 videos para septiembre', 'Comentario (INDICADORES)'),
    ],
    description: 'Organización sin ánimo de lucro de Cartagena que forma niños, jóvenes y familias con deporte, educación, arte y emprendimiento. Natación y patinaje desde iniciación hasta alto rendimiento.',
    instagramUrl: 'https://www.instagram.com/corporaciondeportitanes',
    contract: contract({ startDate: '2026-07-20', endDate: '2027-01-19', cutDay: 20, deliverables: deliver([3, 'Reel'], [3, 'Post']), productionDays: 1, notes: 'Automatización de WhatsApp: implementación inicial, una sola vez.' }),
    current: { label: 'Septiembre', start: '2026-09-20', end: '2026-10-19', quota: 6, created: 6, stages: [6, 1, 0, 0, 0], longestGap: { days: 12, from: '2026-09-20', to: '2026-10-02' } },
    previous: month('Agosto', 6, 6, delivered('2026-09-22')),
    earlier: [month('Julio', 6, 6, delivered('2026-08-21'))],
    openTasks: [task('t1', 'Enviar al cliente los contenidos disponibles para revisión', jarlan, '2026-10-01', true), task('t2', 'Confirmar la programación pendiente', jarlan, '2026-10-03')],
  }),
  client('aristea', 'Aristea', {
    communityManager: helen, complexity: 'ALTA',
    description: 'Consultoría en sostenibilidad e impacto empresarial.',
    instagramUrl: 'https://www.instagram.com/aristeaconsultoria',
    contract: contract({ startDate: '2026-08-11', endDate: '2026-10-10', cutDay: 11, deliverables: deliver([2, 'Reel'], [4, 'Carrusel'], [6, 'Post']), productionDays: 1, notes: 'Contenidos de LinkedIn incluidos en las 12 piezas. Proponer pauta para potenciar redes.' }),
    current: { label: 'Septiembre', start: '2026-09-11', end: '2026-10-10', quota: 12, created: 9, stages: [9, 9, 7, 6, 6] },
    previous: month('Agosto', 12, 12, delivered('2026-09-12')),
    openTasks: [task('t3', 'Conciliar contrato, parrilla y LinkedIn para producir las faltantes', helen, '2026-10-03'), task('t4', 'Seguimiento con Angélica para renovar al terminar', kamila, '2026-10-08')],
  }),
  client('pablo-hoff', 'Colegio Pablo Hoff', {
    communityManager: jarlan, complexity: 'ALTA',
    observations: [
      { id: 'ph3', text: 'El rector pidió que el video de inscripciones salga antes del 15.', date: '2026-10-02', by: 'Rodny Chirinos', source: 'MANUAL', label: null, authorId: 'dashboard-demo-user' },
      excelNote('ph1', 'Septiembre 100% OCT 50%. Hay que revisar que los post de septiembre que no salieron estén en la parrilla de octubre y hacerle seguimiento a la jornada de producción y a la programación de contenidos. Otro tema importante a revisar es la fecha de publicaciones: empezar con más piezas que videos y que no queden post los mismos días; tenemos 12 post para pasarlos en un mes, la diferencia debe ser máximo 3 días.'),
      excelNote('ph2', 'Pendiente programar', 'Comentario (INDICADORES)'),
    ],
    description: 'Institución educativa cristiana de Cartagena: excelencia académica, principios bíblicos, aprendizaje activo e inglés intensivo.',
    instagramUrl: 'https://www.instagram.com/colegiopablohoff_',
    contract: contract({ startDate: '2025-08-01', endDate: '2026-07-31', deliverables: deliver([4, 'Reel'], [2, 'Carrusel'], [6, 'Post']), storiesPerWeek: 7, productionDays: 1, notes: 'Administración de pauta y actualizaciones web mensuales.' }),
    current: { quota: 12, created: 12, stages: [12, 6, 4, 0, 0], longestGap: { days: 4, from: '2026-10-14', to: '2026-10-18' }, sameDay: [{ date: '2026-10-07', count: 2 }] },
    previous: month('Septiembre', 12, 10, null), earlier: earlierFull(12),
    openTasks: [task('t5', 'Pasar a octubre los 2 posts de septiembre que no salieron', jarlan, '2026-10-02'), task('t6', 'Agendar la jornada de producción', kamila, '2026-09-30', true)],
  }),
  client('sazon-de-iris', 'La Sazón de Iris', {
    communityManager: sara, complexity: 'MEDIA',
    description: 'Catering y comidas para eventos en Cartagena: almuerzos, refrigerios, pasabocas y congelados como empanadas, deditos y quibbes.',
    instagramUrl: 'https://www.instagram.com/lasazondeiris/',
    contract: contract({ productionDays: 1, storiesPerWeek: 0 }),
    current: { quota: 12, created: 0, stages: [0, 0, 0, 0, 0] },
    previous: { ...month('Septiembre', 12, 0, null), created: 0, reached: reached([0, 0, 0, 0, 0]) }, earlier: earlierFull(12),
    openTasks: [task('t7', 'Redactar la parrilla de octubre (se usa la de julio)', sara, '2026-09-29', true), task('t8', 'Asignar un post diario a cada diseñador', sara, '2026-09-30', true)],
  }),
  client('mimas', 'Mimas Kitchen', {
    communityManager: jarlan, complexity: 'MEDIA',
    observations: [excelNote('mi1', 'Todo está realizado pero no está programado: Jarlan debe programar los post. El nuevo CM (Sara) debe revisar que esos post estén bien programados. El porcentaje sería un 80%.')],
    description: 'Restaurante y café casual en Miami: café, sándwiches, hamburguesas y opciones dulces y saladas, junto a una estación de gasolina 24 horas.',
    instagramUrl: 'https://www.instagram.com/mimaskitchenoficial/',
    contract: contract({ startDate: '2026-01-15', endDate: '2026-12-15', cutDay: 15, deliverables: deliver([5, 'Reel'], [7, 'Post']) }),
    current: { label: 'Septiembre', start: '2026-09-15', end: '2026-10-14', quota: 12, created: 12, stages: [12, 12, 12, 0, 0], overdueItems: 7 },
    previous: month('Agosto', 12, 12, delivered('2026-09-16')), earlier: [month('Julio', 12, 12, delivered('2026-08-17'))],
    openTasks: [task('t9', 'Programar los posts aprobados', jarlan, '2026-10-02'), task('t10', 'Revisar que la programación quedó bien en Meta', sara, '2026-10-03')],
  }),
  client('mari-colon', 'Mari Colón Kodesh Real Estate', {
    agency: 'MIO', communityManager: sara, complexity: 'ALTA',
    description: 'Servicios inmobiliarios en Puerto Rico liderados por la REALTOR® Mari Colón-Kodesh: compra, venta y alquiler de propiedades residenciales.',
    instagramUrl: 'https://www.instagram.com/maricolonkodeshrealestate/',
    contract: contract({ startDate: '2026-03-01', endDate: null, notes: 'Incluyó línea gráfica al inicio.' }),
    current: { quota: 12, created: 0, stages: [0, 0, 0, 0, 0] },
    previous: month('Septiembre', 12, 11, null), earlier: earlierFull(12),
    openTasks: [task('t11', 'Ajustar la parrilla de septiembre a lo que se publicó (falta Open House)', sara, '2026-10-02')],
  }),
  client('brain', 'Brain Studio', {
    communityManager: sara, projectManager: rodny, complexity: 'ALTA',
    description: 'Agencia de marketing, comunicación y diseño: branding, redes, diseño gráfico, audiovisual, publicidad digital y web.',
    instagramUrl: 'https://www.instagram.com/brainstudioagencia/',
    contract: contract({ endDate: null, productionDays: 1, monthlyReport: false, notes: 'Octubre: un video de Voces Brain con Angélica y uno de testimonios del equipo, alternados con carrusel.' }),
    current: { quota: 12, created: 0, stages: [0, 0, 0, 0, 0] },
    previous: month('Septiembre', 12, 9), earlier: [month('Agosto', 12, 12), month('Julio', 12, 12)],
    openTasks: [task('t12', 'Registrar en septiembre los posts que ya salieron', sara, '2026-10-01', true), task('t13', 'Video de Voces Brain con Angélica', sara, '2026-10-10')],
  }),
  client('martinez-najera', 'Martínez y Nájera', {
    communityManager: helen, complexity: 'BAJA',
    description: 'Firma de abogados de Cartagena: asesoría legal y económica en derecho civil, comercial, laboral, administrativo y responsabilidad médica.',
    instagramUrl: 'https://www.instagram.com/martinezynajeraabogados/',
    contract: contract({ startDate: '2026-09-01', deliverables: deliver([2, 'Reel'], [1, 'Carrusel'], [2, 'Post']), productionDays: 2, notes: 'Publica también en TikTok.' }),
    current: { quota: 5, created: 5, stages: [5, 2, 0, 0, 0] },
    previous: month('Septiembre', 5, 4, delivered('2026-10-01')),
    openTasks: [task('t14', 'Revisar que lo publicado en TikTok coincida con la parrilla', helen, '2026-10-03')],
  }),
  client('grit', 'Fundación Grit · ELAR', {
    communityManager: sara, complexity: 'ALTA',
    observations: [excelNote('gr1', 'Hay que hacer el seguimiento del lookbook que fue aprobado; antes del 15 del otro mes debe quedar ese documento. Del drop II deben enviar información. Sara debe tener en sus pendientes todos los días contestar los mensajes de Instagram.')],
    description: 'ELAR Bolívar: moda con propósito del proyecto Marca Bolívar, con técnicas artesanales del departamento (crochet, palma sará, madera y totumo).',
    instagramUrl: 'https://www.instagram.com/fundaciongrit/',
    contract: contract({ startDate: '2026-09-01', endDate: '2026-10-31', deliverables: deliver([6, 'Reel'], [4, 'Post']), notes: 'Catálogo ELAR: lookbook aprobado, un drop a la vez. Responder mensajes de Instagram a diario.' }),
    current: { quota: 10, created: 3, stages: [3, 0, 0, 0, 0] },
    previous: month('Septiembre', 10, 10, delivered('2026-10-01')),
    openTasks: [task('t15', 'Pedir la información del drop II', sara, '2026-10-06'), task('t16', 'Contestar los mensajes de Instagram', sara, '2026-10-02')],
  }),
  client('foobespain', 'FoobeSpain · Wine & Wonder', {
    communityManager: helen, complexity: 'ALTA',
    description: 'Tres marcas y siete perfiles: Wine & Wonder, Foob Spain y Wine Summit.',
    contract: contract({ startDate: '2026-09-01', endDate: '2026-11-30', deliverables: deliver([6, 'Reel'], [4, 'Carrusel'], [10, 'Post']), notes: '2 artículos de blog al mes (arrancan en octubre).' }),
    current: { quota: 20, created: 6, stages: [6, 0, 0, 0, 0] },
    previous: month('Septiembre', 20, 20, delivered('2026-10-01')),
  }),
  client('bonsai', 'Bonsai CTG', {
    communityManager: helen, complexity: 'BAJA', instagramUrl: 'https://www.instagram.com/bonsaictg/',
    contract: contract({ endDate: null, deliverables: deliver([4, 'Reel']), monthlyReport: false, notes: 'Algunos contenidos atemporales para no depender del mes.' }),
    current: { quota: 4, created: 0, stages: [0, 0, 0, 0, 0] },
    previous: month('Septiembre', 4, 4), earlier: [month('Agosto', 4, 4)],
  }),
  client('multik', 'Multik Multimateriales', {
    communityManager: helen, complexity: 'BAJA',
    description: 'Venta y distribución de materiales para construcción, remodelación y acabados en Cartagena: pisos, porcelanatos y acabados para baños y cocinas.',
    instagramUrl: 'https://www.instagram.com/multicartagena',
    contract: contract({ startDate: '2026-08-01', endDate: '2026-10-31', deliverables: deliver([2, 'Reel'], [1, 'Carrusel'], [3, 'Post']), storiesPerWeek: 2, productionDays: 1 }),
    current: { quota: 6, created: 6, stages: [6, 2, 0, 0, 0] },
    previous: sepFull(6), earlier: [month('Agosto', 6, 6, delivered('2026-09-03'))],
    openTasks: [task('t17', 'Subir a la carpeta los videos de Francisco', kamila, '2026-09-30', true)],
  }),
  client('felix', 'Félix Finas', {
    communityManager: helen, complexity: 'BAJA',
    description: 'Marca profesional de Félix Rodríguez Peña, contador con más de 20 años asesorando entidades sin ánimo de lucro.',
    instagramUrl: 'https://www.instagram.com/felixfinas',
    contract: contract({ startDate: '2026-09-21', endDate: '2027-01-20', cutDay: 21, deliverables: deliver([2, 'Reel'], [2, 'Post']), storiesPerWeek: 1, productionDays: 2, notes: 'Reactivar TikTok, poner a punto Facebook y unificar la marca entre redes.' }),
    current: { label: 'Septiembre', start: '2026-09-21', end: '2026-10-20', quota: 4, created: 4, stages: [4, 2, 1, 1, 1] },
  }),
  client('nattal', 'Nattal', {
    communityManager: jarlan, complexity: 'MEDIA',
    description: 'Coffee, Food & Market en Miami y Hialeah: cafetería, comida latina y tienda de conveniencia.',
    instagramUrl: 'https://www.instagram.com/nattalmiami',
    contract: contract({ deliverables: deliver([2, 'Reel'], [4, 'Carrusel'], [10, 'Post']) }),
    current: { quota: 16, created: 16, stages: [16, 10, 10, 2, 0] },
    previous: sepFull(16), earlier: earlierFull(16),
    openTasks: [task('t18', 'Subir los videos de octubre', rodny, '2026-10-06')],
  }),
  client('new-pueblito', 'New Pueblito Suites', {
    communityManager: sara, complexity: 'BAJA',
    description: 'Alojamiento turístico en Bocagrande, Cartagena, a pocos metros de la playa.',
    instagramUrl: 'https://www.instagram.com/newpueblitosuites/',
    contract: contract({ startDate: '2026-03-01', deliverables: deliver([3, 'Reel'], [1, 'Carrusel'], [1, 'Post']), notes: 'Videos editados de hasta 1:30 min.' }),
    current: { quota: 5, created: 5, stages: [5, 2, 2, 0, 0] },
    previous: sepFull(5), earlier: earlierFull(5),
  }),
  client('casa-bella', 'Casa Bella', { agency: 'MIO', communityManager: jarlan, complexity: 'ALTA', description: 'Diseño y construcción de viviendas en Puerto Rico, con servicio todo incluido.', instagramUrl: 'https://www.instagram.com/micasabellapr/', contract: contract({ endDate: null }), current: { quota: 12, created: 12, stages: [12, 12, 12, 12, 1] }, previous: sepFull(12), earlier: earlierFull(12) }),
  client('verona', 'Verona PR', { agency: 'MIO', communityManager: jarlan, complexity: 'ALTA', instagramUrl: 'https://www.instagram.com/veronaprshop', contract: contract({ endDate: null }), current: { quota: 12, created: 12, stages: [12, 12, 12, 12, 1] }, previous: sepFull(12), earlier: earlierFull(12) }),
  client('villa-montana', 'Villa Montaña Beach Resort', {
    agency: 'MIO', communityManager: helen, complexity: 'ALTA', instagramUrl: 'https://www.instagram.com/villamontanabeachresort',
    contract: contract({ endDate: null, deliverables: deliver([6, 'Reel'], [10, 'Post']) }),
    current: { quota: 16, created: 16, stages: [16, 16, 10, 0, 0] }, previous: sepFull(16), earlier: earlierFull(16),
  }),
  client('lettufresh', 'Lettufresh', {
    agency: 'MIO', communityManager: helen, complexity: 'ALTA',
    description: 'Lechugas hidropónicas 100 % puertorriqueñas cultivadas en Ciales.',
    instagramUrl: 'https://www.instagram.com/lettufresh',
    contract: contract({ startDate: '2026-03-17', endDate: null }), current: { quota: 12, created: 12, stages: [12, 5, 0, 0, 0] }, previous: sepFull(12), earlier: earlierFull(12),
  }),
  client('abitat', 'Ábitat Insurance', {
    agency: 'MIO', communityManager: helen, complexity: 'ALTA',
    description: 'Seguros y planificación financiera en Puerto Rico, con más de 20 años de experiencia.',
    contract: contract({ status: 'STAND_BY', standBySince: '2026-09-15', endDate: null }),
    openTasks: [task('t19', 'Dejar en Basecamp qué hacer con los posts restantes', kamila, '2026-10-02')],
  }),
  client('andi', 'ANDI Bolívar', {
    projectManager: rodny, communityManager: null,
    description: 'Seccional Bolívar de la Asociación Nacional de Empresarios.',
    contract: contract({ serviceType: 'SERVICIOS', startDate: '2026-02-01', endDate: null, deliverables: [], storiesPerWeek: 0, monthlyReport: false, notes: 'Mapas y piezas a pedido. Lo llevan Rodny y Francisco.' }),
    openTasks: [task('t20', 'Entregar el mapa de afiliados actualizado', rodny, '2026-09-29', true), task('t21', 'Seguimiento con el cliente', kamila, '2026-10-05')],
  }),
  client('desarrollo', 'Desarrollo Económico', {
    communityManager: helen, complexity: 'ALTA',
    description: 'Secretaría de Desarrollo Económico de la Gobernación de Bolívar.',
    contract: contract({ serviceType: 'SERVICIOS', startDate: '2026-01-19', endDate: '2026-11-18', deliverables: [], storiesPerWeek: 0, monthlyReport: false, notes: 'Sin cupo fijo: lo que salga en el mes. Elisa hace el arqueo del fee contra las jornadas.' }),
    openTasks: [task('t22', 'Recibir el contenido que debe enviar el cliente', helen, '2026-10-05')],
  }),
  client('promo-group', 'Promo Group · Endova', { communityManager: sara, complexity: 'ALTA', contract: null }),
];
