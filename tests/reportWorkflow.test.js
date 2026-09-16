import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = await import('../src/services/reportWorkflowService.js').catch(() => ({}));
const fixture = () => ({ id: 'r1', status: 'DRAFT', updatedAt: new Date('2026-09-15'), client: { name: 'Cliente de prueba' }, normalizedMetrics: {
  schemaVersion: 2, version: 1, dataVersion: 1, reportPeriod: { start: '2026-08-01', end: '2026-08-31' },
  sourceExtractions: [{ sourceId: 'ig', platform: 'INSTAGRAM', observations: [
    { observationId: 'zero', key: 'linkClicks', label: 'Clics en el enlace', value: 0, rawValue: '0', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'ACCOUNT_TOTAL', evidence: 'Tarjeta: 0', period: { start: '2026-08-01', end: '2026-08-31' } },
    { observationId: 'views', key: 'views', label: 'Visualizaciones', value: 8418, rawValue: '8.418', unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', contextKey: 'ACCOUNT_TOTAL', evidence: 'Total: 8.418', period: { start: '2026-08-01', end: '2026-08-31' } }
  ] }], processingSummary: { totalFiles: 1, successfulFiles: 1, partialFiles: 0, failedFiles: 0 }, issues: [], facts: []
}, narrative: {} });

test('review changes the source observation and rebuilds facts preserving the observed zero', () => {
  assert.equal(typeof workflow.applyReportReview, 'function');
  const result = workflow.applyReportReview(fixture(), { expectedVersion: 1, updates: [{ observationId: 'views', value: 8411, reason: 'Corregido contra captura original' }] }, { actorId: 'u1' });
  assert.equal(result.normalizedMetrics.dataVersion, 2);
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.normalizedMetrics.facts.find(f => f.key === 'views').value, 8411);
  assert.equal(result.normalizedMetrics.facts.find(f => f.key === 'linkClicks').value, 0);
  assert.equal(result.normalizedMetrics.reviewHistory[0].actorId, 'u1');
  assert.equal(result.normalizedMetrics.sourceExtractions[0].observations.find(o => o.observationId === 'views').value, 8411);
  assert.equal(result.narrative.needsRegeneration, true);
});

test('review rejects stale versions, unknown observations, missing reasons and arbitrary fields', () => {
  assert.equal(typeof workflow.applyReportReview, 'function');
  assert.throws(() => workflow.applyReportReview(fixture(), { expectedVersion: 0, updates: [] }), /versión/i);
  assert.throws(() => workflow.applyReportReview(fixture(), { expectedVersion: 1, updates: [{ observationId: 'other', value: 2, reason: 'x' }] }), /observación/i);
  assert.throws(() => workflow.applyReportReview(fixture(), { expectedVersion: 1, updates: [{ observationId: 'views', value: 2 }] }), /motivo/i);
  assert.throws(() => workflow.applyReportReview(fixture(), { expectedVersion: 1, updates: [{ observationId: 'views', sourceId: 'other', reason: 'x' }] }), /campo/i);
});

test('semantic corrections preserve original source meaning and are versioned like numeric corrections', () => {
  const report = fixture();
  report.normalizedMetrics.sourceExtractions[0].observations[1].resultType = 'SUMMARY';
  const result = workflow.applyReportReview(report, { expectedVersion: 1, updates: [{
    observationId: 'views', key: 'followers', label: 'Seguidores del período',
    contextLabel: 'Actividad de Instagram', resultType: null,
    reason: 'Encabezado y leyenda comprobados en la captura original.'
  }] }, { actorId: 'maintenance:reports', actorType: 'MAINTENANCE' });
  const updated = result.normalizedMetrics.sourceExtractions[0].observations[1];
  assert.equal(updated.key, 'followers');
  assert.equal(updated.contextLabel, 'Actividad de Instagram');
  assert.equal(updated.resultType, null);
  assert.equal(updated.value, 8418);
  assert.equal(updated.review.actorType, 'MAINTENANCE');
  assert.equal(result.normalizedMetrics.reviewHistory[0].before.key, 'views');
  assert.equal(report.normalizedMetrics.sourceExtractions[0].observations[1].key, 'views');
  assert.equal(result.narrative.needsRegeneration, true);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', key: '', reason: 'Cambio' }] }), /key/i);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', resultType: {}, reason: 'Cambio' }] }), /resultType/i);
});

