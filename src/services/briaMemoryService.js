import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { createOpenAIClient } from './openAIClient.js';
import { getAIInstance } from './aiService.js';

export const BRIA_MEMORY_EMBEDDING_MODEL = AI_MODELS.memoryEmbedding || 'text-embedding-3-small';
export const BRIA_MEMORY_VECTOR_DIMENSIONS = 1536;
export const BRIA_MEMORY_SYNC_LIMIT = 500;

const hashText = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const normalizeText = (value) => String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

export const chunkMemoryText = (value, { maxCharacters = 2400, overlapCharacters = 240 } = {}) => {
  const text = normalizeText(value);
  if (!text) return [];
  const safeMax = Math.max(300, Number(maxCharacters) || 2400);
  const safeOverlap = Math.min(Math.max(0, Number(overlapCharacters) || 0), Math.floor(safeMax / 3));
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + safeMax);
    if (end < text.length) {
      const breakAt = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end));
      if (breakAt > start + Math.floor(safeMax * 0.55)) end = breakAt + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    const nextStart = Math.max(start + 1, end - safeOverlap);
    start = nextStart;
  }
  return chunks;
};

const listText = (value, formatter = (item) => item) => {
  if (!Array.isArray(value) || value.length === 0) return 'Sin registros.';
  return value.map((item, index) => `${index + 1}. ${formatter(item)}`).join('\n');
};

const actionText = (item = {}) => [
  item.task || item.title || 'Acción sin título',
  item.owner ? `Responsable: ${item.owner}` : null,
  item.dueDate ? `Fecha: ${item.dueDate}` : null,
  item.priority ? `Prioridad: ${item.priority}` : null
].filter(Boolean).join(' · ');

export const buildMeetingMinuteMemoryDocument = (minute) => {
  if (!minute?.id) throw new Error('BRIA_MEMORY_MINUTE_ID_REQUIRED');
  const analysis = minute.analysis && typeof minute.analysis === 'object' ? minute.analysis : {};
  const summary = [
    `MINUTA: ${minute.title || 'Reunión sin título'}`,
    `FECHA: ${minute.meetingAt ? new Date(minute.meetingAt).toISOString() : 'Sin fecha'}`,
    analysis.summaryTitle ? `TÍTULO EDITORIAL: ${analysis.summaryTitle}` : null,
    analysis.summarySubtitle ? `SUBTÍTULO: ${analysis.summarySubtitle}` : null,
    `RESUMEN EJECUTIVO:\n${minute.executiveSummary || 'Sin resumen ejecutivo.'}`,
    `PARTICIPANTES:\n${listText(minute.participants, (item) => typeof item === 'string' ? item : [item?.name, item?.role].filter(Boolean).join(' — '))}`,
    `TEMAS:\n${listText(analysis.topics)}`,
    `DECISIONES:\n${listText(analysis.decisions)}`,
    `ACCIONES PROPUESTAS:\n${listText(minute.actionItems, actionText)}`,
    `RIESGOS:\n${listText(analysis.risks)}`,
    `OPORTUNIDADES:\n${listText(analysis.opportunities)}`,
    `SEÑALES DEL OBSERVER:\n${listText(minute.observerSignals, (item) => [item?.type, item?.description, item?.evidence].filter(Boolean).join(' — '))}`
  ].filter(Boolean).join('\n\n');

  const summaryChunks = chunkMemoryText(summary).map((content) => ({ section: 'SUMMARY', content }));
  const transcriptChunks = chunkMemoryText(minute.transcriptText).map((content) => ({ section: 'TRANSCRIPT', content }));
  const chunks = [...summaryChunks, ...transcriptChunks].map((chunk, position) => ({
    ...chunk,
    position,
    contentHash: hashText(chunk.content),
    tokenEstimate: Math.max(1, Math.ceil(chunk.content.length / 4))
  }));
  const contentHash = hashText(JSON.stringify(chunks.map(({ section, contentHash }) => ({ section, contentHash }))));

  return {
    sourceKind: 'MEETING_MINUTE',
    sourceRecordId: minute.id,
    title: minute.title || 'Reunión sin título',
    subtitle: analysis.summarySubtitle || minute.executiveSummary?.slice(0, 180) || null,
    sourceUrl: `/minutas?minute=${encodeURIComponent(minute.id)}`,
    status: 'READY',
    contentHash,
    clientId: minute.clientId || null,
    sourceUpdatedAt: minute.updatedAt || minute.processedAt || minute.meetingAt || new Date(),
    indexedAt: new Date(),
    deletedAt: null,
    metadata: {
      meetingAt: minute.meetingAt || null,
      externalId: minute.externalId || null,
      sections: [...new Set(chunks.map((chunk) => chunk.section))]
    },
    chunks
  };
};

