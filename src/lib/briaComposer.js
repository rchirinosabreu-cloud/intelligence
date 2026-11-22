// Reglas puras del cuadro de escribir de Bria y de la onda del dictado (Rodny, 20 de noviembre de 2026).

export const DICTATION_BARS = 28;
/** Suma una medida de volumen (0 a 1) y conserva solo las últimas barras. */
export const pushLevel = (levels, value) => [...levels.slice(-(DICTATION_BARS - 1)), Math.max(0, Math.min(1, Number(value) || 0))];
/** El volumen de una muestra del analizador (bytes centrados en 128), de 0 a 1, con realce para la voz normal. */
export const levelOf = (samples) => { let sum = 0; for (const sample of samples) { const centered = (sample - 128) / 128; sum += centered * centered; } return samples.length ? Math.min(1, Math.sqrt(sum / samples.length) * 3.2) : 0; };
/** El alto de cada barra de la onda, en porcentaje: siempre se ve algo, aunque haya silencio. */
export const waveBars = (levels = []) => Array.from({ length: DICTATION_BARS }, (_, index) => { const level = levels[levels.length - DICTATION_BARS + index]; return Math.round(12 + 88 * (Number.isFinite(level) ? level : 0)); });
/** Se puede enviar si hay texto o archivos y nada lo impide (Bria respondiendo, un dictado en curso). */
export const canSendMessage = ({ value, files = [], blocked = false }) => !blocked && (String(value || '').trim().length > 0 || files.length > 0);

// El texto en gris mientras se dicta (Rodny, 20 de noviembre de 2026: «transcripción en vivo»). Mientras graba, el
// navegador manda cada tanto lo grabado hasta ese momento al mismo servicio de transcripción del dictado, y lo que
// vuelve se muestra en gris. Es un adelanto: el texto definitivo sigue saliendo de la transcripción final. Tiene
// techo para no transcribir de más: los primeros 30 s cada 2,5 s, hasta los 90 s cada 5 s, y de ahí en adelante nada.
// Más seguido desde el 21 de noviembre de 2026 (Rodny: «el dictado se demora mucho en aparecer»): cada 1,2 s al comienzo.
export const PREVIEW_FAST_MS = 1200, PREVIEW_SLOW_MS = 5000, PREVIEW_FAST_UNTIL_MS = 30000, PREVIEW_UNTIL_MS = 90000, PREVIEW_MAX_BYTES = 3 * 1024 * 1024;
export const previewDue = ({ elapsedMs = 0, lastAtMs = 0, pending = false, bytes = 0 } = {}) => {
  if (pending || !bytes || bytes > PREVIEW_MAX_BYTES || elapsedMs > PREVIEW_UNTIL_MS || elapsedMs < 1000) return false;
  return elapsedMs - lastAtMs >= (elapsedMs <= PREVIEW_FAST_UNTIL_MS ? PREVIEW_FAST_MS : PREVIEW_SLOW_MS);
};
