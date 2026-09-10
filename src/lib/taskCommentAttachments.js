export const MAX_COMMENT_FILES = 10;
export const MAX_COMMENT_FILE_BYTES = 25 * 1024 * 1024;

export function commentFileUrls(baseUrl, taskId, commentId, attachment) {
  const query = new URLSearchParams();
  if (attachment.id) query.set('attachmentId', attachment.id);
  else if (attachment.url) query.set('url', attachment.url);
  if (attachment.name) query.set('filename', attachment.name);
  const base = `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`;
  return { previewUrl: `${base}/file?${query}`, downloadUrl: `${base}/download?${query}` };
}

export function commentFilesValidationMessage(files) {
  if (files.length > MAX_COMMENT_FILES) return `Puedes adjuntar hasta ${MAX_COMMENT_FILES} archivos por mensaje.`;
  if (files.reduce((total, file) => total + (file.size || 0), 0) > MAX_COMMENT_FILE_BYTES) return 'Los archivos del mensaje no pueden superar 25 MB en total.';
  return null;
}

export function commentDownloadFilename(header, fallback = 'archivo') {
  const extended = String(header || '').match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  if (extended) {
    try { return decodeURIComponent(extended[1].trim()); } catch { /* Use the legacy filename if malformed. */ }
  }
  const legacy = String(header || '').match(/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  return legacy?.[1] || legacy?.[2]?.trim() || fallback;
}
