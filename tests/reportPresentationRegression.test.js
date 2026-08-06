import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  filterCanonicalMetrics,
  filterTopContentRows,
  isDemographicDataset,
  splitAchievement,
  safeClassName,
  buildReportFileName,
  getReviewMetricEntries,
  getOrganicPlatformLabel,
  adaptOrganicSummary,
  hasZeroMetricReference,
  sanitizeNarrativeForReport
} from '../src/lib/reportPresentation.js';

test('report presentation regressions', async (t) => {
  await t.test('general results contain canonical metrics only', () => {
    assert.deepEqual(Object.keys(filterCanonicalMetrics({
      spend: { value: 1 }, warnings: ['x'], processingSummary: {}, demographics: {}
    })), ['spend']);
  });

  await t.test('metric review omits missing or zero placeholder cards', () => {
    assert.deepEqual(getReviewMetricEntries({
      spend: { value: 232826 }, clicks: { value: 0 }, ctr: { value: 0 }, results: { value: 52 }
    }).map(([key]) => key), ['spend', 'results']);
  });

  await t.test('canonical metric grids omit zero-valued cards from published reports', () => {
    assert.deepEqual(Object.keys(filterCanonicalMetrics({
      spend: { value: 233058 }, clicks: { value: 0 }, ctr: { value: 0 }, impressions: { value: '0' }, results: { value: 104 }
    })), ['spend', 'results']);
  });

  await t.test('metric audit presents one organic group before paid fields', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const organicReview = component.indexOf('Resumen orgánico detectado');
    const paidReview = component.indexOf('Métricas de pauta detectadas');
    assert.ok(organicReview > -1);
    assert.ok(paidReview > organicReview);
  });

  await t.test('demographic points are recognized without a generic value key', () => {
    assert.equal(isDemographicDataset([{ label: '25-34', hombres: 40, mujeres: 60 }]), true);
  });

  await t.test('ambiguous organic sources use a precise cross-platform label', () => {
    assert.equal(getOrganicPlatformLabel('FACEBOOK'), 'Facebook');
    assert.equal(getOrganicPlatformLabel('INSTAGRAM'), 'Instagram');
    assert.equal(getOrganicPlatformLabel('UNKNOWN'), 'Orgánico');
    assert.equal(getOrganicPlatformLabel('CROSS_PLATFORM'), 'Instagram + Facebook');
  });

  await t.test('paid metric cards do not truncate large currency values', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const start = component.indexOf('const MetricGrid');
    const end = component.indexOf('\nconst OrganicSummary', start);
    const implementation = component.slice(start, end);
    assert.ok(start > -1, 'missing MetricGrid component');
    assert.doesNotMatch(implementation, /<h4[^>]*\btruncate\b/);
    assert.match(implementation, /break-words/);
  });

  await t.test('format distribution labels are excluded from ad publications', () => {
    const rows = filterTopContentRows([
      { title: 'REEL - ELEGIR COLEGIO', results: 3, impressions: 1105, reach: 869 },
      { title: 'Reels', results: 36 },
      { title: 'Enlaces', results: 10 },
      { title: 'Historias', results: 6 },
      { title: 'Foto', results: 3 },
      { title: 'Varias fotos', results: 1 },
      { title: 'Otros', results: 1 },
      { title: 'POST SIN RESULTADOS', results: 0, impressions: 0, reach: 0 }
    ]);
    assert.deepEqual(rows.map(row => row.title), ['REEL - ELEGIR COLEGIO']);
  });

  await t.test('achievement markdown becomes a title and supporting copy', () => {
    assert.deepEqual(splitAchievement('**Alcance total robusto:** Se alcanzaron 8.978 usuarios.'), {
      title: 'Alcance total robusto',
      description: 'Se alcanzaron 8.978 usuarios.'
    });
  });

  await t.test('HTML export safely reads SVG className objects and absent titles', () => {
    assert.equal(safeClassName({ baseVal: 'recharts-layer' }), 'recharts-layer');
    assert.equal(safeClassName(undefined), '');
    assert.equal(buildReportFileName(undefined), 'reporte_de_desempeno_digital.html');
  });

  await t.test('report presents scoped organic results before paid results', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const organicHeading = component.indexOf('Resultados generales — Desempeño orgánico');
    const adsHeading = component.indexOf('Resultados generales — Desempeño de pauta');
    assert.ok(organicHeading > -1, 'missing organic summary heading');
    assert.ok(adsHeading > organicHeading, 'paid summary must appear after organic summary');
    assert.match(component, /report\.normalizedMetrics\?\.organicSummary/);
    assert.match(component, /report\.normalizedMetrics\?\.adsSummary/);
  });

  await t.test('legacy platform summaries collapse into four organic headline metrics', () => {
    const summary = adaptOrganicSummary({
      FACEBOOK: { follows: { value: 7 }, views: { value: 15000 }, interactions: { value: 26 }, reach: { value: 9000 }, spend: { value: 1000 }, ctr: { value: 2 } },
      INSTAGRAM: { follows: { value: 12 }, views: { value: 21000 }, interactions: { value: 84 }, reachOrganic: { value: 13000 }, impressions: { value: 30000 } },
      UNKNOWN: { clicks: { value: 90 }, reachPaid: { value: 5000 } },
      CROSS_PLATFORM: { results: { value: 50 } }
    });
    assert.deepEqual(Object.keys(summary), ['follows', 'views', 'interactions', 'reach']);
    assert.equal(summary.follows.value, 19);
    assert.equal(summary.views.value, 36000);
    assert.equal(summary.interactions.value, 110);
    assert.equal(summary.reach.value, 22000);
  });

  await t.test('dedicated organic summary cannot delegate rendering to the generic metric grid', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const start = component.indexOf('const OrganicSummary');
    const end = component.indexOf('\nconst ', start + 10);
    const implementation = component.slice(start, end);
    assert.ok(start > -1, 'missing dedicated OrganicSummary component');
    assert.doesNotMatch(implementation, /<MetricGrid/);
    assert.doesNotMatch(implementation, /Object\.entries\(report\.normalizedMetrics\.organicSummary\)/);
    assert.doesNotMatch(implementation, /UNKNOWN|CROSS_PLATFORM|Inversión|Impresiones|CTR|Pauta/);
  });

  await t.test('cover encodes exactly two deliberate title lines and protects the first on desktop', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(component, /data-cover-line="title"[^>]*whitespace-nowrap[^>]*>Reporte de desempeño digital<\/span>/);
    assert.match(component, /data-cover-line="client"[^>]*text-\[#144c8c\][^>]*>de \{clientName\}<\/span>/);
    assert.equal((component.match(/data-cover-line=/g) || []).length, 2);
  });

  await t.test('report root exposes the compiled deployment SHA for DevTools verification', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const viteConfig = await fs.readFile('vite.config.js', 'utf8');
    assert.match(component, /data-build=\{BUILD_SHA\}/);
    assert.match(viteConfig, /RAILWAY_GIT_COMMIT_SHA/);
  });

  await t.test('report sections expose their source id for chart traceability', async () => {
    const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
    assert.match(route, /sourceId:\s*res\.sourceId/);
    assert.match(route, /buildScopedReportData/);
  });

  await t.test('fallback narratives are visibly marked for human review', async () => {
    const route = await fs.readFile('src/routes/api/reports.js', 'utf8');
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(route, /generationMode:\s*'NARRATIVE_FAILED'/);
    assert.match(component, /Narrativa necesita regeneración/);
  });

  await t.test('vision prompt does not restrict organic metrics to paid keys', async () => {
    const service = await fs.readFile('src/services/reportVisionService.js', 'utf8');
    assert.doesNotMatch(service, /key name \(strictly: "spend"/);
    assert.match(service, /organic semantic keys listed above/);
  });

  await t.test('Reports.jsx encapsulates publishable value guard locally and never references imported hasPublishableValue', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.doesNotMatch(component, /hasPublishableValue/);
    assert.match(component, /const hasReportValue =/);
  });

  await t.test('built frontend bundle must not carry the legacy hasPublishableValue symbol', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.doesNotMatch(component, /hasPublishableValue/);
  });

  await t.test('published narrative removes recommendations based on zero metrics only', () => {
    assert.equal(hasZeroMetricReference('Meta Ads reporta 0 clics y CTR 0%.'), true);
    assert.equal(hasZeroMetricReference('CTR reportado >= 0.7% y clics al alza.'), false);

    const sanitized = sanitizeNarrativeForReport({
      oportunidadesYAprendizajes: [
        { title: 'Trazabilidad ausente', evidence: 'Meta Ads reporta 23.568 impresiones, 52 resultados, pero 0 clics y CTR 0%.', learning: 'No refleja clics.', application: 'Auditar.' },
        { title: 'Resultados visibles', evidence: 'Meta Ads reporta 52 resultados y 23.568 impresiones.', learning: 'Hay respuesta medible.', application: 'Revisar creatividades.' }
      ],
      actionPlan: [
        { action: 'Auditar tracking por 0 clics', kpi: 'CTR 0%', suggestedAssignee: 'Paid Media' },
        { action: 'Priorizar anuncios con resultados', kpi: 'Costo por resultado estable', suggestedAssignee: 'Paid Media' }
      ],
      recomendacionesEstrategicas: [
        { priority: 'ALTA', action: 'Corregir medicion de clics/CTR', rationale: 'Sin senales de 0 clics no se puede optimizar.', kpi: 'CTR 0%' },
        { priority: 'MEDIA', action: 'Reasignar presupuesto a piezas con resultados', rationale: 'Los resultados visibles permiten comparar volumen.', kpi: 'Resultados por 1.000 impresiones' }
      ]
    });

    assert.deepEqual(sanitized.oportunidadesYAprendizajes.map(item => item.title), ['Resultados visibles']);
    assert.deepEqual(sanitized.actionPlan.map(item => item.action), ['Priorizar anuncios con resultados']);
    assert.deepEqual(sanitized.recomendacionesEstrategicas.map(item => item.action), ['Reasignar presupuesto a piezas con resultados']);
  });

  await t.test('report action plan no longer renders the responsible column', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const start = component.indexOf('const ActionPlan');
    const end = component.indexOf('\nconst SourceAppendix', start);
    const implementation = component.slice(start, end);
    assert.ok(start > -1, 'missing ActionPlan component');
    assert.doesNotMatch(implementation, /Responsable|suggestedAssignee/);
  });

  await t.test('bar chart value labels are counts by default, not percentages', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const barChartStart = component.indexOf("if (chartType === 'BAR_CHART')");
    const donutStart = component.indexOf("if (chartType === 'DONUT_CHART')", barChartStart);
    const implementation = component.slice(barChartStart, donutStart);
    assert.doesNotMatch(implementation, /\$\{val\}%/);
    assert.match(implementation, /toLocaleString\('es-ES'\)/);
  });

  await t.test('granular demographic comments reuse the same chart comment component', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const start = component.indexOf('const GranularNarrativeBlock');
    const end = component.indexOf('\nconst ReportCover', start);
    const implementation = component.slice(start, end);
    assert.match(implementation, /=>\s*\(\s*<SectionInsight/);
  });

  await t.test('report exposes a print-optimized PDF download path instead of canvas screenshots', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(component, /const downloadPDF\s*=/);
    assert.match(component, /Descargar PDF/);
    assert.match(component, /buildReportExportHtml\(\{\s*mode:\s*'pdf'\s*\}\)/);
    assert.match(component, /window\.print\(\)/);
    const downloadPdfStart = component.indexOf('const downloadPDF');
    const getImageUrlStart = component.indexOf('\n  const getImageUrl', downloadPdfStart);
    const implementation = component.slice(downloadPdfStart, getImageUrlStart);
    assert.doesNotMatch(implementation, /html2canvas|new jsPDF/);
  });

  await t.test('PDF export CSS controls page size, margins and section breaks', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(component, /@page\s*\{\s*size:\s*A4 landscape;\s*margin:\s*10mm;/);
    assert.match(component, /\.pdf-export \.report-wrapper/);
    assert.match(component, /\.pdf-export \.page-break-after/);
    assert.match(component, /#report-canvas\s*>\s*\.page-break-after:first-child/);
  });

  await t.test('report organic summary renders one row per detected platform', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const organicStart = component.indexOf('const OrganicSummary');
    const actionPlanStart = component.indexOf('\nconst ActionPlan', organicStart);
    const implementation = component.slice(organicStart, actionPlanStart);
    assert.match(implementation, /organicSummaryByPlatform/);
    assert.match(implementation, /Facebook/);
    assert.match(implementation, /Instagram/);
  });

  await t.test('report cover formats selected date range in UTC to avoid timezone shifts', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    assert.match(component, /const formatReportDate\s*=/);
    assert.match(component, /timeZone:\s*'UTC'/);
    assert.match(component, /formatReportDate\(report\.startDate\)/);
    assert.match(component, /formatReportDate\(report\.endDate\)/);
  });

  await t.test('PDF export writes to a live printable window and never uses noopener', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    const downloadPdfStart = component.indexOf('const downloadPDF');
    const getImageUrlStart = component.indexOf('\n  const getImageUrl', downloadPdfStart);
    const implementation = component.slice(downloadPdfStart, getImageUrlStart);
    assert.match(implementation, /window\.open\('', '_blank'\)/);
    assert.doesNotMatch(implementation, /noopener|noreferrer/);
    assert.match(component, /setTimeout\(\(\)\s*=>\s*\{\s*window\.focus\(\);\s*window\.print\(\);/);
  });

  await t.test('report uses the requested corporate palette in report-specific UI', async () => {
    const component = await fs.readFile('src/components/modules/Reports.jsx', 'utf8');
    for (const color of ['#144c8c', '#8ab9ee', '#1f3c58', '#627d9f', '#d3cebe', '#1c242c']) {
      assert.match(component, new RegExp(color.replace('#', '#')));
    }
  });

});
