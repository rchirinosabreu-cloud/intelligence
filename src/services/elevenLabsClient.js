// La salida a ElevenLabs para la voz de Bria (20 de noviembre de 2026). Pasa por la misma puerta de egreso que el resto
// de la IA (`aiEgress`): queda en el registro de uso, sin el contenido, y respeta el gobierno de IA. Solo texto a voz.
import { createGovernedFetch } from './aiEgress.js';
import { isVoiceId, voiceConfig, voiceOption } from '../lib/briaVoice.js';

export class VoiceError extends Error {
  constructor(message, { status = 502, code = 'VOICE_FAILED' } = {}) { super(message); this.name = 'VoiceError'; this.status = status; this.code = code; }
}

export const createElevenLabsClient = ({ config = voiceConfig, fetchImpl, governance, usageLog, timeoutMs = 30000 } = {}) => {
  const send = createGovernedFetch({ fetchImpl, governance, usageLog });
  return {
    enabled: () => config().enabled,
    /** Devuelve la respuesta con el audio (audio/mpeg) todavía por leer, para pasarlo tal cual a quien escucha. */
    async speak({ text, signal, voiceId: asked } = {}) {
      const { ready, apiKey, voiceId: chosen, model } = config(), voiceId = isVoiceId(asked) ? asked : chosen;
      if (!ready || !voiceId) throw new VoiceError('La voz de Bria no está configurada.', { status: 503, code: 'VOICE_NOT_CONFIGURED' });
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await send(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model, language_code: 'es' }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        governanceContext: { useCase: 'bria.voice' }
      });
      if (!response.ok) {
        const status = response.status;
        throw new VoiceError(status === 401 ? 'ElevenLabs rechazó la clave. Revisa ELEVENLABS_API_KEY.' : status === 429 || status === 402 ? 'La cuenta de ElevenLabs se quedó sin créditos o llegó a su límite.' : 'ElevenLabs no pudo generar la voz.', { status: 502, code: status === 401 ? 'VOICE_KEY_REJECTED' : status === 429 || status === 402 ? 'VOICE_QUOTA' : 'VOICE_FAILED' });
      }
      return response;
    },
    /** Las voces de la cuenta, para elegir. No lleva contenido: solo pide la lista. */
    async voices({ signal } = {}) {
      const { ready, apiKey } = config();
      if (!ready) throw new VoiceError('La voz de Bria no está configurada.', { status: 503, code: 'VOICE_NOT_CONFIGURED' });
      const timeout = AbortSignal.timeout(15000);
      const response = await (fetchImpl || fetch)('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': apiKey, Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!response.ok) throw new VoiceError(response.status === 401 ? 'ElevenLabs rechazó la clave. Revisa ELEVENLABS_API_KEY.' : 'ElevenLabs no devolvió las voces.', { status: 502, code: response.status === 401 ? 'VOICE_KEY_REJECTED' : 'VOICE_FAILED' });
      const data = await response.json().catch(() => ({}));
      return (Array.isArray(data?.voices) ? data.voices : []).map(voiceOption).filter(Boolean);
    }
  };
};

let shared;
export const getElevenLabsClient = () => shared || (shared = createElevenLabsClient());
