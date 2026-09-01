import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BRIA_MEMORY_EMBEDDING_MODEL,
  BRIA_MEMORY_VECTOR_DIMENSIONS,
  buildMeetingMinuteMemoryDocument,
  chunkMemoryText,
  syncMeetingMinuteMemory
} from '../src/services/briaMemoryService.js';

const readyMinute = {
  id: 'minute-1',
  externalId: 'fireflies-1',
  title: 'Revisión mensual de Calzado Andino',
  meetingAt: new Date('2026-08-28T17:20:00.000Z'),
  participants: [{ name: 'Lina Cano', role: 'Cliente' }],
  executiveSummary: 'Se aprobó la campaña de septiembre y quedó pendiente ajustar el presupuesto.',
  analysis: {
    summaryTitle: 'Septiembre toma forma',
    summarySubtitle: 'Campaña aprobada con un ajuste financiero pendiente',
    analysisTitle: 'Decisión creativa y control presupuestal',
    analysisSubtitle: 'El siguiente paso depende del presupuesto final',
    topics: ['Campaña de septiembre'],
    decisions: ['Aprobar la línea creativa'],
    risks: ['Demora en la aprobación del presupuesto'],
    opportunities: ['Extender la campaña a octubre'],
    knowledgeItems: [
      { type: 'CLIENT_PREFERENCE', content: 'La cliente prefiere aprobar las piezas antes de programarlas.', evidence: 'Lina pidió revisar cada pieza antes de publicación.', confidence: 0.95 }
    ]
  },
  actionItems: [{ task: 'Ajustar presupuesto', owner: 'Rodny', dueDate: '2026-09-02', priority: 'ALTA' }],
  observerSignals: [{ type: 'RISK', description: 'Presupuesto pendiente', evidence: 'Falta aprobación final', severity: 'warning' }],
  transcriptText: '[Lina]: Aprobamos la línea creativa.\n[Rodny]: Ajustaré el presupuesto mañana.',
  status: 'READY',
  deletedAt: null,
  updatedAt: new Date('2026-08-28T18:00:00.000Z')
};

test('Bria chunks long documents deterministically without losing their ending', () => {
  const paragraph = 'Una decisión operativa con evidencia concreta y contexto suficiente. ';
  const input = Array.from({ length: 90 }, (_, index) => `${index + 1}. ${paragraph}`).join('\n');
  const chunks = chunkMemoryText(input, { maxCharacters: 900, overlapCharacters: 120 });

  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 900));
  assert.match(chunks.at(-1), /90\./);
  assert.deepEqual(chunks, chunkMemoryText(input, { maxCharacters: 900, overlapCharacters: 120 }));
});

test('a ready minute becomes a traceable summary plus transcript memory', () => {
  const document = buildMeetingMinuteMemoryDocument(readyMinute);

  assert.equal(document.sourceKind, 'MEETING_MINUTE');
  assert.equal(document.sourceRecordId, readyMinute.id);
  assert.equal(document.title, readyMinute.title);
  assert.equal(document.sourceUrl, `/minutas?minute=${readyMinute.id}`);
  assert.ok(document.contentHash.length >= 32);
  assert.ok(document.chunks.some((chunk) => chunk.section === 'SUMMARY' && /Aprobar la línea creativa/.test(chunk.content)));
  assert.ok(document.chunks.some((chunk) => chunk.section === 'SUMMARY' && /CONOCIMIENTO CANÓNICO/.test(chunk.content)));
  assert.ok(document.chunks.some((chunk) => chunk.section === 'SUMMARY' && /prefiere aprobar las piezas/.test(chunk.content)));
  assert.ok(document.chunks.some((chunk) => chunk.section === 'TRANSCRIPT' && /Ajustaré el presupuesto/.test(chunk.content)));
  assert.ok(document.chunks.every((chunk, index) => chunk.position === index));
});

