import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDeliverables, parseStories, parseProductionDays, parseVigencia, cleanInstagram, normalizeName,
  readExcelClients, planImport,
} from '../src/lib/clientOperationsImport.js';

// Carga única del Excel «PENDIENTES BRAIN STUDIO 2026» (2 de octubre de 2026). Rodny: «lo que ESTÁ EN LA
// PLATAFORMA es la fuente de verdad». El Excel solo llena huecos; nada de lo que la plataforma ya sabe se
// pisa, y lo que no se entiende se informa en vez de adivinarse.

test('los contenidos del Excel se convierten en piezas por formato de la parrilla', () => {
  assert.deepEqual(parseDeliverables('12 Contenidos: 2 videos. 2 carruseles, y 8 estaticos').deliverables, [
    { format: 'Reel', quantity: 2 }, { format: 'Carrusel', quantity: 2 }, { format: 'Post', quantity: 8 },
  ]);
  // «carretes» puede ser carrusel o reel según quién lo escribió: se lee como carrusel y se marca la duda.
  const villa = parseDeliverables('16 publicaciones: 7 piezas gráficas, 2 carretes y 4 videos, 3 post fotografías.');
  assert.deepEqual(villa.deliverables, [{ format: 'Reel', quantity: 4 }, { format: 'Carrusel', quantity: 2 }, { format: 'Post', quantity: 10 }]);
  assert.match(villa.doubt, /carretes/);
  // «videos» y «reels» son reels; «piezas», «estáticos» y «post», posts.
  assert.deepEqual(parseDeliverables('Creación de cuatro (4) contenidos mensuales (2 posts, 1 carruseles 1 reels).').deliverables, [
    { format: 'Reel', quantity: 1 }, { format: 'Carrusel', quantity: 1 }, { format: 'Post', quantity: 2 },
  ]);
});

test('si el desglose no cuadra con el total, o solo hay total, no se adivina', () => {
  const onlyTotal = parseDeliverables('12 contenidos al mes');
  assert.deepEqual(onlyTotal.deliverables, []);
  assert.equal(onlyTotal.total, 12);
  assert.match(onlyTotal.doubt, /sin desglose/);
  const mismatch = parseDeliverables('16 contenidos mensuales, publicados 3 veces por semana. Formatos: 6 piezas gráficas (Sin diseños, solo la creación del concepto), 2 carretes y 4  videos.');
  assert.equal(mismatch.total, 16);
  assert.deepEqual(mismatch.deliverables, [], 'si no cuadra no se usa ninguna de las dos cifras');
  assert.match(mismatch.doubt, /suman 12/);
  const counted = parseDeliverables('Creación de seis (6) contenidos mensuales (posts, carruseles o reels).');
  assert.equal(counted.total, 6);
  assert.deepEqual(counted.deliverables, []);
  assert.equal(parseDeliverables('Administración de pautas en facebook y google').total, 0);
});

test('historias, jornadas y vigencia se leen del texto cuando lo dice claro', () => {
  assert.equal(parseStories('Historias 3 días a la / semana'), 3);
  assert.equal(parseStories('2 historias semanales (8 al mes).'), 2);
  assert.equal(parseStories('1 historia semanal: dinámica y atractiva'), 1);
  assert.equal(parseStories('(1) historia semanal (cuatro al mes)'), 1);
  assert.equal(parseStories('12 contenidos'), 0);
  assert.equal(parseProductionDays('2 jornadas de producción audiovisual al mes'), 2);
  assert.equal(parseProductionDays('1 jornada mensual de producción (2 horas)'), 1);
  assert.equal(parseProductionDays('sin jornadas', 'Jornada de producción'), 1);
  assert.deepEqual(parseVigencia('20 de julio al 19 de enero', { year: 2026 }), { startDate: '2026-07-20', endDate: '2027-01-19' });
  assert.deepEqual(parseVigencia('del 21 de septiembre del 2026 hasta el 20 de enero del 2027.', { year: 2026 }), { startDate: '2026-09-21', endDate: '2027-01-20' });
  assert.deepEqual(parseVigencia('1 agosto de 2025 - el 31 de julio de 2026', { year: 2026 }), { startDate: '2025-08-01', endDate: '2026-07-31' });
  assert.deepEqual(parseVigencia('1 de enero al 31 de diciembre', { year: 2026 }), { startDate: '2026-01-01', endDate: '2026-12-31' });
  assert.equal(parseVigencia('Cada 30', { year: 2026 }), null);
  assert.equal(parseVigencia('Hasta agosto', { year: 2026 }), null);
});

