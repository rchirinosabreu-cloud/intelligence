/**
 * El texto de un aviso (Rodny, 4 de octubre de 2026): una sola línea, sin emojis —el icono ya dice
 * si salió bien o mal— y sin títulos de relleno como «Error». Lo usan el visor (`BrainToaster`) y
 * el puente de `useToast()`.
 */

/** Hasta aquí cabe en la píldora de escritorio; lo que pase se recorta y se lee al tocarlo. */
export const TOAST_TEXT_LIMIT = 70;

const GENERIC_TITLES = new Set(['error', 'éxito', 'exito', 'listo', 'aviso', 'atención', 'atencion', 'información', 'informacion']);
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*)+/u;

export const cleanToastText = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(LEADING_EMOJI, '')
  .trim();

/** `{ title, description }` en una línea: un título genérico sobra y el resto se une como dos frases. */
export const toastLine = ({ title, description } = {}) => {
  const head = cleanToastText(title);
  const body = cleanToastText(description);
  if (!body) return head;
  if (!head || GENERIC_TITLES.has(head.toLowerCase().replace(/[.!:]+$/, ''))) return body;
  return /[.!?:]$/.test(head) ? `${head} ${body}` : `${head}. ${body}`;
};
