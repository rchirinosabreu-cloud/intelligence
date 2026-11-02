// Que Bria sea project manager y community manager (Rodny, 19 de octubre de 2026). Primera pieza: escribirle al cliente.
// Bria ya tenía el aviso «Recordarle al cliente», pero lo escribía a ciegas: sin el enlace del portal, sin
// saber qué salió publicado ni qué espera la aprobación. Ahora lee la parrilla como la ve el cliente y redacta el
// mensaje listo para copiar. Nunca lo envía, y nunca lleva lo que el cliente no ve (guion, notas internas, el equipo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildClientUpdate, portalUrlOf, CLIENT_UPDATE_WINDOW } from '../src/lib/clientUpdate.js';
import { briaClientUpdateTools } from '../src/services/briaClientUpdateTools.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';
import { nudgeActions } from '../src/lib/briaNudges.js';
import { collectFacts, fallbackPulse, FACT_KINDS, APPROVAL_LOOKAHEAD_DAYS } from '../src/lib/briaPulse.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const today = '2026-10-19';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const items = [
  { id: 'p1', objective: 'Reel de lanzamiento', format: 'Reel', publishDate: at('2026-10-22'), publishTime: '10:00', status: 'EN_REVISION', copyText: 'ESCENA 1: guion secreto', captionText: 'Llegó lo nuevo', internalNotes: 'Ojo con el logo viejo', comments: '', revisionRequestedAt: null, publications: [] },
  { id: 'p2', objective: 'Carrusel de beneficios', format: 'Carrusel', publishDate: at('2026-10-24'), publishTime: null, status: 'APROBADO', copyText: '', captionText: 'Tres razones', internalNotes: '', comments: '', revisionRequestedAt: new Date('2026-10-18T15:00:00Z'), publications: [] },
  { id: 'p3', objective: 'Post de horario', format: 'Post', publishDate: at('2026-10-21'), publishTime: null, status: 'DEVUELTO', copyText: '', captionText: 'Horario', internalNotes: '', comments: '[Cliente - 17/10/2026]: Cambien la foto por una del local', revisionRequestedAt: null, publications: [] },
  { id: 'p4', objective: 'Reel del evento', format: 'Reel', publishDate: at('2026-10-15'), publishTime: '12:00', status: 'PUBLICADO', copyText: '', captionText: 'Gracias a todos', internalNotes: '', comments: '', revisionRequestedAt: null,
    publications: [{ status: 'PUBLISHED', platform: 'INSTAGRAM', permalink: 'https://www.instagram.com/p/abc/', publishedAt: new Date('2026-10-15T17:01:00Z'), scheduledAt: new Date('2026-10-15T17:00:00Z') }, { status: 'PUBLISHED', platform: 'FACEBOOK', permalink: 'https://www.facebook.com/123/posts/456', publishedAt: new Date('2026-10-15T17:01:00Z'), scheduledAt: new Date('2026-10-15T17:00:00Z') }] },
  { id: 'p5', objective: 'Historia del menú', format: 'Historia', publishDate: at('2026-10-20'), publishTime: '09:00', status: 'PROGRAMADO', copyText: '', captionText: '', internalNotes: '', comments: '', revisionRequestedAt: null,
    publications: [{ status: 'SCHEDULED', platform: 'INSTAGRAM', permalink: null, publishedAt: null, scheduledAt: new Date('2026-10-20T14:00:00Z') }] },
  { id: 'p6', objective: 'Idea sin texto', format: 'Post', publishDate: at('2026-10-29'), publishTime: null, status: 'BORRADOR', copyText: '', captionText: '', internalNotes: '', comments: '', revisionRequestedAt: null, publications: [] },
  { id: 'p7', objective: 'Reel viejo', format: 'Reel', publishDate: at('2026-10-02'), publishTime: null, status: 'PUBLICADO', copyText: '', captionText: '', internalNotes: '', comments: '', revisionRequestedAt: null,
    publications: [{ status: 'PUBLISHED', platform: 'INSTAGRAM', permalink: 'https://www.instagram.com/p/old/', publishedAt: new Date('2026-10-02T17:00:00Z'), scheduledAt: null }] }
];

test('the portal link is the one the client already has, built on the platform address', () => {
  assert.equal(portalUrlOf('tok123'), 'https://labs.brainstudioagencia.com/compartir/tok123');
  assert.equal(portalUrlOf('tok123', 'https://otra.test/'), 'https://otra.test/compartir/tok123');
  assert.equal(portalUrlOf(null), null, 'no link is never invented');
  assert.deepEqual(CLIENT_UPDATE_WINDOW, { pastDays: 7, nextDays: 14 });
});

