import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricReportHtml } from '../src/services/metricReportPdf.js';
import { generateEvidenceNarrative } from '../src/services/reportWorkflowService.js';

const editorial = await import('../src/services/reportEditorialService.js').catch(() => ({}));
export const reportFixture = () => ({ id: 'example', client: { name: 'Cliente de muestra' }, status: 'REVIEW', startDate: '2026-08-01', endDate: '2026-08-31', normalizedMetrics: {
  schemaVersion: 2, version: 1, dataVersion: 1, issues: [], sourceFailures: [], sourceExtractions: [],
  facts: [
    { factId: 'views', key: 'views', label: 'Visualizaciones', value: 5200, rawValue: '5.200', unit: 'count', changePct: -12, precision: 'EXACT', platform: 'INSTAGRAM', scope: 'TOTAL', contextKey: 'account_content', entityLevel: 'ACCOUNT', status: 'OBSERVED', sourceIds: ['source'], observationIds: ['source:views'], period: { start: '2026-08-01', end: '2026-08-31' } },
    { factId: 'clicks', key: 'linkClicks', label: 'Clics en el enlace', value: 0, rawValue: '0', unit: 'count', changePct: null, precision: 'EXACT', platform: 'INSTAGRAM', scope: 'TOTAL', contextKey: 'account_content', entityLevel: 'ACCOUNT', status: 'OBSERVED', sourceIds: ['source'], observationIds: ['source:clicks'], period: { start: '2026-08-01', end: '2026-08-31' } }
  ], panels: []
} });
const responseFor = context => {
  const [section] = context.sections, ref = section.evidenceIds[0];
  const point = { title: 'Visibilidad y siguiente paso', observation: `El indicador registra {{${ref}.value}}.`, interpretation: 'La exposición permite evaluar el interés por el contenido; conviene contrastarlo con las visitas al perfil.', action: 'Probar una llamada al perfil en el contenido de producto.', evidenceIds: [ref] };
  return { summary: { title: 'Balance del período', text: `El período deja una base de {{${ref}.value}} para orientar el siguiente ciclo de contenidos.`, evidenceIds: [ref] }, sectionComments: [{ sectionId: section.id, ...point }], opportunities: [point], recommendations: [{ title: 'Conectar contenido y perfil', rationale: 'La visibilidad permite plantear una prueba de la llamada al perfil.', action: 'Comparar publicaciones con una llamada clara al perfil.', kpi: 'Visitas al perfil y clics en el enlace', priority: 'ALTA', evidenceIds: [ref] }], closing: { title: 'Enfoque para el siguiente período', text: 'El siguiente ciclo se centrará en comprobar qué contenidos facilitan el paso hacia el perfil.', evidenceIds: [ref] } };
};

test('editorial provides a stable template with grounded commentary and preserved zero', () => {
  assert.equal(typeof editorial.buildEditorialContext, 'function');
  const report = reportFixture(), context = editorial.buildEditorialContext(report);
  assert.equal(context.evidence.length, 2);
  assert.ok(context.evidence.some(item => item.value === 0));
  const narrative = editorial.composeEditorialNarrative(report, responseFor(context));
  assert.equal(narrative.editorial.version, 1);
  assert.equal(narrative.dataVersion, 1);
  assert.equal(narrative.editorial.sectionComments.length, context.sections.length);
  assert.match(narrative.editorial.summary.text, /5\.200/);
  assert.equal(narrative.actionPlan[0].priority, 'ALTA');
  assert.ok(narrative.claims[0].factId);
});

