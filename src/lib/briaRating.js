// Que Bria se mida (Rodny, 14 de octubre de 2026): un pulgar arriba o abajo en cada respuesta, con una nota corta
// opcional cuando no sirvió. La valoración vive en el turno de Bria (`metadata.rating`), la pone solo la dueña del
// chat y `uso_de_bria` la cuenta sin leer ninguna conversación. Regla pura, compartida por servicio y pantalla.
import { knowledgeError } from './briaKnowledge.js';

export const RATING_VALUES = ['UP', 'DOWN'];
export const RATING_NOTE_MAX = 300;

/** Devuelve `{ value, note }` limpios o lanza con palabras. */
export const normalizeRating = ({ rating, note } = {}) => {
  const value = String(rating || '').trim().toUpperCase();
  if (!RATING_VALUES.includes(value)) throw knowledgeError('La valoración es pulgar arriba o abajo.');
  const text = note == null ? '' : String(note).replace(/\s+/g, ' ').trim();
  if (text.length > RATING_NOTE_MAX) throw knowledgeError(`La nota puede tener hasta ${RATING_NOTE_MAX} caracteres.`);
  return { value, note: text || null };
};

/** Solo se valora una respuesta de Bria ya guardada: con id real, nunca la burbuja provisional ni un turno sin id. */
export const canRateTurn = (turn) => turn?.role === 'assistant' && typeof turn.id === 'string' && turn.id !== '' && turn.id !== 'pending';

// 20 de octubre de 2026: comparar `ratingNote?.turnId === turn.id` a secas daba `undefined === undefined` con un turno
// sin id, así que la caja «¿Qué falló?» se dibujaba sin nota abierta y el panel se caía leyendo `null.text`.
/** La nota «¿Qué falló?» está abierta para este turno: hay nota, el turno tiene id y es el mismo. */
export const ratingNoteOpenFor = (ratingNote, turn) => Boolean(ratingNote && canRateTurn(turn) && ratingNote.turnId === turn.id);

/** La posición de un turno a partir de su id `${conversationId}:${position}`; null si no es de ese chat. */
export const turnPosition = (conversationId, turnId) => {
  const match = /^(.+):(\d+)$/.exec(String(turnId || ''));
  return match && match[1] === conversationId ? Number(match[2]) : null;
};