test('memory sync is incremental and uses the economical OpenAI embedding model', async () => {
  const calls = { upsert: 0, replace: 0, ready: 0, embeds: [] };
  const repository = {
    findSource: async () => null,
    upsertSource: async (source) => {
      calls.upsert += 1;
      assert.equal(source.sourceKind, 'MEETING_MINUTE');
      assert.equal(source.status, 'INDEXING');
      return { id: 'memory-source-1', ...source };
    },
    markSourceReady: async (sourceId, source) => {
      calls.ready += 1;
      assert.equal(sourceId, 'memory-source-1');
      assert.equal(source.status, 'READY');
    },
    replaceChunks: async (sourceId, chunks) => {
      calls.replace += 1;
      assert.equal(sourceId, 'memory-source-1');
      assert.ok(chunks.every((chunk) => chunk.embedding.length === BRIA_MEMORY_VECTOR_DIMENSIONS));
    },
    excludeSource: async () => assert.fail('an active minute must not be excluded')
  };
  const embedText = async (text, options) => {
    calls.embeds.push({ text, options });
    return new Array(BRIA_MEMORY_VECTOR_DIMENSIONS).fill(0.01);
  };

  const result = await syncMeetingMinuteMemory({ minute: readyMinute, repository, embedText });

  assert.equal(result.indexed, true);
  assert.equal(calls.upsert, 1);
  assert.equal(calls.replace, 1);
  assert.equal(calls.ready, 1);
  assert.ok(calls.embeds.length >= 2);
  assert.ok(calls.embeds.every(({ options }) => options.model === BRIA_MEMORY_EMBEDDING_MODEL));
  assert.ok(calls.embeds.every(({ options }) => options.dimensions === BRIA_MEMORY_VECTOR_DIMENSIONS));
});

test('unchanged minutes do not spend embeddings again', async () => {
  const document = buildMeetingMinuteMemoryDocument(readyMinute);
  let embeddingCalls = 0;
  const repository = {
    findSource: async () => ({ contentHash: document.contentHash, status: 'READY', deletedAt: null }),
    upsertSource: async () => assert.fail('unchanged source must not be written'),
    replaceChunks: async () => assert.fail('unchanged chunks must not be replaced'),
    excludeSource: async () => assert.fail('active source must not be excluded')
  };

  const result = await syncMeetingMinuteMemory({
    minute: readyMinute,
    repository,
    embedText: async () => {
      embeddingCalls += 1;
      return [];
    }
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'UNCHANGED');
  assert.equal(embeddingCalls, 0);
});

test('trash and excluded records are removed from usable memory immediately', async () => {
  let excluded = null;
  const repository = {
    findSource: async () => null,
    upsertSource: async () => assert.fail('trashed source must not be indexed'),
    replaceChunks: async () => assert.fail('trashed source must not keep chunks'),
    excludeSource: async (sourceKind, sourceRecordId) => {
      excluded = { sourceKind, sourceRecordId };
      return { excluded: true };
    }
  };

  const result = await syncMeetingMinuteMemory({
    minute: { ...readyMinute, deletedAt: new Date() },
    repository,
    embedText: async () => assert.fail('trashed source must not spend embeddings')
  });

  assert.deepEqual(excluded, { sourceKind: 'MEETING_MINUTE', sourceRecordId: readyMinute.id });
  assert.equal(result.excluded, true);
});

test('schema, bootstrap and protected API expose a first-class Bria memory', async () => {
  const [schema, startScript, routes] = await Promise.all([
    readFile('prisma/schema.prisma', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('src/routes/index.js', 'utf8')
  ]);

  assert.match(schema, /model BriaMemorySource/);
  assert.match(schema, /model BriaMemoryChunk/);
  assert.match(schema, /Unsupported\("vector\(1536\)"\)/);
  assert.match(startScript, /ensure-bria-memory-schema\.js/);
  assert.match(routes, /\/manager\/bria-memory/);
  assert.match(routes, /requireManagerRole/);
});
