// La voz de Bria (Rodny, 20 de noviembre de 2026: «quiero darle una voz a Bria y poder tenerla así, hablando con
// ella, usando mis créditos de ElevenLabs»). Reglas puras. Bria piensa igual que siempre; ElevenLabs solo pone la voz:
// recibe el texto de la respuesta que se va a decir, nunca el audio de la persona ni el historial. Una respuesta
// larga se dice hasta donde alcanza el tope y lo demás queda escrito en el chat. Cada persona tiene un tope diario
// de caracteres hablados, porque ElevenLabs cobra por carácter.

export const VOICE_MAX_CHARS = 1200;
export const VOICE_DAILY_CHARS = 20000;
// El modelo (Rodny, 21 de noviembre de 2026: «pasemos a v4 turbo»): Eleven v4 Turbo cuesta lo mismo que Flash v2.5 y es
// más expresivo. Los modelos v3 y v4 se piden por «Text to Dialogue»; si ElevenLabs lo rechaza, se dice con Flash.
export const VOICE_MODEL = 'eleven_v4_turbo', VOICE_FALLBACK_MODEL = 'eleven_flash_v2_5';
/** Los modelos de diálogo (v3 y v4) no usan la ruta de texto a voz de siempre. */
export const isDialogueModel = (model) => /^eleven_v[34]/.test(String(model || ''));
/** En v3 y v4 lo que va entre corchetes es una orden de actuación («[risas]»): el texto de Bria va sin ellos. */
export const withoutAudioTags = (text) => String(text || '').replace(/[[\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();
export const VOICE_TAIL = 'Lo demás te lo dejé escrito en el chat.';
// Escuchar: se considera voz por encima de SPEECH, silencio por debajo de QUIET; tras hablar, este silencio cierra el turno.
export const VOICE_SPEECH_LEVEL = 0.16, VOICE_QUIET_LEVEL = 0.08, VOICE_SILENCE_MS = 900, VOICE_MIN_SPEECH_MS = 350;

/** Lo que se dice en voz: la respuesta sin formato, sin enlaces, sin tablas ni código, en frases corridas. */
export const speakableText = (markdown, { max = VOICE_MAX_CHARS } = {}) => {
  let text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/[«»]/g, '"')
    .replace(/\s*\n+\s*/g, (gap, offset, whole) => (/[.!?:;,…]$/.test(whole.slice(0, offset).trimEnd()) ? ' ' : '. '))
    .replace(/\s{2,}/g, ' ').trim();
  if (text.length <= max) return text;
  const room = max - VOICE_TAIL.length - 1, head = text.slice(0, room);
  const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  text = (cut > room * 0.5 ? head.slice(0, cut + 1) : `${head.slice(0, head.lastIndexOf(' ')).replace(/[,;:]$/, '')}.`);
  return `${text} ${VOICE_TAIL}`;
};

export const isVoiceId = (value) => typeof value === 'string' && /^[A-Za-z0-9]{10,40}$/.test(value);
// Hablar mientras escribe (21 de noviembre de 2026, Rodny: «tarda mucho en responder… quiero que sea rápido,
// conversacional»): Bria empieza a decir la primera frase apenas la tiene, sin esperar la respuesta completa. El
// primer trozo sale corto para arrancar pronto; los siguientes, más largos para que suene de corrido.
export const SPEECH_FIRST_MIN = 24, SPEECH_NEXT_MIN = 90;
/**
 * El siguiente trozo para decir de un texto que todavía se está escribiendo. Corta solo en fin de frase o de línea;
 * con `final`, devuelve lo que quede. `{ text, to }` o null si aún no hay una frase completa.
 */
export const nextSpeech = (text, from = 0, { first = false, final = false } = {}) => {
  const rest = String(text || '').slice(from);
  if (final) return rest.trim() ? { text: rest, to: from + rest.length } : null;
  const min = first ? SPEECH_FIRST_MIN : SPEECH_NEXT_MIN, ends = /[.!?…](?=["»)\]]?\s)|\n+/g;
  let match, cut = -1;
  while ((match = ends.exec(rest))) { const end = match.index + match[0].length; if (rest.slice(0, end).trim().length >= min) { cut = end; if (first) break; } }
  return cut > 0 ? { text: rest.slice(0, cut), to: from + cut } : null;
};

/** La configuración de la voz desde el entorno. Sin clave o sin voz, Bria no habla y la pantalla de voz no aparece. */
export const voiceConfig = (env = process.env) => {
  const apiKey = String(env.ELEVENLABS_API_KEY || '').trim(), voiceId = String(env.ELEVENLABS_VOICE_ID || '').trim();
  const model = /^[a-z0-9_.-]{3,60}$/.test(String(env.ELEVENLABS_MODEL_ID || '').trim()) ? String(env.ELEVENLABS_MODEL_ID).trim() : VOICE_MODEL;
  const daily = Number.parseInt(env.BRIA_VOICE_DAILY_CHARS, 10);
  const chosen = isVoiceId(voiceId);
  // `ready`: hay cuenta de ElevenLabs. `enabled`: además hay una voz elegida para todos.
  return { ready: Boolean(apiKey), enabled: Boolean(apiKey) && chosen, apiKey, voiceId: chosen ? voiceId : '', model, dailyChars: Number.isInteger(daily) && daily > 0 ? daily : VOICE_DAILY_CHARS };
};

/**
 * Cuándo se cierra el turno de quien habla: ya dijo algo y lleva un rato en silencio. `state` se va pasando de una
 * medida a la siguiente. Devuelve el estado nuevo y `done` cuando toca dejar de grabar.
 */
export const hearTurn = (state = {}, { level = 0, at = 0 } = {}) => {
  const next = { speechMs: state.speechMs || 0, lastAt: state.lastAt ?? at, quietSince: state.quietSince ?? null, spoke: Boolean(state.spoke) };
  const step = Math.max(0, Math.min(500, at - next.lastAt)); next.lastAt = at;
  if (level >= VOICE_SPEECH_LEVEL) { next.speechMs += step; next.quietSince = null; if (next.speechMs >= VOICE_MIN_SPEECH_MS) next.spoke = true; }
  else if (level < VOICE_QUIET_LEVEL) { if (next.quietSince === null) next.quietSince = at; }
  else next.quietSince = null;
  return { ...next, done: next.spoke && next.quietSince !== null && at - next.quietSince >= VOICE_SILENCE_MS };
};

// Cuando Bria tiene que ir a consultar algo, lo dice en vez de quedarse callada (21 de noviembre de 2026). Una frase
// corta por turno, que no cuenta como parte de la respuesta.
export const VOICE_FILLERS = ['Dame un segundo, lo reviso.', 'Déjame mirar.', 'Ya lo consulto.', 'Un momento, lo busco.'];
export const voiceFiller = (turn = 0) => VOICE_FILLERS[Math.abs(Math.trunc(Number(turn) || 0)) % VOICE_FILLERS.length];
