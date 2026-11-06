import React from 'react';
import { formatFileSize } from '@/lib/uploadLimits';

const ACTIONS = { DELIVERED: 'Entrega guardada', REPLACED: 'Entrega actualizada', REORDERED: 'Orden actualizado', ADDED: 'Archivos añadidos', REMOVED: 'Archivo retirado',
  APPENDED: 'Archivos añadidos', DELETED: 'Archivo retirado' };
const dateLabel = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : 'Fecha no disponible';

function FileNames({ files }) {
  return <ul className="mt-1 space-y-1 text-xs text-muted-foreground">{(files || []).map((file, index) =>
    <li key={`${file.id || file.name}:${index}`} className="break-words">{file.name || 'Archivo'}{file.size ? ` · ${formatFileSize(file.size)}` : ''}</li>)}</ul>;
}

export default function DeliveryHistory({ history = [] }) {
  if (!history.length) return null;
  return <details className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
    <summary className="min-h-11 cursor-pointer text-sm font-medium">Historial de entregas ({history.length})</summary>
    <ol className="mt-2 space-y-4">{history.map(entry => <li key={entry.id} className="border-l-2 border-zinc-200 pl-3 dark:border-white/10">
      <p className="text-sm font-medium">{ACTIONS[entry.action] || 'Entrega actualizada'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{entry.actorName || 'Equipo'} · {dateLabel(entry.at)}</p>
      <FileNames files={entry.files} />
      {entry.previousFiles?.length > 0 && entry.action !== 'REORDERED' && <div className="mt-2">
        <p className="text-xs font-medium text-muted-foreground">Conjunto anterior</p>
        <FileNames files={entry.previousFiles} />
      </div>}
    </li>)}</ol>
    <p className="mt-3 text-xs text-muted-foreground">El historial conserva los datos de cada entrega. Los archivos reemplazados ya no están disponibles.</p>
  </details>;
}
