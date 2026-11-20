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
