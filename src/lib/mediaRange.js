// Entrega por pedazos de un archivo del almacenamiento (Rodny, 21 de noviembre de 2026: «los vídeos … que no
// tengan que cargar de nuevo cada vez»). Un reproductor pide `Range: bytes=a-b` para pintar el primer cuadro,
// empezar a sonar antes de tener el archivo entero y saltar a la mitad; Safari en iPhone no reproduce sin eso.
// El pedazo se le pide tal cual al almacenamiento: el servidor nunca carga el archivo en memoria.

const SINGLE_RANGE = /^bytes=(\d{0,15})-(\d{0,15})$/;

/** Devuelve el rango tal como hay que pedirlo al almacenamiento, o `null` si no hay uno que entendamos. */
export function normalizeRangeHeader(header) {
  const match = SINGLE_RANGE.exec(String(header || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (match[1] && match[2] && Number(match[2]) < Number(match[1])) return null;
  return `bytes=${match[1]}-${match[2]}`;
}

const isUnsatisfiable = error => error?.name === 'InvalidRange' || error?.$metadata?.httpStatusCode === 416;

/**
 * Responde con el archivo o con el pedazo pedido. `storage` es cualquiera de los almacenamientos de la
 * plataforma (`getFromS3Stream(key, { range })`).
 */
export async function sendStoredObject(req, res, { storage, key, mimeType, name, cacheControl = 'private, max-age=300' }) {
  const range = normalizeRangeHeader(req.headers?.range);
  let object;
  try {
    object = await storage.getFromS3Stream(key, range ? { range } : undefined);
  } catch (error) {
    if (!range || !isUnsatisfiable(error)) throw error;
    res.setHeader('Content-Range', 'bytes */*');
    return res.status(416).end();
  }
  res.setHeader('Content-Type', mimeType || object.ContentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name || 'archivo')}"`);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Accept-Ranges', 'bytes');
  if (object.ETag) res.setHeader('ETag', object.ETag);
  if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
  if (range && object.ContentRange) {
    res.status(206);
    res.setHeader('Content-Range', object.ContentRange);
  }
  // Un reproductor corta pedidos todo el tiempo (al saltar, al pausar): sin esto la lectura del almacenamiento
  // seguiría abierta hasta el final del archivo.
  const body = object.Body;
  res.once('close', () => { if (!res.writableEnded) body?.destroy?.(); });
  body.once?.('error', () => { if (!res.headersSent) res.status(502); res.destroy?.(); });
  return body.pipe(res);
}
