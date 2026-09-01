import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildAnalysisPdf,
  buildSummaryPdf,
  createMinutePdfArtifacts
} from '../src/services/minutePdfService.js';

const minute = {
  id: 'minute-pdf-1',
  externalId: 'fireflies-pdf-1',
  title: 'Revisión de campaña - Calzado Andino',
  meetingAt: new Date('2026-09-01T15:00:00.000Z'),
  participants: [{ name: 'Lina Cano', role: 'Cliente' }],
  executiveSummary: 'La línea creativa fue aprobada y el presupuesto necesita un ajuste final.',
  actionItems: [{ task: 'Ajustar el presupuesto', owner: 'Rodny', dueDate: '2026-09-03', priority: 'ALTA' }],
  observerSignals: [{ type: 'RISK', description: 'Aprobación financiera pendiente', evidence: 'El monto final no fue confirmado.', severity: 'warning' }]
};

const analysis = {
  summaryTitle: 'Campaña aprobada',
  summarySubtitle: 'La ejecución avanza con un ajuste presupuestal pendiente',
  analysisTitle: 'Decisión creativa y control financiero',
  analysisSubtitle: 'El principal riesgo está en el cierre del presupuesto',
  executiveSummary: minute.executiveSummary,
  participants: minute.participants,
  topics: ['Campaña de septiembre'],
  decisions: ['Aprobar la línea creativa'],
  actionItems: minute.actionItems,
  risks: ['Retraso por presupuesto'],
  opportunities: ['Extender la campaña a octubre'],
  observerSignals: minute.observerSignals
};

test('Bria generates separate readable PDF files for the summary and analysis', () => {
  const summary = buildSummaryPdf({ minute, analysis });
  const detailedAnalysis = buildAnalysisPdf({ minute, analysis });

  assert.ok(Buffer.isBuffer(summary));
  assert.ok(Buffer.isBuffer(detailedAnalysis));
  assert.equal(summary.subarray(0, 4).toString(), '%PDF');
  assert.equal(detailedAnalysis.subarray(0, 4).toString(), '%PDF');
  assert.ok(summary.length > 1500);
  assert.ok(detailedAnalysis.length > 1500);
});

test('PDF artifacts are stored in the meeting folder with stable names', async () => {
  const uploads = [];
  const result = await createMinutePdfArtifacts({
    minute,
    analysis,
    storage: {
      uploadBuffer: async (artifact) => {
        uploads.push(artifact);
        return { key: artifact.key, size: artifact.body.length, mimeType: artifact.mimeType };
      }
    }
  });

  assert.equal(uploads.length, 2);
  assert.match(uploads[0].key, /^bria\/minutes\/2026\/fireflies-pdf-1\/summary\.pdf$/);
  assert.match(uploads[1].key, /^bria\/minutes\/2026\/fireflies-pdf-1\/analysis\.pdf$/);
  assert.ok(uploads.every((upload) => upload.mimeType === 'application/pdf'));
  assert.equal(result.summary.key, uploads[0].key);
  assert.equal(result.analysis.key, uploads[1].key);
});

test('minutes schema persists both PDF storage references additively', async () => {
  const [schema, bootstrap] = await Promise.all([
    readFile('prisma/schema.prisma', 'utf8'),
    readFile('scripts/ensure-meeting-minutes-schema.js', 'utf8')
  ]);
  assert.match(schema, /summaryPdfStorageKey\s+String\?/);
  assert.match(schema, /analysisPdfStorageKey\s+String\?/);
  assert.match(bootstrap, /ADD COLUMN IF NOT EXISTS "summaryPdfStorageKey"/);
  assert.match(bootstrap, /ADD COLUMN IF NOT EXISTS "analysisPdfStorageKey"/);
  assert.doesNotMatch(bootstrap, /DROP\s+(TABLE|COLUMN)/i);
});
