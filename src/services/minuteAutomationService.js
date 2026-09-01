import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { createOpenAIClient } from './openAIClient.js';
import { documentStorage } from './documentStorageService.js';
import { firefliesClient } from './firefliesService.js';
import { parseJsonFromAiResponse } from '../utils/jsonParser.js';

const MINUTE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summaryTitle: { type: 'string' },
    summarySubtitle: { type: 'string' },
    analysisTitle: { type: 'string' },
    analysisSubtitle: { type: 'string' },
    executiveSummary: { type: 'string' },
    participants: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: ['string', 'null'] } }, required: ['name', 'role'] } },
    topics: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    actionItems: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, owner: { type: ['string', 'null'] }, dueDate: { type: ['string', 'null'] }, priority: { type: 'string' } }, required: ['task', 'owner', 'dueDate', 'priority'] } },
    risks: { type: 'array', items: { type: 'string' } },
    opportunities: { type: 'array', items: { type: 'string' } },
    observerSignals: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, description: { type: 'string' }, evidence: { type: 'string' }, severity: { type: 'string' } }, required: ['type', 'description', 'evidence', 'severity'] } }
  },
  required: ['summaryTitle', 'summarySubtitle', 'analysisTitle', 'analysisSubtitle', 'executiveSummary', 'participants', 'topics', 'decisions', 'actionItems', 'risks', 'opportunities', 'observerSignals']
};

const minuteInstructions = `Eres Bria, observadora operativa de Brainstudio. Genera una minuta ejecutiva fiel y accionable en español.
No inventes participantes, fechas, responsables ni decisiones. Separa claramente decisiones de propuestas.
Genera un título y un subtítulo breve para el resumen, y otro título y subtítulo breve para el análisis; deben estar basados en el contenido real, no limitarse a repetir el nombre de la reunión.
Los actionItems son propuestas para revisión humana: no declares que fueron creados como tareas.
Cada señal del Observer debe incluir evidencia textual concreta de la reunión.`;

export const MAX_AUTOMATIC_MINUTE_RETRIES = 3;

const createMinuteError = (code, message) => Object.assign(new Error(message), { code });

const isExcludedFromBria = (record) => Boolean(record?.deletedAt) || record?.status === 'EXCLUDED';

const normalizeDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const sanitizeSegment = (value) => String(value || 'unknown')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 120);

export const parseMinuteAnalysis = (text) => parseJsonFromAiResponse(String(text || ''));

export const hasEditorialMinuteMetadata = (analysis) => [
  analysis?.summaryTitle,
  analysis?.summarySubtitle,
  analysis?.analysisTitle,
  analysis?.analysisSubtitle
].every(value => typeof value === 'string' && value.trim().length > 0);

export const buildMinuteStorageKey = ({ meetingId, meetingAt, fileName }) => {
  const year = normalizeDate(meetingAt).getUTCFullYear();
  return `bria/minutes/${year}/${sanitizeSegment(meetingId)}/${sanitizeSegment(fileName)}`;
};

export const buildTranscriptText = (transcript) => (transcript?.sentences || [])
  .map(sentence => `[${sentence.speaker_name || 'Desconocido'}]: ${sentence.text || sentence.raw_text || ''}`)
  .join('\n');