export const createPrismaMemoryRepository = (db = prisma) => ({
  findSource: (sourceKind, sourceRecordId) => db.briaMemorySource.findUnique({
    where: { sourceKind_sourceRecordId: { sourceKind, sourceRecordId } }
  }),
  upsertSource: ({ chunks: _chunks, ...source }) => db.briaMemorySource.upsert({
    where: { sourceKind_sourceRecordId: { sourceKind: source.sourceKind, sourceRecordId: source.sourceRecordId } },
    create: source,
    update: source
  }),
  replaceChunks: async (sourceId, chunks) => db.$transaction(async (tx) => {
    await tx.briaMemoryChunk.deleteMany({ where: { sourceId } });
    for (const chunk of chunks) {
      const record = await tx.briaMemoryChunk.create({
        data: {
          sourceId,
          position: chunk.position,
          section: chunk.section,
          content: chunk.content,
          contentHash: chunk.contentHash,
          tokenEstimate: chunk.tokenEstimate,
          embeddingModel: chunk.embeddingModel
        }
      });
      await tx.$executeRawUnsafe(
        'UPDATE "BriaMemoryChunk" SET "embedding" = $1::vector WHERE "id" = $2',
        `[${chunk.embedding.join(',')}]`,
        record.id
      );
    }
  }),
  markSourceReady: (sourceId, { contentHash, indexedAt, sourceUpdatedAt }) => db.briaMemorySource.update({
    where: { id: sourceId },
    data: { status: 'READY', contentHash, indexedAt, sourceUpdatedAt, deletedAt: null }
  }),
  excludeSource: async (sourceKind, sourceRecordId, excludedAt = new Date()) => {
    const source = await db.briaMemorySource.findUnique({
      where: { sourceKind_sourceRecordId: { sourceKind, sourceRecordId } },
      select: { id: true }
    });
    if (!source) return { excluded: false };
    return db.$transaction(async (tx) => {
      await tx.briaMemoryChunk.deleteMany({ where: { sourceId: source.id } });
      await tx.briaMemorySource.update({
        where: { id: source.id },
        data: { status: 'EXCLUDED', deletedAt: excludedAt, indexedAt: null }
      });
      return { excluded: true };
    });
  },
  deleteSource: async (sourceKind, sourceRecordId) => db.briaMemorySource.deleteMany({ where: { sourceKind, sourceRecordId } })
});

const getDefaultEmbedder = () => {
  const ai = getAIInstance() || createOpenAIClient({ models: AI_MODELS });
  return (text, options) => ai.embed(text, options);
};

export const syncMeetingMinuteMemory = async ({
  minute,
  repository = createPrismaMemoryRepository(),
  embedText = getDefaultEmbedder()
}) => {
  if (!minute?.id) throw new Error('BRIA_MEMORY_MINUTE_ID_REQUIRED');
  if (minute.deletedAt || minute.status === 'EXCLUDED') {
    await repository.excludeSource('MEETING_MINUTE', minute.id, minute.deletedAt || new Date());
    return { excluded: true, sourceRecordId: minute.id };
  }
  if (minute.status !== 'READY') return { skipped: true, reason: 'NOT_READY', sourceRecordId: minute.id };

  const document = buildMeetingMinuteMemoryDocument(minute);
  const existing = await repository.findSource(document.sourceKind, document.sourceRecordId);
  if (existing?.contentHash === document.contentHash && existing.status === 'READY' && !existing.deletedAt) {
    return { skipped: true, reason: 'UNCHANGED', sourceRecordId: minute.id };
  }

  const chunks = [];
  for (const chunk of document.chunks) {
    const embedding = await embedText(chunk.content, {
      model: BRIA_MEMORY_EMBEDDING_MODEL,
      dimensions: BRIA_MEMORY_VECTOR_DIMENSIONS
    });
    if (!Array.isArray(embedding) || embedding.length !== BRIA_MEMORY_VECTOR_DIMENSIONS) {
      throw new Error('BRIA_MEMORY_EMBEDDING_DIMENSION_INVALID');
    }
    chunks.push({ ...chunk, embedding, embeddingModel: BRIA_MEMORY_EMBEDDING_MODEL });
  }

  const source = await repository.upsertSource({ ...document, status: 'INDEXING', indexedAt: null });
  await repository.replaceChunks(source.id, chunks);
  await repository.markSourceReady?.(source.id, document);
  return { indexed: true, sourceId: source.id, chunks: chunks.length, sourceRecordId: minute.id };
};

export const syncMeetingMinuteMemoryById = async ({ id, db = prisma, logger = console } = {}) => {
  const minute = await db.meetingMinute.findUnique({ where: { id } });
  if (!minute) return { skipped: true, reason: 'NOT_FOUND' };
  try {
    return await syncMeetingMinuteMemory({ minute, repository: createPrismaMemoryRepository(db) });
  } catch (error) {
    logger.error(`[BriaMemory] Falló la indexación de la minuta ${id}:`, error.response?.data || error.message || error);
    return { failed: true, reason: error.message, sourceRecordId: id };
  }
};

export const permanentlyForgetMeetingMinute = async ({ id, db = prisma } = {}) => {
  return createPrismaMemoryRepository(db).deleteSource('MEETING_MINUTE', id);
};