test('el enlace de Instagram se limpia y los nombres se comparan sin tildes ni errores comunes', () => {
  assert.equal(cleanInstagram('https://www.instagram.com/lettufresh?utm_source=ig_web_button_share_sheet&igsh=ZDN'), 'https://www.instagram.com/lettufresh/');
  assert.equal(cleanInstagram('Mimas Kitchen (@mimaskitchenoficial) • Instagram photos and videos'), 'https://www.instagram.com/mimaskitchenoficial/');
  assert.equal(cleanInstagram('https://www.figma.com/design/x'), null);
  assert.equal(normalizeName('Coporación Deportiva Titantes'), normalizeName('Corporación deportiva titanes'));
  assert.equal(normalizeName('Ábitat insurance'), normalizeName('Abitat Insurance'));
  assert.equal(normalizeName('Nattal '), 'nattal');
  assert.equal(normalizeName('Brainstudio'), normalizeName('Brain Studio'), 'los espacios no separan a un cliente de sí mismo');
  assert.deepEqual(parseVigencia('1 de septimbre - 30 de noviembre', { year: 2026 }), { startDate: '2026-09-01', endDate: '2026-11-30' });
});

test('dos filas del mismo cliente se completan entre sí en vez de perder datos', () => {
  const header = ['CANTIDAD', 'CLIENTES', 'Definición', 'Fecha inicio / terminación', 'Link y cuenta Instagram', 'CONTENIDOS', 'Producción', 'PROJECT MANAGER', 'CM', 'Informe MES', 'Estado'];
  const { clients, doubts } = readExcelClients({
    indicadores: [header, ['', 'Bonsai CTG', '', '', '', '', '', 'Kamila', '', '', ''], ['36', 'Bonsai CTG', '', 'Cada 30', 'https://www.instagram.com/bonsaictg/', '4 publicaciones al mes / 4 reels', 'Jornada de producción', '', '', 'ok', 'Parrilla en proceso']],
    mio: [], year: 2026,
  });
  assert.equal(clients.length, 1);
  assert.equal(clients[0].pmName, 'Kamila');
  assert.equal(clients[0].instagramUrl, 'https://www.instagram.com/bonsaictg/');
  assert.deepEqual(clients[0].contract.deliverables, [{ format: 'Reel', quantity: 4 }]);
  assert.ok(doubts.some((d) => /Bonsai CTG/.test(d) && /se completaron/.test(d)));
});

test('un cliente archivado en la plataforma no se toca', () => {
  const plan = planImport({
    excelClients: [{ name: 'Salsipuedes', description: 'Restaurante', agency: 'BRAIN', contract: null, observations: [{ sheet: 'INDICADORES', text: 'Cliente que se va' }], doubts: [] }],
    platformClients: [{ id: 'c-s', name: 'Salsipuedes', isArchived: true, contracts: [] }], team: [], today: '2026-10-02',
  });
  assert.deepEqual([plan.updates.length, plan.tasks.length, plan.observations.length], [0, 0, 0]);
  assert.deepEqual(plan.archived, ['Salsipuedes']);
});

const indicadores = [
  ['CANTIDAD', 'CLIENTES', 'Definición', 'Fecha inicio / terminación', 'Link y cuenta Instagram', 'CONTENIDOS', 'Producción', 'PROJECT MANAGER', 'CM', 'Informe MES', 'Estado', 'Comentario', 'Parrillas'],
  ['1', 'Mimas Kitchen', 'Restaurante en Miami.', '15 enero al 15 de diciembre', 'Mimas Kitchen (@mimaskitchenoficial) • Instagram', '12 contenidos (5 reels y 7 piezas)', 'No aplica', 'Kamila', 'Sara', 'ok', 'Parrilla en proceso', 'Redactada, falta revisión', 'En espera'],
  ['17', 'Muebles Nuva', 'Muebles en Barranquilla.', 'Cada 30', 'https://www.instagram.com/mueblesnuva/', '12 contenidos', 'Jornada de producción', 'Kamila', '', 'ok', 'Parrilla completa', 'Revisión julio', 'Cerrada'],
  ['29', 'Muebles Nuva', 'Muebles en Barranquilla.', 'Cada 30', 'https://www.instagram.com/mueblesnuva/', '12 contenidos', 'Jornada de producción', 'Kamila', '', 'ok', 'Parrilla completa', 'Revisión julio', 'Cerrada'],
  ['47', 'Grupo impacta', '', '', '', '', '', '', '', '', 'Neutro', '', 'Neutro'],
  ['50', 'Cliente Fantasma', '', '', '', '6 contenidos', '', '', '', '', 'Parrilla en proceso', '', ''],
];
const mio = [
  ['UNI', 'Clientes', 'Agencia', 'Nivel de complejidad', 'Responsable', 'Estado de redacción', 'Estado de diseño', 'Estado de aprobación', 'Estado de programación', 'Estado de pauta', 'Servicio', 'OBSERVACIONES', 'Prdoucción'],
  ['1', 'Mimas Kitchen', 'BRAIN', 'Media', 'Jarlan', 'Entregado', 'Entregado', 'Aprobado', 'Pendiente', 'No aplica', '12 publicaciones', 'Jarlan debe programar los post.', 'No'],
  ['7', 'Ábitat insurance', 'MIO', 'Alta', 'Helen', '', '', '', '', '', '12 publicaciones', 'Sept no depende de nosotros. Oct | No continua', 'No'],
];

