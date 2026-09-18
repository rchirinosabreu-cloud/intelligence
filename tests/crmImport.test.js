import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseCrmWorkbook, buildImportPlan, runImport, parseExcelDate, splitDatedNotes, mapOrigin, mapStage } from '../scripts/import-crm-excel.js';
import { createCrmMemoryDb } from './fixtures/crmMemoryDb.js';

const HEADERS = ['ID', 'Fuente', 'Origen / canal', 'Fecha ingreso al CRM', 'Contacto', 'Empresa / cliente', 'Cargo / rol', 'Teléfono', 'Email', 'URL / LinkedIn', 'Servicio / oportunidad', 'Idioma', 'Contacto permitido', 'Prioridad', 'Fecha publicación / emisión', 'Cierre convocatoria', 'Fecha primer contacto', 'Fecha propuesta', 'Fecha última gestión', 'Etapa comercial', 'Resultado', 'Semáforo', 'Próxima acción', 'Fecha próximo seguimiento (sugerida)', 'Responsable', 'Valor cotizado', 'Observaciones / historial'];

const workbook = () => {
  const wb = XLSX.utils.book_new();
  const master = [
    ['CRM COMERCIAL MAESTRO · BRAIN STUDIO'], ['Unifica prospectos'], [],
    HEADERS,
    ['LNK-001', 'LinkedIn', 'Prospección LinkedIn', '', '', 'Fundación Naumann', '', '', '', 'https://lnkd.in/x', 'Agencia de marketing', 'Español / Inglés', '', 'Media', '29-Jul-2026', '31 de agosto de 2026, a las 16:00 CEST', '', '', '', 'Por gestionar', 'Abierto', 'Amarillo', 'Validar datos y realizar primer contacto.', '', 'Comercial', '', ''],
    ['BRN-001', 'Brain Studio', 'Sobrina Kedys ElimHomeSpa', '', '', 'Kedys Salcedo', '', '', '', '', 'Marketing', 'Español', '', 'Media', '', '', '', '09-Jan-2026', '09-Jan-2026', 'Propuesta enviada', 'Abierto', 'Amarillo', 'Hacer seguimiento y buscar una fecha de decisión.', '', 'Comercial', '$1,548,000', ''],
    ['BRN-109', 'Brain Studio', 'Contacto directo / proceso estratégico', '', 'Juan Sebastián Mayorca', 'Solty SAS', '', '', 'jm@solty.test', '', 'Marketing digital', 'Español', '', 'Alta', '', '', '11-Aug-2026', '27-Aug-2026', '08-Sep-2026', 'Esperando cliente', 'Abierto', 'Amarillo', 'Retomar seguimiento.', '27-Sep-2026', 'Francisco + Comercial', '', '11-Aug-2026: conversación inicial. 27-Aug-2026: propuesta enviada. El cliente indicó que revisaría el tema con su equipo.'],
    ['BRN-006', 'Brain Studio', 'Contacto / canal Brain Studio', '', '', 'Juan Diego', '', '', '', '', 'Portafolio', 'Español', '', 'Media', '', '', '', '09-Jan-2026', '09-Jan-2026', 'Cerrado / perdido', 'Perdido', 'Rojo', 'Registrar motivo de pérdida y archivar.', '', 'Comercial', '$400,000', ''],
    ['BRN-120', 'Brain Studio', 'Contacto / canal Brain Studio', '', '', 'Bonsai', '', '', '', '', '', 'Español', '', 'Media', '', '', '', '05-Sep-2026', '09-Sep-2026', 'Estado raro', 'Aprobado', 'Verde', 'Formalizar.', '', 'Comercial', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(master), 'CRM Maestro');
  const log = [
    ['BITÁCORA DE GESTIONES COMERCIALES'], [],
    ['Fecha', 'Empresa / cliente', 'Contacto', 'Tipo de gestión', 'Resultado / nota', 'Próxima acción', 'Responsable'],
    ['11-Aug-2026', 'Solty SAS', 'Juan Sebastián Mayorca', 'Contacto', 'Conversación inicial.', 'Preparar/ajustar propuesta.', 'Francisco'],
    ['27-Aug-2026', 'Solty SAS', 'Juan Sebastián Mayorca', 'Propuesta enviada', 'Última propuesta enviada.', 'Seguimiento.', 'Francisco'],
    ['08-Sep-2026', 'Solty S.A.S.', 'Juan Sebastián Mayorca', 'Respuesta cliente', 'Revisará con su equipo.', 'Revisar alrededor del 27-Sep.', 'Francisco'],
    ['09-Sep-2026', 'Bonsai', '', 'Aprobación', 'Propuesta aprobada.', 'Onboarding.', 'Francisco'],
    ['14-Sep-2026', 'Promo Group', '', 'Aprobación / cierre', 'Cerrada favorablemente.', 'Onboarding.', 'Francisco']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(log), 'Bitácora gestiones');
  return wb;
};

test('parseExcelDate reads the three date styles of the workbook and ignores times', () => {
  assert.equal(parseExcelDate('29-Jul-2026')?.toISOString(), '2026-07-29T05:00:00.000Z');
  assert.equal(parseExcelDate('31 de agosto de 2026, a las 16:00 CEST')?.toISOString(), '2026-08-31T05:00:00.000Z');
  assert.deepEqual(parseExcelDate('Agosto de 2026'), Object.assign(new Date('2026-08-01T05:00:00.000Z'), { approximate: true }));
  assert.equal(parseExcelDate(new Date('2026-09-05T00:00:00Z'))?.toISOString(), '2026-09-05T05:00:00.000Z');
  assert.equal(parseExcelDate(''), null);
  assert.equal(parseExcelDate('sin fecha'), null);
});

test('mapOrigin and mapStage translate the Excel vocabulary into the closed catalogs', () => {
  assert.deepEqual(mapOrigin('LinkedIn', 'Prospección LinkedIn'), { origin: 'LINKEDIN', originDetail: null });
  assert.deepEqual(mapOrigin('Brain Studio', 'Contacto / canal Brain Studio'), { origin: 'CONTACTO_DIRECTO', originDetail: null });
  assert.deepEqual(mapOrigin('Brain Studio', 'Sobrina Kedys ElimHomeSpa'), { origin: 'REFERIDO', originDetail: 'Sobrina Kedys ElimHomeSpa' });
  assert.deepEqual(mapOrigin('Brain Studio', 'Contacto directo / proceso estratégico'), { origin: 'CONTACTO_DIRECTO', originDetail: 'Contacto directo / proceso estratégico' });
  assert.equal(mapOrigin('Brain Studio', 'Convocatoria pública').origin, 'CONVOCATORIA');
  assert.equal(mapStage('Esperando RFP'), 'ESPERANDO_CLIENTE');
  assert.equal(mapStage('Pendiente aprobación ajuste'), 'ESPERANDO_CLIENTE');
  assert.equal(mapStage('No respuesta / estancado'), 'SIN_RESPUESTA');
  assert.equal(mapStage('Cerrado / perdido'), 'PERDIDO');
  assert.equal(mapStage('Ganado / contratado'), 'GANADO');
  assert.equal(mapStage('En preparación'), 'CONTACTADO');
  assert.equal(mapStage('Estado raro'), null);
});

test('splitDatedNotes turns "DD-MMM-YYYY: …" fragments into dated notes and keeps the rest', () => {
  const { notes, entries } = splitDatedNotes('11-Aug-2026: conversación inicial. 27-Aug-2026: propuesta enviada. El cliente indicó que revisaría el tema con su equipo.');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].occurredAt.toISOString(), '2026-08-11T05:00:00.000Z');
  assert.equal(entries[0].note, 'conversación inicial.');
  assert.equal(entries[1].note, 'propuesta enviada. El cliente indicó que revisaría el tema con su equipo.');
  assert.equal(notes, null);
  assert.deepEqual(splitDatedNotes('Texto sin fechas'), { notes: 'Texto sin fechas', entries: [] });
  assert.deepEqual(splitDatedNotes(''), { notes: null, entries: [] });
});

