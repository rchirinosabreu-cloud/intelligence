// El nombre de almacenamiento identifica bytes; nunca sustituye el nombre de la entrega.
const EXTENSIONS = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'application/pdf': '.pdf', 'application/zip': '.zip', 'text/plain': '.txt',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav',
};

export function finalAssetDownloadName(asset, item = {}, position = null) {
  if (typeof asset?.name === 'string' && asset.name.trim()) return asset.name;
  const title = String(item.title || 'Entregable').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'Entregable';
  const suffix = position === null ? '' : ` - ${position + 1}`;
  return `${title}${suffix}${EXTENSIONS[String(asset?.mimeType || '').split(';')[0].toLowerCase()] || ''}`;
}