test('editorial accepts fenced JSON but blocks invented figures, references, omitted sections and unknown changes', () => {
  assert.equal(typeof editorial.composeEditorialNarrative, 'function');
  const report = reportFixture(), context = editorial.buildEditorialContext(report), valid = responseFor(context);
  assert.doesNotThrow(() => editorial.composeEditorialNarrative(report, '```json\n' + JSON.stringify(valid) + '\n```'));
  for (const mutate of [
    data => { data.summary.text = 'Se generaron 999 ventas.'; },
    data => { data.summary.text = '{{E999.value}} visualizaciones.'; },
    data => { data.sectionComments = []; },
    data => { data.summary.evidenceIds = ['inventada']; },
    data => { data.summary.text = 'La estrategia garantiza ventas.'; },
    data => { data.sectionComments[0].interpretation = 'Facebook muestra una oportunidad.'; },
    data => { data.summary.text = '{{E2.change}}'; data.summary.evidenceIds = ['E2']; },
  ]) {
    const data = structuredClone(valid); mutate(data);
    assert.throws(() => editorial.composeEditorialNarrative(report, data));
  }
});

test('editorial ties panel-only data to the visible cell and keeps a different client separate', () => {
  assert.equal(typeof editorial.buildEditorialContext, 'function');
  const report = reportFixture();
  report.normalizedMetrics.panels = [{ panelId: 'formats', sourceId: 'source', title: 'Volumen publicado', platform: 'INSTAGRAM', scope: 'TOTAL', contextKey: 'account_content', unit: 'count', metricKey: 'contentCount', period: report.normalizedMetrics.facts[0].period, dataset: [{ label: 'Historias', value: 7 }, { label: 'Publicaciones', value: null }] }];
  const context = editorial.buildEditorialContext(report);
  const panel = context.evidence.find(item => item.value === 7);
  assert.equal(panel.label, 'Historias · Contenido publicado');
  assert.deepEqual(panel.sourceIds, ['source']);
  assert.ok(context.sections.some(section => section.evidenceIds.includes(panel.id)));
  assert.equal(context.evidence.some(item => item.value === null), false);
  const other = reportFixture(); other.client.name = 'Otra marca'; other.normalizedMetrics.facts[0].value = 8100; other.normalizedMetrics.facts[0].rawValue = '8.100';
  assert.equal(editorial.buildEditorialContext(other).client, 'Otra marca');
  assert.equal(editorial.buildEditorialContext(other).evidence[0].value, 8100);
});

test('PDF pairs results with explanations and finishes with learning and strategic action plan', () => {
  assert.equal(typeof editorial.composeEditorialNarrative, 'function');
  const report = reportFixture();
  report.narrative = editorial.composeEditorialNarrative(report, responseFor(editorial.buildEditorialContext(report)));
  const html = buildMetricReportHtml(report, { preview: true });
  for (const label of ['Resumen ejecutivo', 'Lectura del resultado', 'Qué significa', 'Próximo paso', 'Oportunidades y aprendizajes', 'Recomendaciones estratégicas', 'Plan de acción']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('data-editorial-comment'));
  assert.ok(html.includes('data-kpi-card'));
  assert.ok(html.indexOf('Resumen ejecutivo') < html.indexOf('data-kpi-card'));
  assert.doesNotMatch(html, /Fuentes y metodología/);
  assert.ok(html.indexOf('Plan de acción') < html.indexOf('<footer class="agency-signoff">'));
});

test('production generation uses the editorial contract, dedicated economical model and records usage', async () => {
  const report = reportFixture(); report.normalizedMetrics.readyForNarrative = true;
  report.normalizedMetrics.reviewHistory = [{ secret: 'HISTORY_NOT_FOR_PROMPT' }];
  const previous = process.env.OPENAI_MODEL; process.env.OPENAI_MODEL = 'gpt-6-astra';
  let request;
  const client = { generate: async options => { request = options; return { text: '```json\n' + JSON.stringify(responseFor(editorial.buildEditorialContext(report))) + '\n```', model: options.model, id: 'example-response', raw: { usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } } }; } };
  try {
    const narrative = await generateEvidenceNarrative(report, { client });
    assert.equal(request.model, 'gpt-5.6-terra');
    assert.ok(request.responseSchema.properties.sectionComments);
    assert.doesNotMatch(request.prompt, /HISTORY_NOT_FOR_PROMPT/);
    assert.match(request.prompt, /cliente sin formación técnica/);
    assert.match(request.prompt, /resultados de este período/);
    assert.equal(narrative.editorial.version, 1);
    assert.equal(narrative.generationMetadata.usage.totalTokens, 300);
    await assert.rejects(generateEvidenceNarrative(report, { client: { generate: async () => ({ text: '{}', raw: { status: 'incomplete' } }) } }), /interrumpido/i);
  } finally { if (previous === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previous; }
});

