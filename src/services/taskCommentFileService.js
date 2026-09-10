const fileError = (status, message) => Object.assign(new Error(message), { status });

function storedFile(rawUrl, bucketName) {
  try {
    const url = new URL(rawUrl);
    const configuredOrigin = new URL(process.env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev').origin;
    if (![configuredOrigin, 'https://t3.storageapi.dev'].includes(url.origin)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== bucketName || parts.length < 2) return null;
    const key = decodeURIComponent(parts.slice(1).join('/'));
    return { url: url.href, key, name: key.split('/').pop() };
  } catch {
    return null;
  }
}

/** Resolve only files already attached to this comment. A selector is never
 * treated as a free storage key or an arbitrary URL to fetch. */
export function resolveTaskCommentFile({ attachments, content, selector = {}, bucketName = process.env.AWS_S3_BUCKET_NAME || 'chat-evidence' }) {
  for (const field of ['attachmentId', 'url', 'filename']) {
    if (Object.hasOwn(selector, field) && (typeof selector[field] !== 'string' || !selector[field].trim())) {
      throw fileError(400, 'El selector del archivo no es válido.');
    }
  }

  // IDs take precedence: never fall back to a name/URL after an invalid ID.
  if (selector.attachmentId !== undefined) {
    const attachment = attachments.find(file => file.id === selector.attachmentId);
    const stored = attachment && storedFile(attachment.url, bucketName);
    if (!stored) throw fileError(404, 'El archivo seleccionado no pertenece a este comentario o ya no está disponible.');
    return { ...stored, name: attachment.name || stored.name };
  }

  const candidates = attachments.map(attachment => {
    const stored = storedFile(attachment.url, bucketName);
    return stored && { ...stored, name: attachment.name || stored.name };
  }).filter(Boolean);
  const urls = String(content || '').match(/https?:\/\/[^\s<>"']+/g) || [];
  for (const rawUrl of urls) {
    const stored = storedFile(rawUrl.replaceAll('&amp;', '&'), bucketName);
    if (stored && !candidates.some(file => file.url === stored.url)) candidates.push(stored);
  }

  let matches = candidates;
  if (selector.url !== undefined) {
    let url;
    try { url = new URL(selector.url).href; } catch { throw fileError(400, 'El enlace del archivo no es válido.'); }
    matches = candidates.filter(file => file.url === url);
  } else if (selector.filename !== undefined) {
    // Compatibility for older open clients, only when the name is unambiguous.
    matches = candidates.filter(file => file.name === selector.filename);
  }
  const distinct = [...new Map(matches.map(file => [file.key, file])).values()];
  if (!distinct.length) throw fileError(404, 'El archivo seleccionado no está disponible en este comentario.');
  if (distinct.length !== 1) throw fileError(409, 'Este comentario tiene varios archivos. Actualiza la aplicación y selecciona el adjunto que quieres abrir.');
  return distinct[0];
}