export const getMeetingMinutes = async ({ db = prisma, status, limit = 50, includeTrash = false } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeStatus = status && status !== 'EXCLUDED' ? String(status) : null;
  return db.meetingMinute.findMany({
    where: {
      deletedAt: includeTrash ? { not: null } : null,
      status: safeStatus || { not: 'EXCLUDED' }
    },
    orderBy: { meetingAt: 'desc' },
    take,
    select: {
      id: true,
      source: true,
      externalId: true,
      title: true,
      meetingAt: true,
      durationSeconds: true,
      organizerEmail: true,
      participants: true,
      executiveSummary: true,
      analysis: true,
      actionItems: true,
      observerSignals: true,
      status: true,
      errorMessage: true,
      retryCount: true,
      aiModel: true,
      storageProvider: true,
      processedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
};

export const getMeetingMinuteById = async ({ db = prisma, id }) => db.meetingMinute.findFirst({
  where: { id, deletedAt: null, status: { not: 'EXCLUDED' } },
  select: {
    id: true,
    source: true,
    externalId: true,
    title: true,
    meetingAt: true,
    durationSeconds: true,
    organizerEmail: true,
    participants: true,
    transcriptText: true,
    sourceSummary: true,
    executiveSummary: true,
    analysis: true,
    actionItems: true,
    observerSignals: true,
    status: true,
    errorMessage: true,
    retryCount: true,
    aiModel: true,
    storageProvider: true,
    processedAt: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
  }
});

export const trashMeetingMinute = async ({ db = prisma, id }) => db.meetingMinute.update({
  where: { id },
  data: { deletedAt: new Date() }
});

export const restoreMeetingMinute = async ({ db = prisma, id }) => db.meetingMinute.update({
  where: { id },
  data: { deletedAt: null }
});

export const permanentlyDeleteMeetingMinute = async ({ db = prisma, storage = documentStorage, id }) => {
  const record = await db.meetingMinute.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { id: true, transcriptStorageKey: true, minuteStorageKey: true }
  });
  if (!record) {
    throw createMinuteError('MINUTE_NOT_IN_TRASH', 'La minuta debe estar en la Papelera antes de eliminarla permanentemente.');
  }

  await storage.deleteMany({ keys: [record.transcriptStorageKey, record.minuteStorageKey] });
  return db.meetingMinute.update({
    where: { id: record.id },
    data: {
      title: 'Reunión excluida',
      durationSeconds: null,
      organizerEmail: null,
      participants: null,
      transcriptText: '',
      sourceSummary: null,
      executiveSummary: null,
      analysis: null,
      actionItems: null,
      observerSignals: null,
      status: 'EXCLUDED',
      errorMessage: null,
      retryCount: 0,
      aiModel: null,
      aiRequestId: null,
      transcriptStorageKey: null,
      minuteStorageKey: null,
      processedAt: null,
      deletedAt: null,
      lastSeenAt: new Date()
    }
  });
};

const getDefaultAi = () => createOpenAIClient({ models: AI_MODELS });

const processTranscript = async ({ summary, db, fireflies, ai, storage }) => {
  let record = await db.meetingMinute.findUnique({ where: { externalId: summary.id } });
  if (isExcludedFromBria(record) || (record?.status === 'READY' && hasEditorialMinuteMetadata(record.analysis))) return { skipped: true };

  if (!record) {
    record = await db.meetingMinute.create({
      data: {
        source: 'FIREFLIES',
        externalId: summary.id,
        title: summary.title || 'Reunión sin título',
        meetingAt: normalizeDate(summary.date),
        durationSeconds: summary.duration ? Math.round(Number(summary.duration)) : null,
        organizerEmail: summary.organizer_email || null,
        transcriptText: '',
        status: 'DISCOVERED',
        storageProvider: 'RAILWAY',
        lastSeenAt: new Date()
      }
    });
  }

  try {
    await db.meetingMinute.update({ where: { id: record.id }, data: { status: 'PROCESSING', errorMessage: null, lastSeenAt: new Date() } });
    const transcript = await fireflies.getTranscript(summary.id);
    const transcriptText = buildTranscriptText(transcript);
    if (!transcriptText.trim()) throw new Error('FIREFLIES_TRANSCRIPT_EMPTY');

    const aiResult = await ai.generate({
      model: AI_MODELS.fast,
      instructions: minuteInstructions,
      prompt: `Analiza esta reunión y devuelve únicamente el JSON solicitado.\n\nTítulo: ${transcript.title || summary.title || 'Sin título'}\nFecha: ${transcript.date || summary.date || ''}\nResumen de Fireflies: ${JSON.stringify(transcript.summary || {})}\n\nTRANSCRIPCIÓN:\n${transcriptText}`,
      responseSchema: MINUTE_RESPONSE_SCHEMA,
      maxOutputTokens: 5000
    });
    const analysis = parseMinuteAnalysis(aiResult.text);
    const storageBase = { meetingId: summary.id, meetingAt: transcript.date || summary.date };
    const transcriptArtifact = await storage.uploadJson({
      key: buildMinuteStorageKey({ ...storageBase, fileName: 'transcript.json' }),
      value: transcript
    });
    const minuteArtifact = await storage.uploadJson({
      key: buildMinuteStorageKey({ ...storageBase, fileName: 'minute.json' }),
      value: analysis
    });

    await db.meetingMinute.update({
      where: { id: record.id },
      data: {
        title: transcript.title || summary.title || 'Reunión sin título',
        meetingAt: normalizeDate(transcript.date || summary.date),
        durationSeconds: transcript.duration ? Math.round(Number(transcript.duration)) : null,
        organizerEmail: transcript.organizer_email || summary.organizer_email || null,
        participants: transcript.participants || analysis.participants || [],
        transcriptText,
        sourceSummary: transcript.summary || {},
        executiveSummary: analysis.executiveSummary,
        analysis,
        actionItems: analysis.actionItems || [],
        observerSignals: analysis.observerSignals || [],
        status: 'READY',
        errorMessage: null,
        aiModel: aiResult.model || AI_MODELS.fast,
        aiRequestId: aiResult.requestId || null,
        storageProvider: 'RAILWAY',
        transcriptStorageKey: transcriptArtifact.key,
        minuteStorageKey: minuteArtifact.key,
        processedAt: new Date(),
        lastSeenAt: new Date()
      }
    });
    return { processed: true };
  } catch (error) {
    await db.meetingMinute.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage: String(error.message || error).slice(0, 1000), retryCount: { increment: 1 }, lastSeenAt: new Date() }
    }).catch(updateError => console.error('[AutomatedMinutes] No se pudo guardar el error:', updateError.message));
    throw error;
  }
};

let activeMinutesSync = null;

const runFirefliesMinutesSync = async ({
  db = prisma,
  fireflies = firefliesClient,
  ai = getDefaultAi(),
  storage = documentStorage,
  limit = 50,
  logger = console
} = {}) => {
  const result = { discovered: 0, processed: 0, skipped: 0, failed: 0 };
  const transcripts = await fireflies.listTranscripts(limit, 0);
  for (const summary of transcripts) {
    const existing = await db.meetingMinute.findUnique({ where: { externalId: summary.id } });
    if (!existing) result.discovered += 1;
    if (isExcludedFromBria(existing) || (existing?.status === 'READY' && hasEditorialMinuteMetadata(existing.analysis)) || (existing?.status === 'FAILED' && existing.retryCount >= MAX_AUTOMATIC_MINUTE_RETRIES)) {
      result.skipped += 1;
      continue;
    }
    try {
      const item = await processTranscript({ summary, db, fireflies, ai, storage });
      if (item.skipped) result.skipped += 1;
      if (item.processed) result.processed += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(`[AutomatedMinutes] Falló ${summary.id}:`, error.response?.data || error.message || error);
    }
  }
  logger.info(`[AutomatedMinutes] Sincronización: ${result.processed} procesadas, ${result.skipped} omitidas, ${result.failed} fallidas.`);
  return result;
};

export const syncFirefliesMinutes = (options = {}) => {
  if (activeMinutesSync) return activeMinutesSync;
  activeMinutesSync = runFirefliesMinutesSync(options).finally(() => {
    activeMinutesSync = null;
  });
  return activeMinutesSync;
};