test('the update reads the plan as the client sees it: awaiting approval, being adjusted, published with links, scheduled', () => {
  const update = buildClientUpdate({ clientName: 'Aristea', monthLabel: 'octubre de 2026', items, shareToken: 'tok123', today });
  assert.equal(update.cliente, 'Aristea');
  assert.equal(update.enlacePortal, 'https://labs.brainstudioagencia.com/compartir/tok123');
  assert.deepEqual(update.esperanSuAprobacion.map((p) => [p.titulo, p.fecha, p.materialNuevo]), [['Reel de lanzamiento', '2026-10-22', false], ['Carrusel de beneficios', '2026-10-24', true]]);
  assert.deepEqual(update.ajustandoLoQuePidio, [{ titulo: 'Post de horario', formato: 'Post', fecha: '2026-10-21', pidio: 'Cambien la foto por una del local' }]);
  assert.deepEqual(update.publicadas, [{ titulo: 'Reel del evento', formato: 'Reel', fecha: '2026-10-15', enlaces: [{ red: 'Instagram', url: 'https://www.instagram.com/p/abc/' }, { red: 'Facebook', url: 'https://www.facebook.com/123/posts/456' }] }], 'only the last week');
  assert.deepEqual(update.programadas, [{ titulo: 'Historia del menú', formato: 'Historia', fecha: '2026-10-20', hora: '09:00' }]);
  assert.equal(update.enPreparacion, 1);
  assert.deepEqual(update.avance, { aprobadas: 3, total: 7 });
  const json = JSON.stringify(update);
  for (const secret of ['guion secreto', 'logo viejo', 'ESCENA']) assert.equal(json.includes(secret), false, `«${secret}» never reaches a client message`);
  const empty = buildClientUpdate({ clientName: 'Aristea', monthLabel: 'octubre de 2026', items: [], shareToken: null, today });
  assert.equal(empty.enlacePortal, null);
  assert.deepEqual(empty.esperanSuAprobacion, []);
});

test('Bria’s tool reads the plan with the client-safe fields, and says to create the link when there is none', async () => {
  const [tool] = briaClientUpdateTools;
  assert.equal(tool.name, 'mensaje_para_cliente');
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', modulePermissions: { parrillas: true } }), true);
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', modulePermissions: {} }), false);
  assert.deepEqual(tool.parameters.properties.canal.enum, ['whatsapp', 'correo']);
  assert.deepEqual(tool.parameters.properties.enfoque.enum, ['resumen', 'aprobacion', 'publicado']);
  const queries = [];
  const db = { contentPlan: { findFirst: async (args) => { queries.push(args); return { id: 'plan-1', month: 10, year: 2026, shareToken: 'tok123', client: { name: 'Aristea', contactName: 'Laura Gómez' }, contentItems: items }; } } };
  const out = await tool.run({ clientId: 'c-1', canal: 'whatsapp', enfoque: 'aprobacion' }, { db, today, person: { name: 'Camila del Toro' } });
  assert.deepEqual([out.data.contacto, out.data.firma], ['Laura Gómez', 'Camila del Toro']);
  assert.match(out.data.instruccion, /Saluda a Laura por su nombre/);
  assert.match(out.data.instruccion, /Firma con Camila/);
  assert.match(out.data.instruccion, /nunca que «está programada»/);
  assert.equal(queries[0].where.clientId, 'c-1');
  assert.deepEqual([queries[0].where.month, queries[0].where.year], [10, 2026]);
  const selected = queries[0].select.contentItems.select;
  assert.equal('copyText' in selected || 'internalNotes' in selected, false, 'the internal fields are not even read');
  assert.equal(out.data.enlacePortal, 'https://labs.brainstudioagencia.com/compartir/tok123');
  assert.equal(out.data.canal, 'whatsapp');
  assert.match(out.data.instruccion, /listo para copiar/);
  assert.match(out.data.instruccion, /Nunca lo envías/);
  assert.deepEqual(out.sources.map((s) => s.kind), ['parrilla']);
  const noLink = await tool.run({ clientId: 'c-1' }, { db: { contentPlan: { findFirst: async () => ({ id: 'plan-1', month: 10, year: 2026, shareToken: null, client: { name: 'Aristea' }, contentItems: items }) } }, today });
  assert.match(noLink.data.instruccion, /«Compartir»/);
  assert.match(noLink.data.instruccion, /Hola, equipo de Aristea/, 'without a contact, the brand is never greeted as a person');
  const none = await tool.run({ clientId: 'c-1' }, { db: { contentPlan: { findFirst: async () => null } }, today });
  assert.match(none.data.mensaje, /No hay parrilla de octubre de 2026/);
  await assert.rejects(() => tool.run({}, { db, today }), /buscar_cliente/);
});

