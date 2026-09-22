// Fireflies tells us the moment a transcription is ready, instead of us asking
// every ten minutes. The notification is data from the outside: it is trusted
// only when it is signed with our secret, and it never carries instructions —
// the only thing read from it is which meeting to analyse.
import crypto from 'node:crypto';
import { syncFirefliesMinuteById } from './minuteAutomationService.js';

const HEX_SIGNATURE = /^[a-f0-9]{64}$/i;
// Fireflies asks for 16 to 32 characters; a shorter one is a weak door, so the
// webhook stays closed and says so instead of pretending to be protected.
export const FIREFLIES_WEBHOOK_MIN_SECRET_LENGTH = 16;

export const verifyFirefliesSignature = ({ rawBody, signature, secret }) => {
  if (!secret || !signature || !rawBody) return false;
  const provided = String(signature).trim().replace(/^sha256=/i, '').toLowerCase();
  if (!HEX_SIGNATURE.test(provided)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const providedBytes = Buffer.from(provided, 'hex');
  // Compare in constant time so the answer never leaks how close a guess was.
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
};

// Version 2 renamed the fields (`meeting_id`, `event`); version 1 used
// `meetingId` and `eventType`. Both are read so the configuration in Fireflies
// can change without breaking the door.
export const parseFirefliesWebhookPayload = (body) => {
  if (!body || typeof body !== 'object') return null;
  const raw = body.meeting_id ?? body.meetingId;
  const meetingId = typeof raw === 'string' ? raw.trim() : '';
  if (!meetingId || meetingId.length > 200) return null;
  const event = body.event ?? body.eventType;
  return { meetingId, event: typeof event === 'string' ? event.trim() : '' };
};

// Version 2 also sends "bot joined" and "summary ready". Analysing on those
// would run against a transcript that does not exist yet and burn an attempt.
const TRANSCRIPT_READY_EVENTS = new Set(['meeting.transcribed', 'transcription completed']);
export const isTranscriptionReadyEvent = (event) => {
  const normalized = String(event || '').trim().toLowerCase();
  // Version 1 only ever sent this one event, so an empty value means the same.
  return normalized === '' || TRANSCRIPT_READY_EVENTS.has(normalized);
};

export const handleFirefliesWebhook = async ({
  rawBody,
  signature,
  body,
  secret = process.env.FIREFLIES_WEBHOOK_SECRET,
  processMeeting = (meetingId) => syncFirefliesMinuteById({ meetingId }),
  scheduleWork = (work) => queueMicrotask(work),
  logger = console
} = {}) => {
  if (!secret) return { status: 503, body: { error: 'FIREFLIES_WEBHOOK_DISABLED', message: 'El aviso de Fireflies no está configurado.' } };
  if (String(secret).length < FIREFLIES_WEBHOOK_MIN_SECRET_LENGTH) {
    logger.error(`[FirefliesWebhook] El secreto configurado tiene menos de ${FIREFLIES_WEBHOOK_MIN_SECRET_LENGTH} caracteres; el aviso queda desactivado.`);
    return { status: 503, body: { error: 'FIREFLIES_WEBHOOK_SECRET_TOO_SHORT', message: 'El secreto configurado es demasiado corto.' } };
  }
  if (!verifyFirefliesSignature({ rawBody, signature, secret })) {
    return { status: 401, body: { error: 'FIREFLIES_WEBHOOK_SIGNATURE_INVALID', message: 'Firma no válida.' } };
  }
  const payload = parseFirefliesWebhookPayload(body);
  if (!payload) return { status: 400, body: { error: 'FIREFLIES_WEBHOOK_PAYLOAD_INVALID', message: 'El aviso no identifica una reunión.' } };
  // Acknowledged so Fireflies does not record a failed delivery, but no work:
  // only the transcript being ready starts an analysis.
  if (!isTranscriptionReadyEvent(payload.event)) return { status: 202, body: { accepted: true, ignored: true } };

  // Answer before analysing: a webhook that waits for the model times out and
  // Fireflies resends it. A failure here is ours to log, not theirs to retry.
  scheduleWork(async () => {
    try {
      await processMeeting(payload.meetingId);
      logger.info?.(`[FirefliesWebhook] Reunión ${payload.meetingId} procesada por aviso.`);
    } catch (error) {
      logger.error(`[FirefliesWebhook] Falló el procesamiento de ${payload.meetingId}:`, error.response?.data || error.message || error);
    }
  });
  return { status: 202, body: { accepted: true } };
};