test('a Facebook distribution observation can explain its explicit Instagram origin', () => {
  const report = reportFixture(); report.normalizedMetrics.facts = [report.normalizedMetrics.facts[0]];
  Object.assign(report.normalizedMetrics.facts[0], { platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content', contextLabel: 'Contenido de Instagram distribuido en Facebook' });
  const context = editorial.buildEditorialContext(report), data = responseFor(context);
  data.sectionComments[0].observation = 'Facebook registra {{E1.value}} visualizaciones de contenido de Instagram distribuido allí.';
  assert.doesNotThrow(() => editorial.composeEditorialNarrative(report, data));
});

test('a recommendation may contrast Facebook native metrics with explicitly cited cross distribution', () => {
  const report = reportFixture();
  Object.assign(report.normalizedMetrics.facts[0], { platform: 'FACEBOOK', contextKey: 'account_content' });
  Object.assign(report.normalizedMetrics.facts[1], { platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content' });
  const context = editorial.buildEditorialContext(report), data = responseFor(context);
  data.sectionComments = context.sections.map(section => ({ ...data.sectionComments[0], sectionId: section.id, evidenceIds: section.evidenceIds, observation: 'Resultado de esta sección.' }));
  data.recommendations[0].evidenceIds = context.evidence.map(item => item.id);
  data.recommendations[0].rationale = 'Revisar el contenido nativo de Facebook junto con la distribución del contenido de Instagram.';
  assert.doesNotThrow(() => editorial.composeEditorialNarrative(report, data));
});

test('the editorial voice projects opportunities and rejects discouraging wording without changing data', () => {
  const report = reportFixture(), context = editorial.buildEditorialContext(report), valid = responseFor(context);
  for (const phrase of ['La visibilidad retrocedió.', 'Caída generalizada en Facebook', 'Las visualizaciones bajaron.', 'Se observa deterioro.', 'El contenido no está funcionando.', 'Menor alcance y menos clics']) {
    const data = structuredClone(valid); data.summary.text = phrase;
    assert.throws(() => editorial.composeEditorialNarrative(report, data), /tono|propositivo|oportunidad/i, phrase);
  }
  valid.sectionComments[0].interpretation = 'La base actual abre una oportunidad para ampliar la visibilidad con nuevas pruebas de contenido.';
  const narrative = editorial.composeEditorialNarrative(report, valid);
  assert.equal(report.normalizedMetrics.facts[0].changePct, -12);
  assert.match(buildMetricReportHtml({ ...report, narrative }, { preview: true }), /-12 %/);
  assert.match(narrative.editorial.sectionComments[0].interpretation, /oportunidad/);
});

test('positive prose cannot relabel total interactions as organic', () => {
  const report = reportFixture(); report.normalizedMetrics.facts[0].key = 'interactions';
  const context = editorial.buildEditorialContext(report), data = responseFor(context);
  data.closing.evidenceIds = [context.evidence.find(item => item.key === 'interactions').id];
  data.closing.text = 'El próximo período puede capitalizar la interacción orgánica de Instagram.';
  assert.throws(() => editorial.composeEditorialNarrative(report, data), /orgánic|desglose/i);
  report.normalizedMetrics.facts[0].scope = 'ORGANIC';
  const organic = editorial.buildEditorialContext(report), valid = responseFor(organic);
  valid.closing.text = data.closing.text;
  assert.doesNotThrow(() => editorial.composeEditorialNarrative(report, valid));
});

test('the metric label cannot erase a distribution claim during validation', () => {
  const report = reportFixture(), context = editorial.buildEditorialContext(report), data = responseFor(context);
  data.summary.text = 'Visualizaciones orgánicas para orientar el siguiente período.';
  assert.throws(() => editorial.composeEditorialNarrative(report, data), /orgánic|desglose/i);
});