test('panel context wording can be corrected without discarding linked rows or original evidence', () => {
  const report = fixture();
  report.normalizedMetrics.sourceExtractions[0].panels = [{ panelId: 'p', platform: 'INSTAGRAM', contextKey: 'account_content', contextLabel: 'Contexto mal leído', metricKey: 'views', unit: 'count', scope: 'TOTAL', dataset: [{ label: 'Reels', value: 41 }] }];
  const result = workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ panelId: 'p', contextLabel: 'Contenido de Instagram', metricKey: 'followers', title: 'Seguidores del período', reason: 'Cabecera verificada' }] });
  assert.equal(result.normalizedMetrics.sourceExtractions[0].panels[0].contextLabel, 'Contenido de Instagram');
  assert.equal(result.normalizedMetrics.sourceExtractions[0].panels[0].metricKey, 'followers');
  assert.equal(result.normalizedMetrics.sourceExtractions[0].panels[0].title, 'Seguidores del período');
  assert.equal(result.normalizedMetrics.sourceExtractions[0].panels[0].dataset[0].value, 41);
  assert.equal(result.normalizedMetrics.reviewHistory[0].before.contextLabel, 'Contexto mal leído');
});

test('an approved report must be explicitly reopened before changing any figures', () => {
  assert.equal(typeof workflow.applyReportReview, 'function');
  const report = fixture(); report.status = 'PUBLISHED';
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, updates: [] }), /publicado/i);
});

test('explicit decimal corrections are not reparsed as thousands', () => {
  const result = workflow.applyReportReview(fixture(), { expectedVersion: 1, updates: [{ observationId: 'views', value: 2.999, reason: 'Valor decimal visible' }] });
  assert.equal(result.normalizedMetrics.issues.some(issue => issue.code === 'VALUE_RAW_MISMATCH'), false);
  assert.equal(result.normalizedMetrics.sourceExtractions[0].observations.find(o => o.observationId === 'views').rawValue, 2.999);
});

test('a panel correction addresses the exact panel, row and column and preserves the other values', () => {
  const report = fixture();
  report.normalizedMetrics.sourceExtractions[0].panels = [{ panelId: 'ig:formats', metricKey: 'views', platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', period: { start: '2026-08-01', end: '2026-08-31' }, dataset: [{ label: 'Reels', value: 933 }, { label: 'Foto', value: 109 }] }];
  const result = workflow.applyReportReview(report, { expectedVersion: 1, updates: [], panelUpdates: [{ panelId: 'ig:formats', rowIndex: 0, rowLabel: 'Reels', field: 'value', value: 934, reason: 'Lectura contrastada' }] });
  assert.equal(result.normalizedMetrics.panels.find(p => p.panelId === 'ig:formats').dataset[0].value, 934);
  assert.equal(result.normalizedMetrics.panels.find(p => p.panelId === 'ig:formats').dataset[1].value, 109);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ panelId: 'ig:formats', rowIndex: 0, rowLabel: 'Foto', field: 'value', value: 7, reason: 'x' }] }), /fila/i);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ panelId: 'ig:formats', rowIndex: 0, rowLabel: 'Reels', field: 'label', value: 7, reason: 'x' }] }), /columna/i);
});

test('panel context corrections preserve data and require valid explicit metadata', () => {
  const report = fixture();
  report.normalizedMetrics.sourceExtractions[0].panels = [{ panelId: 'ig:formats', metricKey: 'views', platform: 'UNKNOWN', scope: 'UNKNOWN', unit: 'count', dataset: [{ label: 'Reels', value: 933 }] }];
  const panelUpdate = { panelId: 'ig:formats', platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', period: { start: '2026-08-01', end: '2026-08-31' }, contextKey: 'CONTENT_FORMAT', reason: 'Encabezado confirmado contra la fuente' };
  const result = workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [panelUpdate] }, { actorId: 'u1' });
  const panel = result.normalizedMetrics.panels[0];
  assert.equal(panel.platform, 'INSTAGRAM');
  assert.equal(panel.periodProvenance, 'HUMAN_REVIEW');
  assert.equal(panel.dataset[0].value, 933);
  assert.equal(result.normalizedMetrics.reviewHistory[0].before.platform, 'UNKNOWN');
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ ...panelUpdate, platform: 'OTHER' }] }), /platform/i);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ ...panelUpdate, period: { start: '2026-02-30', end: '2026-03-31' } }] }), /período/i);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ ...panelUpdate, sourceId: 'wrong' }] }), /campo/i);
});

