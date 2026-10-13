// Lo que el cliente escribe en el portal (Rodny, 13 de octubre de 2026). La regla vive **una sola
// vez** y la usan la pantalla y el servidor: si solo la supiera el servidor, la persona se entera
// después de escribir, y eso fue exactamente lo que pasó.
//
// Una clienta de Wine & Wonder escribió un comentario largo, le dio a Enviar cuatro veces y las
// cuatro le respondió «Error al enviar el comentario». El servidor **sí** decía el motivo —pasaba
// de 2000 caracteres— pero el portal lo mandaba a la consola del navegador y enseñaba una frase
// que no dice nada. Se rindió y dejó escrito: «Post en el whatsapp, daba error aqui».
//
// El tope sube a 5000: 2000 no alcanza para el feedback de verdad de un cliente (el suyo no cabía)
// y lo que protege esa ruta pública del abuso es el limitador de peticiones de `server.js`, no el
// largo del texto. Un comentario de 5000 caracteres sigue siendo un comentario.

export const CLIENT_COMMENT_MAX_CHARS = 5000;

/** Desde cuántos caracteres se le empieza a enseñar el contador, para que no lo sorprenda el tope. */
export const CLIENT_COMMENT_COUNTER_FROM = Math.round(CLIENT_COMMENT_MAX_CHARS * 0.8);

const miles = (value) => Number(value).toLocaleString('es-CO');

/**
 * Qué le impide enviar este comentario, dicho para que lo lea una persona: nunca un código, y
 * siempre con la cifra y la salida («puedes enviarlo en dos partes»).
 * Devuelve `null` cuando se puede enviar.
 */
export const clientCommentProblem = (text) => {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return 'Escribe lo que quieres que ajustemos.';
  if (value.length > CLIENT_COMMENT_MAX_CHARS) {
    return `Tu comentario tiene ${miles(value.length)} caracteres y caben ${miles(CLIENT_COMMENT_MAX_CHARS)}. Puedes enviarlo en dos partes.`;
  }
  return null;
};

/** El texto tal como se guarda: el servidor escribe esto, no lo que llegó en crudo. */
export const normalizeClientComment = (text) => (typeof text === 'string' ? text.trim() : '');
