/**
 * El orden de los archivos de una pieza (Rodny, 1 de octubre de 2026).
 *
 * El orden de la pieza final **es** el orden del carrusel que sale en redes, y un archivo nuevo entra
 * al final: al reemplazar la tercera lámina quedaba de última y no había forma de devolverla a su
 * sitio sin borrar y volver a subir todo. Lógica pura, compartida por la tarjeta y el servidor.
 */

/** Mueve un archivo un puesto antes (-1) o después (+1). Devuelve siempre un arreglo nuevo si cambia algo. */
export const moveAssetId = (ids, id, direction) => {
  const from = ids.indexOf(id);
  const to = from + (direction < 0 ? -1 : 1);
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/** Un orden vale solo si nombra exactamente los archivos de la pieza, una vez cada uno. */
export const finalAssetOrderProblem = (currentIds, orderedIds) => {
  if (!Array.isArray(orderedIds)) return 'El orden debe ser una lista de archivos.';
  const wanted = orderedIds.map((id) => String(id));
  if (new Set(wanted).size !== wanted.length) return 'El orden trae un archivo repetido.';
  const current = new Set(currentIds.map((id) => String(id)));
  if (wanted.some((id) => !current.has(id))) return 'El orden nombra un archivo que no pertenece a esta pieza.';
  if (wanted.length !== current.size) return 'El orden debe incluir todos los archivos de la pieza.';
  return null;
};