test('parseCrmWorkbook finds the header rows by name and skips blank rows', () => {
  const parsed = parseCrmWorkbook(workbook());
  assert.equal(parsed.leads.length, 5);
  assert.equal(parsed.leads[0]['ID'], 'LNK-001');
  assert.equal(parsed.activities.length, 5);
  assert.equal(parsed.activities[0]['Empresa / cliente'], 'Solty SAS');
});

test('buildImportPlan maps every lead, estimates entry dates, attaches log rows and reports what it could not place', () => {
  const importedAt = new Date('2026-09-18T15:00:00-05:00');
  const plan = buildImportPlan(parseCrmWorkbook(workbook()), { owners: { comercial: 'tm-com', francisco: 'tm-fran' }, importedAt, authorId: 'u-import' });
  assert.equal(plan.leads.length, 5);
  const byCode = Object.fromEntries(plan.leads.map(lead => [lead.legacyCode, lead]));

  const lnk = byCode['LNK-001'];
  assert.equal(lnk.origin, 'LINKEDIN');
  assert.equal(lnk.stage, 'POR_GESTIONAR');
  assert.equal(lnk.enteredAt.toISOString(), '2026-07-29T05:00:00.000Z', 'publication date stands in for the missing entry date');
  assert.equal(lnk.enteredAtEstimated, true);
  assert.equal(lnk.publishedAt.toISOString(), '2026-07-29T05:00:00.000Z');
  assert.equal(lnk.callDeadlineAt.toISOString(), '2026-08-31T05:00:00.000Z');
  assert.equal(lnk.language, 'Español / Inglés');
  assert.equal(lnk.ownerId, 'tm-com');
  assert.equal(lnk.company, 'Fundación Naumann');
  assert.equal(lnk.activities.length, 0);

  const brn1 = byCode['BRN-001'];
  assert.equal(brn1.origin, 'REFERIDO');
  assert.equal(brn1.quotedValue, 1548000);
  assert.equal(brn1.proposalSentAt.toISOString(), '2026-01-09T05:00:00.000Z');
  assert.equal(brn1.firstContactAt.toISOString(), '2026-01-09T05:00:00.000Z', 'a sent proposal implies contact happened');
  assert.equal(brn1.enteredAt.toISOString(), '2026-01-09T05:00:00.000Z');

  const solty = byCode['BRN-109'];
  assert.equal(solty.ownerId, 'tm-fran');
  assert.equal(solty.stage, 'ESPERANDO_CLIENTE');
  assert.equal(solty.email, 'jm@solty.test');
  assert.equal(solty.nextFollowUpAt.toISOString(), '2026-09-27T05:00:00.000Z');
  assert.equal(solty.firstContactAt.toISOString(), '2026-08-11T05:00:00.000Z');
  assert.equal(solty.notes, null);
  // Oldest first; a log row whose channel is unknown stays a NOTA prefixed with the original label.
  assert.deepEqual(solty.activities.map(item => item.type), ['NOTA', 'NOTA', 'NOTA', 'PROPUESTA_ENVIADA', 'RESPUESTA_CLIENTE']);
  assert.equal(solty.activities[0].note, 'conversación inicial.');
  assert.equal(solty.activities[1].note, '[Contacto] Conversación inicial.');
  assert.equal(solty.activities[4].note, 'Revisará con su equipo.');
  assert.equal(solty.activities[4].nextAction, 'Revisar alrededor del 27-Sep.');
  assert.ok(solty.activities.every(item => item.authorId === 'u-import'));

  const lost = byCode['BRN-006'];
  assert.equal(lost.stage, 'PERDIDO');
  assert.equal(lost.closedAt.toISOString(), '2026-01-09T05:00:00.000Z');
  assert.match(lost.lostReason, /Excel/);

  const odd = byCode['BRN-120'];
  assert.equal(odd.stage, 'APROBADA', 'the Excel result column rescues an unknown stage label');
  assert.equal(odd.activities.length, 1);
  assert.equal(odd.activities[0].type, 'RESPUESTA_CLIENTE');

  assert.deepEqual(plan.report.unmatchedActivities.map(item => item['Empresa / cliente']), ['Promo Group']);
  assert.equal(plan.report.estimatedEntryDates, 5);
  assert.deepEqual(plan.report.unknownStages, [{ legacyCode: 'BRN-120', label: 'Estado raro', resolved: 'APROBADA' }]);
  assert.equal(plan.report.byStage.POR_GESTIONAR, 1);
});

test('runImport is idempotent by legacyCode and writes nothing in dry-run mode', async () => {
  const plan = buildImportPlan(parseCrmWorkbook(workbook()), { owners: {}, importedAt: new Date('2026-09-18T15:00:00-05:00') });
  const db = createCrmMemoryDb();
  const dry = await runImport(db, plan, { dryRun: true });
  assert.equal(dry.created, 5);
  assert.equal(db.state.leads.length, 0);
  const first = await runImport(db, plan);
  assert.deepEqual([first.created, first.skipped, first.activities], [5, 0, 6]);
  assert.equal(db.state.leads.length, 5);
  assert.equal(db.state.activities.length, 6);
  const again = await runImport(db, plan);
  assert.deepEqual([again.created, again.skipped, again.activities], [0, 5, 0]);
  assert.equal(db.state.leads.length, 5);
  assert.equal(db.state.leads.find(lead => lead.legacyCode === 'BRN-109').ownerId, null, 'without a mapping the owner stays empty instead of guessing');
});