export const reconcileBriaMemory = async ({ db = prisma, limit = BRIA_MEMORY_SYNC_LIMIT, logger = console } = {}) => {
  const minutes = await db.meetingMinute.findMany({
    where: { OR: [{ status: 'READY' }, { status: 'EXCLUDED' }, { deletedAt: { not: null } }] },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || BRIA_MEMORY_SYNC_LIMIT, 1), 5000)
  });
  const result = { reviewed: minutes.length, indexed: 0, excluded: 0, skipped: 0, failed: 0 };
  for (const minute of minutes) {
    try {
      const item = await syncMeetingMinuteMemory({ minute, repository: createPrismaMemoryRepository(db) });
      if (item.indexed) result.indexed += 1;
      else if (item.excluded) result.excluded += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(`[BriaMemory] Falló la conciliación de ${minute.id}:`, error.response?.data || error.message || error);
    }
  }
  return result;
};

export const getBriaMemoryOverview = async ({ db = prisma } = {}) => {
  const [sourceCount, chunkCount, indexedMinutes, availableMinutes, availableDriveFiles, recentSources, latest] = await Promise.all([
    db.briaMemorySource.count({ where: { status: 'READY', deletedAt: null } }),
    db.briaMemoryChunk.count({ where: { source: { is: { status: 'READY', deletedAt: null } } } }),
    db.briaMemorySource.count({ where: { sourceKind: 'MEETING_MINUTE', status: 'READY', deletedAt: null } }),
    db.meetingMinute.count({ where: { status: 'READY', deletedAt: null } }),
    db.driveFile.count({ where: { deletedAt: null, source: 'UPLOAD' } }),
    db.briaMemorySource.findMany({
      where: { status: 'READY', deletedAt: null },
      orderBy: { indexedAt: 'desc' },
      take: 8,
      select: { id: true, sourceKind: true, sourceRecordId: true, title: true, subtitle: true, sourceUrl: true, status: true, indexedAt: true, metadata: true, _count: { select: { chunks: true } } }
    }),
    db.briaMemorySource.findFirst({ where: { status: 'READY', deletedAt: null }, orderBy: { indexedAt: 'desc' }, select: { indexedAt: true } })
  ]);
  return {
    summary: {
      sourceCount,
      chunkCount,
      lastIndexedAt: latest?.indexedAt || null,
      pendingSources: Math.max(0, availableMinutes - indexedMinutes) + availableDriveFiles
    },
    coverage: [
      { key: 'MEETING_MINUTE', label: 'Minutas y transcripciones', indexed: indexedMinutes, available: availableMinutes, status: indexedMinutes >= availableMinutes ? 'CONNECTED' : 'INDEXING' },
      { key: 'DRIVE_UPLOAD', label: 'Documentos generales de Drive', indexed: 0, available: availableDriveFiles, status: 'NEXT' }
    ],
    recentSources: recentSources.map(({ _count, ...source }) => ({ ...source, chunkCount: _count.chunks }))
  };
};

export const searchBriaMemory = async ({ query, db = prisma, limit = 6, embedText = getDefaultEmbedder() } = {}) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];
  const embedding = await embedText(normalizedQuery, {
    model: BRIA_MEMORY_EMBEDDING_MODEL,
    dimensions: BRIA_MEMORY_VECTOR_DIMENSIONS
  });
  if (!Array.isArray(embedding) || embedding.length !== BRIA_MEMORY_VECTOR_DIMENSIONS) {
    throw new Error('BRIA_MEMORY_EMBEDDING_DIMENSION_INVALID');
  }
  const rows = await db.$queryRawUnsafe(
    `SELECT c."id", c."section", c."content", s."title", s."subtitle", s."sourceKind", s."sourceRecordId", s."sourceUrl", s."indexedAt",
      (1 - (c."embedding" <=> $1::vector))::double precision AS "semanticScore",
      ts_rank_cd(to_tsvector('spanish', c."content"), plainto_tsquery('spanish', $2))::double precision AS "lexicalScore",
      ((1 - (c."embedding" <=> $1::vector)) * 0.85 + ts_rank_cd(to_tsvector('spanish', c."content"), plainto_tsquery('spanish', $2)) * 0.15)::double precision AS "score"
     FROM "BriaMemoryChunk" c
     INNER JOIN "BriaMemorySource" s ON s."id" = c."sourceId"
     WHERE c."embedding" IS NOT NULL AND s."status" = 'READY' AND s."deletedAt" IS NULL
       AND (s."sourceKind" <> 'MEETING_MINUTE' OR EXISTS (
         SELECT 1 FROM "MeetingMinute" m
         WHERE m."id" = s."sourceRecordId" AND m."status" = 'READY' AND m."deletedAt" IS NULL
       ))
     ORDER BY "score" DESC
     LIMIT $3`,
    `[${embedding.join(',')}]`,
    normalizedQuery,
    Math.min(Math.max(Number(limit) || 6, 1), 20)
  );
  return rows.map((row) => ({ ...row, score: Number(row.score || 0), semanticScore: Number(row.semanticScore || 0), lexicalScore: Number(row.lexicalScore || 0) }));
};