test('a reviewed value synchronizes only explicitly linked cells and records both corrections', () => {
  const report = fixture();
  const source = report.normalizedMetrics.sourceExtractions[0];
  source.observations[1].label = 'Reels';
  source.panels = [{ panelId: 'ig:formats', metricKey: 'views', platform: 'INSTAGRAM', scope: 'TOTAL', unit: 'count', observationIds: ['views'], dataset: [{ label: 'Reels', value: 8418 }, { label: 'Foto', value: 8418 }] }];
  const changed = workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', value: 9000, reason: 'Relectura de Reels' }] });
  assert.equal(changed.normalizedMetrics.panels[0].dataset[0].value, 9000);
  assert.equal(changed.normalizedMetrics.panels[0].dataset[1].value, 8418);
  assert.ok(changed.normalizedMetrics.reviewHistory.some(item => item.panelId === 'ig:formats' && item.linkedFrom === 'ig:views'));
  const fromPanel = workflow.applyReportReview(report, { expectedVersion: 1, panelUpdates: [{ panelId: 'ig:formats', rowIndex: 0, rowLabel: 'Reels', field: 'value', value: 7000, reason: 'Relectura de tabla' }] });
  assert.equal(fromPanel.normalizedMetrics.facts.find(item => item.key === 'views').value, 7000);
  assert.equal(fromPanel.normalizedMetrics.issues.some(item => item.code === 'RAW_VALUE_MISMATCH'), false);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', value: 9000, reason: 'Cifra' }], panelUpdates: [{ panelId: 'ig:formats', rowIndex: 0, rowLabel: 'Reels', field: 'value', value: 7000, reason: 'Tabla' }] }), /contradictori/i);
});

test('review corrects signed comparison percentages without changing the absolute figure', () => {
  const report = fixture();
  report.normalizedMetrics.sourceExtractions[0].observations[1].changePct = 95;
  const result = workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', changePct: -95.5, reason: 'La captura muestra una disminución de 95,5 %' }] });
  assert.equal(result.normalizedMetrics.facts.find(fact => fact.key === 'views').changePct, -95.5);
  assert.equal(result.normalizedMetrics.facts.find(fact => fact.key === 'views').value, 8418);
  assert.equal(result.normalizedMetrics.reviewHistory[0].before.changePct, 95);
  const cleared = workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', changePct: null, reason: 'Comparación no visible' }] });
  assert.equal(cleared.normalizedMetrics.facts.find(fact => fact.key === 'views').changePct, null);
  assert.throws(() => workflow.applyReportReview(report, { expectedVersion: 1, updates: [{ observationId: 'views', changePct: Infinity, reason: 'x' }] }), /variación/i);
});

test('publishing permits pending corrections and omitted sources with a current narrative', () => {
  assert.equal(typeof workflow.prepareReportPublication, 'function');
  const report = fixture();
  report.normalizedMetrics.facts = [{ factId: 'f', value: 0, status: 'OBSERVED' }];
  assert.throws(() => workflow.prepareReportPublication(report, 1), /análisis/i);
  report.narrative = { generationMode: 'EVIDENCE_AI', dataVersion: 1, claims: [{ factId: 'f' }], headline: 'Resultado' };
  report.normalizedMetrics.processingSummary.failedFiles = 1;
  assert.equal(workflow.prepareReportPublication(report, 1).status, 'PUBLISHED');
  report.normalizedMetrics.processingSummary.failedFiles = 0;
  report.normalizedMetrics.issues = [{ blocking: true, message: 'Importe en conflicto' }];
  report.normalizedMetrics.sourceFailures = [{ sourceId: 'pending' }];
  report.normalizedMetrics.readyForNarrative = false;
  report.normalizedMetrics.facts.push({ factId: 'conflict', value: 888, status: 'CONFLICT' });
  const before = structuredClone(report);
  assert.equal(workflow.prepareReportPublication(report, 1).status, 'PUBLISHED');
  assert.deepEqual(report, before);
  report.normalizedMetrics.facts = [report.normalizedMetrics.facts[1]];
  assert.throws(() => workflow.prepareReportPublication(report, 1), /cifras utilizables/i);
});

