// La voz de Bria: quién puede oírla, cuánto por día y qué se dice (20 de noviembre de 2026). El tope diario por persona
// se lleva en memoria del proceso: se reinicia con cada despliegue, y por encima de él está el límite de la propia
// cuenta de ElevenLabs. No guarda el texto ni el audio.
import { canUseBria } from '../lib/briaLivingMemory.js';
import { isManagerRole } from '../config/security.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { isVoiceId, speakableText, voiceConfig } from '../lib/briaVoice.js';
import { getElevenLabsClient } from './elevenLabsClient.js';

const allowed = (user) => canUseBria(user) && isManagerRole(user?.role);

export const createBriaVoiceService = ({ client, config = voiceConfig, now = () => new Date() } = {}) => {
  const spent = new Map(); // `${día}:${persona}` → caracteres dichos
  const keyOf = (user) => `${bogotaDate(now())}:${user.userId || user.id}`; // la sesión real trae userId, no id
  const voice = () => client || getElevenLabsClient();
  const isAdmin = (user) => user?.role === 'ADMIN';
  return {
    // Con cuenta pero sin voz elegida, solo quien administra entra: a oír las voces y probar la que le guste.
    status(user) {
      const { ready, enabled, dailyChars, voiceId } = config();
      if (!allowed(user) || !ready || (!enabled && !isAdmin(user))) return { enabled: false };
      return { enabled: true, remaining: Math.max(0, dailyChars - (spent.get(keyOf(user)) || 0)), ...(isAdmin(user) ? { canChoose: true, voiceId: voiceId || null } : {}) };
    },
    async voices(user) {
      if (!allowed(user) || !isAdmin(user)) throw knowledgeError('Solo quien administra elige la voz de Bria.', 403, 'VOICE_FORBIDDEN');
      const all = await voice().voices();
      // Primero las femeninas (lo que pidió Rodny); si la cuenta no las etiqueta, se muestran todas.
      const women = all.filter(option => option.gender === 'female');
      return { voices: women.length ? women : all, current: config().voiceId || null };
    },
    async speak(user, { text, signal, voiceId } = {}) {
      if (!allowed(user)) throw knowledgeError('La voz de Bria es para administradores y project managers con Bria activada.', 403, 'VOICE_FORBIDDEN');
      const { ready, enabled, dailyChars } = config();
      const trial = isAdmin(user) && isVoiceId(voiceId) ? voiceId : undefined; // probar otra voz es solo de quien administra
      if (!ready || (!enabled && !trial)) throw knowledgeError('La voz de Bria no está configurada.', 503, 'VOICE_NOT_CONFIGURED');
      const say = speakableText(text);
      if (!say) throw knowledgeError('No hay nada que decir.', 400, 'VOICE_EMPTY');
      const key = keyOf(user), used = spent.get(key) || 0;
      if (used + say.length > dailyChars) throw knowledgeError('Bria ya habló lo de hoy. Sigue por escrito; mañana vuelve la voz.', 429, 'VOICE_DAILY_LIMIT');
      for (const old of spent.keys()) if (!old.startsWith(`${bogotaDate(now())}:`)) spent.delete(old);
      spent.set(key, used + say.length); // se aparta antes de llamar: dos pedidos a la vez no pasan el tope
      try { return await voice().speak({ text: say, signal, voiceId: trial }); }
      catch (failure) { spent.set(key, Math.max(0, (spent.get(key) || 0) - say.length)); throw failure; }
    }
  };
};

let shared;
export const getBriaVoiceService = () => shared || (shared = createBriaVoiceService());
