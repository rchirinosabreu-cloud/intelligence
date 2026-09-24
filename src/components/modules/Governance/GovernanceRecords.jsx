import React from 'react';
import { STATUS_LABELS } from '../../../lib/aiGovernance.js';
export const displayDate = value => value ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
export default function GovernanceRecords({ kind, items = [], loading, error, onEdit, onHistory }) {
  if (loading) return <p role="status">Cargando registros…</p>;
  if (error) return <p role="alert" className="text-destructive">No se pudo cargar: {error.message}</p>;
  if (!items.length) return <p className="py-10 text-center text-muted-foreground">Sin registros. Crea el primero con información y evidencia verificadas.</p>;
  return <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-xl border border-border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{item.name}</h3><p className="text-sm text-muted-foreground">{STATUS_LABELS[item.status]} · Versión {item.version}</p></div>
      <div className="flex gap-2 text-sm">
        {item.status !== 'REVOKED' && <button type="button" className="min-h-11 rounded-lg border px-3 hover:bg-muted" onClick={() => onEdit(item)}>{kind === 'authorizations' && item.status === 'APPROVED' ? 'Revocar' : 'Ver / editar'}</button>}
        <button type="button" className="min-h-11 rounded-lg border px-3 hover:bg-muted" onClick={() => onHistory(item)}>Historial</button>
      </div>
    </div>
    {kind === 'authorizations' && <p className="mt-3 text-sm">{item.data.useCase} · Vigencia: {displayDate(item.data.startsAt)} — {displayDate(item.data.expiresAt)}. La aprobación no garantiza vigencia operativa: se revalida antes del uso.</p>}
    {kind === 'incidents' && <div className="mt-3 text-sm"><p>Fecha límite de aviso: {displayDate(item.notificationDueAt)} (Bogotá)</p><p className={item.notificationOverdue || item.notifiedLate ? 'font-medium text-destructive' : 'text-muted-foreground'}>{item.notificationOverdue ? 'Plazo de aviso vencido: notifica y registra la evidencia.' : item.notifiedLate ? 'Aviso registrado fuera de plazo.' : item.data.notifiedAt ? 'Aviso registrado con evidencia; verificar entrega.' : 'Aviso pendiente. El sistema no envía correos.'}</p></div>}
  </article>)}</div>;
}