test('el Excel se lee por cliente: une filas repetidas y junta la hoja MIO', () => {
  const { clients, doubts } = readExcelClients({ indicadores, mio, year: 2026 });
  const mimas = clients.find((c) => c.name === 'Mimas Kitchen');
  assert.equal(mimas.agency, 'BRAIN');
  assert.equal(mimas.complexity, 'MEDIA');
  assert.equal(mimas.pmName, 'Kamila');
  assert.equal(mimas.cmName, 'Jarlan', 'manda el responsable de la hoja MIO, que es la más reciente');
  assert.equal(mimas.monthlyReport, true);
  assert.deepEqual(mimas.contract.deliverables, [{ format: 'Reel', quantity: 5 }, { format: 'Post', quantity: 7 }]);
  assert.deepEqual([mimas.contract.startDate, mimas.contract.endDate], ['2026-01-15', '2026-12-15']);
  // Las dos columnas de texto libre del Excel pasan a las observaciones del cliente, cada una con su hoja.
  assert.deepEqual(mimas.observations, [
    { sheet: 'INDICADORES', text: 'Redactada, falta revisión' },
    { sheet: 'MIO', text: 'Jarlan debe programar los post.' },
  ]);
  assert.equal(clients.filter((c) => normalizeName(c.name) === normalizeName('Muebles Nuva')).length, 1, 'las filas repetidas se unen');
  assert.ok(doubts.some((d) => /Muebles Nuva/.test(d) && /repetid/.test(d)));
  const abitat = clients.find((c) => normalizeName(c.name).startsWith('abitat'));
  assert.equal(abitat.contract.status, 'STAND_BY', '«No continua» deja el contrato en stand by');
  const impacta = clients.find((c) => c.name === 'Grupo impacta');
  assert.equal(impacta.contract, null, 'un cliente «Neutro» sin datos no recibe contrato inventado');
});

const platform = [
  { id: 'c-mimas', name: 'Mimas Kitchen', slug: 'mimas', description: 'Texto escrito en la plataforma', instagramUrl: null, agency: null, complexity: null, responsibleId: 'm-sara', projectManagerId: null, contracts: [] },
  { id: 'c-nuva', name: 'Muebles Nuva', slug: 'nuva', description: null, instagramUrl: null, agency: null, complexity: null, responsibleId: null, projectManagerId: null, contracts: [{ id: 'k1' }] },
  { id: 'c-abitat', name: 'Abitat Insurance', slug: 'abitat', description: null, instagramUrl: null, agency: null, complexity: null, responsibleId: null, projectManagerId: null, contracts: [] },
  { id: 'c-impacta', name: 'Grupo Impacta', slug: 'impacta', description: null, instagramUrl: null, agency: null, complexity: null, responsibleId: null, projectManagerId: null, contracts: [] },
];
const team = [
  { id: 'm-kamila', name: 'Kamila Ortiz', isActive: true }, { id: 'm-jarlan', name: 'Jarlan Pérez', isActive: true },
  { id: 'm-sara', name: 'Sara Gómez', isActive: true }, { id: 'm-helen', name: 'Helen Hernández', isActive: true },
];