// Rodny, el mismo día: «esto sería como un aviso, ¿no? Tipo “hay piezas que no se han aprobado en la parrilla tal,
// ¿quieres enviarle un mensaje a Aristea? Puedo ayudarte a redactarlo”. No te estoy dando un texto fijo sino una forma de
// pensar, de actuar de Bria». Antes solo avisaba pieza por pieza y a dos días de salir.
test('Bria notices a client sitting on approvals this week and offers to write to them, one notice per client', () => {
  assert.ok(FACT_KINDS.includes('APROBACIONES_PENDIENTES'));
  assert.equal(APPROVAL_LOOKAHEAD_DAYS, 7);
  const pieces = [
    { id: 'a1', title: 'Reel de lanzamiento', planId: 'plan-a', clientName: 'Aristea', day: '2026-10-22' },
    { id: 'a2', title: 'Carrusel de beneficios', planId: 'plan-a', clientName: 'Aristea', day: '2026-10-20' },
    { id: 'a3', title: 'Post de horario', planId: 'plan-a', clientName: 'Aristea', day: '2026-10-24' },
    { id: 'n1', title: 'Historia urgente', planId: 'plan-n', clientName: 'Nattal', day: '2026-10-20' },
    { id: 'e1', title: 'Reel de la otra semana', planId: 'plan-e', clientName: 'Endova', day: '2026-10-23' },
    { id: 'f1', title: 'Muy lejos', planId: 'plan-f', clientName: 'Foobespain', day: '2026-10-30' }
  ];
  const facts = collectFacts({ pieces, today });
  const grouped = facts.filter((f) => f.kind === 'APROBACIONES_PENDIENTES');
  assert.deepEqual(grouped.map((f) => f.subject).sort(), ['plan-a', 'plan-e'], 'one notice per client; a lone piece far away also counts');
  const aristea = grouped.find((f) => f.subject === 'plan-a');
  assert.match(aristea.text, /^Aristea tiene 3 piezas esperando su aprobación esta semana; la primera, «Carrusel de beneficios», sale el martes 20 de octubre\./);
  assert.match(aristea.text, /Puedo redactarle el mensaje con el enlace del portal/);
  assert.equal(aristea.severity, 2, 'the first one goes out tomorrow');
  assert.deepEqual(aristea.actions, [
    { label: 'Abrir la parrilla', to: '/parrillas/plan-a' },
    { label: 'Escribirle a Aristea', ask: 'Redáctame un mensaje por WhatsApp para Aristea para que apruebe lo que tiene pendiente, con el enlace del portal.' }
  ]);
  assert.match(grouped.find((f) => f.subject === 'plan-e').text, /^Endova tiene 1 pieza esperando su aprobación esta semana; sale el viernes 23 de octubre\./);
  assert.deepEqual(facts.filter((f) => f.kind === 'PIEZA_SIN_APROBAR').map((f) => f.subject), ['n1'], 'a single urgent piece keeps its own notice, and Aristea’s pieces are not repeated one by one');
  assert.equal(facts.some((f) => f.subject === 'f1' || f.subject === 'plan-f'), false, 'nothing beyond the week');
  const [said] = fallbackPulse([aristea], 1);
  assert.match(said.title, /^Aristea tiene 3 piezas esperando su aprobación/);
  assert.match(said.body, /Puedo redactarle el mensaje/);
  assert.match(read('src/services/briaPulseService.js'), /APPROVAL_LOOKAHEAD_DAYS \+ 1/, 'the pulse reads the whole week');
});

test('Bria knows when to use it, the reminder notice points to it, and the tool is wired in', () => {
  const [tool] = briaClientUpdateTools;
  // La guía vive en la descripción de la herramienta (31 de octubre de 2026); las instrucciones solo la listan.
  const text = buildInstructions({ person: { name: 'Rodny' }, today, tools: [{ name: tool.name, description: tool.description }] });
  assert.match(text, /- mensaje_para_cliente/);
  assert.match(tool.description, /escribirle a un cliente/);
  assert.match(tool.description, /nunca lo envías/);
  const [, remind] = nudgeActions({ kind: 'PIEZA_SIN_APROBAR', clientName: 'Aristea', title: 'Reel de lanzamiento', day: 'miércoles 22 de octubre', url: '/parrillas/p?item=i' });
  assert.equal(remind.label, 'Recordarle al cliente');
  assert.match(remind.ask, /WhatsApp/);
  assert.match(remind.ask, /enlace del portal/);
  assert.match(read('src/lib/briaAssistant.js'), /mensaje_para_cliente: '/);
  assert.match(read('src/services/briaAssistantService.js'), /\.\.\.briaClientUpdateTools/);
});