test('snapshot persistence uses a JSON version compare-and-swap and refuses stale writes', async () => {
  assert.equal(typeof workflow.saveReportVersion, 'function');
  let query;
  const tx = { metricReport: { updateMany: async q => { query = q; return { count: 0 }; } } };
  const db = { $transaction: fn => fn(tx) };
  await assert.rejects(workflow.saveReportVersion(db, fixture(), { status: 'REVIEW' }), /versión/i);
  assert.deepEqual(query.where.normalizedMetrics, { path: ['version'], equals: 1 });
  assert.equal(query.data.normalizedMetrics.version, 2);
});

test('evidence analysis parses markdown JSON but rejects unknown citations, invented figures and wrong networks', () => {
  assert.equal(typeof workflow.parseEvidenceAnalysis, 'function');
  const facts = [{ factId: 'ig-views', platform: 'INSTAGRAM', value: 8418, key: 'views', label: 'Visualizaciones' }];
  const good = { claims: [{ factId: 'ig-views', interpretation: 'Conviene evaluar qué formatos sostienen la visibilidad.', action: 'Comparar los formatos publicados.', kpi: 'Visualizaciones por formato' }] };
  assert.deepEqual(workflow.parseEvidenceAnalysis('```json\n' + JSON.stringify(good) + '\n```', facts), good);
  assert.throws(() => workflow.parseEvidenceAnalysis(JSON.stringify({ claims: [{ ...good.claims[0], factId: 'invented' }] }), facts), /referencia/i);
  assert.throws(() => workflow.parseEvidenceAnalysis(JSON.stringify({ claims: [{ ...good.claims[0], interpretation: 'Se obtuvieron 999999 ventas.' }] }), facts), /cifras|numérica/i);
  assert.throws(() => workflow.parseEvidenceAnalysis(JSON.stringify({ claims: [{ ...good.claims[0], interpretation: 'Facebook creció gracias a la campaña.' }] }), facts), /plataforma/i);
  assert.throws(() => workflow.parseEvidenceAnalysis('{"claims":[', facts), /JSON/i);
});

test('analysis generates numerical sentences from cited facts and keeps the zero', () => {
  assert.equal(typeof workflow.composeEvidenceNarrative, 'function');
  const report = fixture();
  report.normalizedMetrics.facts = [{ factId: 'f', key: 'linkClicks', label: 'Clics en el enlace', value: 0, unit: 'count', platform: 'INSTAGRAM', scope: 'TOTAL', precision: 'EXACT', status: 'OBSERVED' }];
  const narrative = workflow.composeEvidenceNarrative(report, { claims: [{ factId: 'f', interpretation: 'Conviene revisar la llamada a la acción.', action: 'Revisar los enlaces del perfil.', kpi: 'Clics en el enlace' }] });
  assert.equal(narrative.generationMode, 'EVIDENCE_AI');
  assert.equal(narrative.dataVersion, 1);
  assert.match(narrative.sections[0].paragraphs.join(' '), /0/);
  assert.match(narrative.sections[0].paragraphs.join(' '), /Instagram/);
  assert.equal(narrative.claims[0].factId, 'f');
});

test('narrative uses the same rounded label and percentage precision as the report document', () => {
  const report = fixture();
  report.normalizedMetrics.facts = [{ factId: 'f', key: 'views', label: 'Visualizaciones', value: 9400, rawValue: '9,4 mil', unit: 'count', platform: 'CROSS_PLATFORM', scope: 'TOTAL', precision: 'ROUNDED', changePct: -58.1234, status: 'OBSERVED' }];
  const result = workflow.composeEvidenceNarrative(report, { claims: [{ factId: 'f', interpretation: 'Conviene revisar el desglose de las redes.', action: 'Comparar los formatos.', kpi: 'Visualizaciones' }] });
  assert.match(result.sections[0].paragraphs[0], /≈ 9,4 mil/);
  assert.match(result.sections[0].paragraphs[0], /-58,1234 %/);
});