test('la plataforma manda: solo se llenan huecos y las diferencias se informan', () => {
  const { clients } = readExcelClients({ indicadores, mio, year: 2026 });
  const plan = planImport({ excelClients: clients, platformClients: platform, team, today: '2026-10-02' });
  const mimas = plan.updates.find((u) => u.clientId === 'c-mimas');
  assert.equal(mimas.data.description, undefined, 'la descripción escrita en la plataforma no se pisa');
  assert.equal(mimas.data.responsibleId, undefined, 'el CM de la plataforma no se cambia');
  assert.equal(mimas.data.projectManagerId, 'm-kamila');
  assert.equal(mimas.data.agency, 'BRAIN');
  assert.equal(mimas.contract.cutDay, 1, 'el día de corte no se deduce: se informa para revisarlo');
  assert.ok(plan.differences.some((d) => d.clientId === 'c-mimas' && /Jarlan/.test(d.text) && /Sara/.test(d.text)));
  assert.ok(plan.doubts.some((d) => /Mimas/.test(d) && /día 15/.test(d)));

  const nuva = plan.updates.find((u) => u.clientId === 'c-nuva');
  assert.equal(nuva.contract, null, 'un cliente que ya tiene contrato en la plataforma no recibe otro');

  assert.ok(plan.notFound.includes('Cliente Fantasma'), 'lo que no existe en la plataforma no se crea');
  // Las observaciones van completas a la sección del cliente, sin repetir la fila duplicada.
  assert.deepEqual(plan.observations.filter((o) => o.clientId === 'c-mimas').map((o) => o.text), ['Redactada, falta revisión', 'Jarlan debe programar los post.']);
  assert.deepEqual(plan.observations.filter((o) => o.clientId === 'c-nuva').map((o) => o.text), ['Revisión julio']);
  assert.equal(plan.observations.find((o) => o.clientId === 'c-nuva').label, 'Comentario (INDICADORES)');
  // Las tareas, que solo se crean con --crear-tareas, salen de las observaciones de la hoja MIO.
  assert.equal(plan.tasks.length, 2);
  assert.deepEqual(plan.tasks.find((t) => t.clientId === 'c-mimas'), {
    clientId: 'c-mimas', assigneeId: 'm-sara', title: 'Pendientes que venían del Excel', comments: '- Jarlan debe programar los post.',
  });
});

test('el bloque HISTORIAS de la hoja MIO fija la frecuencia de historias de cada cliente', () => {
  const withStories = [...mio, ['', '', '', '', '', 'Jarlan', 'HISTORIAS'], ['', '', '', '', '', 'Mimas Kitchen', '3 veces por semana'], ['', '', '', '', '', 'Ábitat insurance', 'Todos los dias '], ['', '', '', '', '', 'Multik Multimarcas', '']];
  const { clients } = readExcelClients({ indicadores, mio: withStories, year: 2026 });
  assert.equal(clients.find((c) => c.name === 'Mimas Kitchen').contract.storiesPerWeek, 3);
  assert.equal(clients.find((c) => normalizeName(c.name).startsWith('abitat')).contract.storiesPerWeek, 7);
});

test('la «Acción destacada» de cada colaborador se lee de las dos hojas y manda la más reciente', () => {
  const ind = [...indicadores, ['', 'Colaborador ', '', 'Jarlan', 'Helen', 'Camila'], ['', 'Acción destacada', '', 'Informes y prospección de clientes', 'Parrillas de contenidos y piezas con GPT', 'Edición de videos y jornadas de producción']];
  const mioTeam = [...mio, [''], ['', '', '', '', '', 'Jarlan', 'Helen', '', '', '', 'Sara '], ['', '', '', '', '', 'Informes y prospección de clientes', 'Parrillas de contenidos y piezas con GPT y Bria', '', '', '', 'Practicante / apoyo piezas']];
  const { teamHighlights } = readExcelClients({ indicadores: ind, mio: mioTeam, year: 2026 });
  assert.deepEqual(teamHighlights, {
    Jarlan: 'Informes y prospección de clientes',
    Helen: 'Parrillas de contenidos y piezas con GPT y Bria',
    Camila: 'Edición de videos y jornadas de producción',
    Sara: 'Practicante / apoyo piezas',
  });
  const plan = planImport({
    excelClients: [], platformClients: [], today: '2026-10-02', teamHighlights,
    team: [...team, { id: 'm-camila', name: 'Camila Ríos', isActive: true, highlightedAction: 'Ya escrito en la plataforma' }],
  });
  assert.deepEqual(plan.teamHighlights, [
    { memberId: 'm-jarlan', name: 'Jarlan Pérez', text: 'Informes y prospección de clientes' },
    { memberId: 'm-helen', name: 'Helen Hernández', text: 'Parrillas de contenidos y piezas con GPT y Bria' },
    { memberId: 'm-sara', name: 'Sara Gómez', text: 'Practicante / apoyo piezas' },
  ], 'lo que la plataforma ya tiene no se pisa');
});
