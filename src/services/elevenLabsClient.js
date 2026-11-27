// La salida a ElevenLabs para la voz de Bria (20 de noviembre de 2026). Pasa por la misma puerta de egreso que el resto
// de la IA (`aiEgress`): queda en el registro de uso, sin el contenido, y respeta el gobierno de IA. Solo texto a voz.
import { createGovernedFetch } from './aiEgress.js';
import { VOICE_FALLBACK_MODEL, VOICE_OUTPUT_FORMAT, isDialogueModel, voiceConfig, withoutAudioTags } from '../lib/briaVoice.js';

export class VoiceError extends Error {
  constructor(message, { status = 502, code = 'VOICE_FAILED' } = {}) { super(message); this.name = 'VoiceError'; this.status = status; this.code = code; }
}

const RETRY_MS = 10 * 60000;
export const createElevenLabsClient = ({ config = voiceConfig, fetchImpl, governance, usageLog, timeoutMs = 30000, logger = console, now = () => Date.now() } = {}) => {
  const send = createGovernedFetch({ fetchImpl, governance, usageLog });
  let dialogueDownUntil = 0; // si el modelo de diálogo falló, se usa el de respaldo unos minutos sin volver a intentar cada frase
  const request = ({ apiKey, voiceId, model, text, signal }) => {
    const dialogue = isDialogueModel(model);
    return send(`https://api.elevenlabs.io/v1/${dialogue ? 'text-to-dialogue/stream' : `text-to-speech/${voiceId}/stream`}?output_format=${VOICE_OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(dialogue ? { inputs: [{ text: withoutAudioTags(text), voice_id: voiceId }], model_id: model, language_code: 'es' } : { text, model_id: model, language_code: 'es' }),
      signal,
      governanceContext: { useCase: 'bria.voice' }
    });
  };
  return {
    enabled: () => config().enabled,
    /** Devuelve la respuesta con el audio (audio/mpeg) todavía por leer, para pasarlo tal cual a quien escucha. */
    async speak({ text, signal } = {}) {
      const { ready, apiKey, voiceId, model } = config();
      if (!ready || !voiceId) throw new VoiceError('La voz de Bria no está configurada.', { status: 503, code: 'VOICE_NOT_CONFIGURED' });
      const timeout = AbortSignal.timeout(timeoutMs), bound = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const fallback = isDialogueModel(model) && model !== VOICE_FALLBACK_MODEL;
      let response = null;
      if (!fallback || now() >= dialogueDownUntil) {
        try { response = await request({ apiKey, voiceId, model, text, signal: bound }); }
        catch (error) { if (!fallback || bound.aborted) throw error; logger.error(`[BriaVoice] ${model} no respondió; se usa ${VOICE_FALLBACK_MODEL}:`, error?.message || error); }
        // La clave o los créditos fallan igual con cualquier modelo: eso no se reintenta.
        if (fallback && (!response || (!response.ok && ![401, 402, 429].includes(response.status)))) {
          if (response) logger.error(`[BriaVoice] ElevenLabs rechazó ${model} (HTTP ${response.status}); se usa ${VOICE_FALLBACK_MODEL} por ${RETRY_MS / 60000} minutos.`);
          dialogueDownUntil = now() + RETRY_MS; response = null;
        }
      }
      if (!response) response = await request({ apiKey, voiceId, model: VOICE_FALLBACK_MODEL, text, signal: bound });
      if (!response.ok) {
        const status = response.status;
        throw new VoiceError(status === 401 ? 'ElevenLabs rechazó la clave. Revisa ELEVENLABS_API_KEY.' : status === 429 || status === 402 ? 'La cuenta de ElevenLabs se quedó sin créditos o llegó a su límite.' : 'ElevenLabs no pudo generar la voz.', { status: 502, code: status === 401 ? 'VOICE_KEY_REJECTED' : status === 429 || status === 402 ? 'VOICE_QUOTA' : 'VOICE_FAILED' });
      }
      return response;
    }
  };
};

let shared;
export const getElevenLabsClient = () => shared || (shared = createElevenLabsClient());
