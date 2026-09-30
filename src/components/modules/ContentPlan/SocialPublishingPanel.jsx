import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Facebook, Info, Instagram, Loader2, Send } from '@/components/ui/icons';
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, publishAtIso, schedulingProblems } from '@/lib/socialPublishing';

/**
 * Publicación automática de una pieza en Instagram y Facebook (Rodny, 29 de septiembre de 2026).
 *
 * Una banda al pie de la tarjeta: por cada red conectada del cliente, qué pasa con esta pieza
 * (nada todavía, programada, publicando, publicada con enlace, o falló con su motivo). Nada sale solo
 * por estar aprobado: siempre hay un «Programar» explícito. Los motivos que impiden programar se
 * calculan aquí con la misma regla del servidor (`schedulingProblems`) y se dicen antes de pedirlo.
 */
const PLATFORM_ICON = { INSTAGRAM: Instagram, FACEBOOK: Facebook };

const bogotaStamp = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch {
    return '';
  }
};

const STATUS_TEXT = {
  SCHEDULED: (row) => `Programada · ${bogotaStamp(row.scheduledAt)}${row.attempts ? ` · reintento ${row.attempts}` : ''}`,
  PUBLISHING: () => 'Publicando…',
  PUBLISHED: (row) => `Publicada · ${bogotaStamp(row.publishedAt)}`,
  FAILED: (row) => row.error || 'No se pudo publicar.',
  CANCELLED: () => 'Cancelada'
};

const STATUS_CLASS = {
  SCHEDULED: 'border-brand-cyan/30 bg-brand-cyan-soft/40 text-brand-cyan-deep dark:bg-brand-cyan/10 dark:text-brand-cyan',
  PUBLISHING: 'border-brand-cyan/30 bg-brand-cyan-soft/40 text-brand-cyan-deep dark:bg-brand-cyan/10 dark:text-brand-cyan',
  PUBLISHED: 'border-brand-green/30 bg-brand-green-soft/50 text-brand-green-deep dark:bg-brand-green/10 dark:text-brand-green',
  FAILED: 'border-destructive/30 bg-destructive/5 text-destructive',
  CANCELLED: 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400'
};

const ACTION_CLASS = 'text-[12px] font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan disabled:cursor-not-allowed disabled:opacity-50';

export default function SocialPublishingPanel({ item, accounts = [], onSchedule, onCancel, onRetry, isBusy = false, serverProblems = [] }) {
  const connected = useMemo(() => accounts.filter((account) => SOCIAL_PLATFORMS.includes(account.platform)), [accounts]);
  const active = useMemo(() => connected.filter((account) => account.isActive !== false), [connected]);
  const publications = item.publications || [];
  const rowFor = (platform) => publications.find((row) => row.platform === platform) || null;
  // Lo fallido se vuelve a intentar con «Reintentar», no con «Programar»: dos caminos para lo mismo confunden.
  const selectable = active.filter((account) => !['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'].includes(rowFor(account.platform)?.status));
  const [chosen, setChosen] = useState(() => new Set(selectable.map((account) => account.platform)));
  const platforms = selectable.map((account) => account.platform).filter((platform) => chosen.has(platform));
  const problems = platforms.length
    ? schedulingProblems({ item, assets: item.finalAssets || [], accounts: active, platforms, now: new Date() })
    : [];
  const publishAt = publishAtIso(item.publishDate, item.publishTime);

  if (!connected.length) {
    return (
      <div className="border-t border-zinc-100 px-6 py-4 dark:border-white/5" data-social-publishing-panel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Publicación en redes:</span> este cliente no tiene Instagram ni Facebook conectados. Se conectan desde la ficha del cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 px-6 py-5 dark:border-white/5" data-social-publishing-panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Publicación en redes</span>
          <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
            {publishAt ? <>Sale el <strong>{bogotaStamp(publishAt)}</strong> (hora de Bogotá).</> : 'Elige la hora en la ficha para poder programarla.'}
          </span>
        </div>
        {selectable.length > 0 && (
          <button
            type="button"
            onClick={() => onSchedule(item.id, platforms)}
            disabled={isBusy || !platforms.length || problems.length > 0}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-cyan-deep px-4 text-[13px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Programar
          </button>
        )}
      </div>

      {/* Una columna y texto que se ajusta: el motivo de un fallo es justo lo que hay que poder leer entero. */}
      <ul className="mt-3 flex flex-col gap-2">
        {connected.map((account) => {
          const Icon = PLATFORM_ICON[account.platform];
          const row = rowFor(account.platform);
          const disconnected = account.isActive === false;
          const canChoose = !disconnected && selectable.some((candidate) => candidate.platform === account.platform);
          const text = disconnected
            ? `Desconectada${account.lastError ? ` · ${account.lastError}` : ''}`
            : row ? STATUS_TEXT[row.status]?.(row) : 'Sin programar';
          const tone = disconnected ? STATUS_CLASS.FAILED : (row ? STATUS_CLASS[row.status] : STATUS_CLASS.CANCELLED);
          return (
            <li key={account.id} className={`flex min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px] ${tone}`} data-social-platform={account.platform}>
              {canChoose ? (
                <input
                  type="checkbox"
                  checked={chosen.has(account.platform)}
                  onChange={(event) => setChosen((prev) => { const next = new Set(prev); if (event.target.checked) next.add(account.platform); else next.delete(account.platform); return next; })}
                  aria-label={`Programar en ${SOCIAL_PLATFORM_LABELS[account.platform]}`}
                  className="h-4 w-4 shrink-0 accent-brand-cyan"
                />
              ) : (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {/* El icono de fallo hereda el token destructivo de la fila (`STATUS_CLASS.FAILED`). */}
                  {row?.status === 'PUBLISHED' ? <CheckCircle2 className="h-4 w-4" /> : row?.status === 'FAILED' || disconnected ? <AlertCircle className="h-4 w-4 text-destructive" /> : row?.status === 'PUBLISHING' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                </span>
              )}
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words leading-snug">
                <span className="font-bold">{account.displayName}</span>
                <span className="text-zinc-400"> · </span>
                <span>{text}</span>
              </span>
              {row?.status === 'SCHEDULED' && (
                <button type="button" onClick={() => onCancel(row.id)} disabled={isBusy} className={`${ACTION_CLASS} shrink-0`}>Cancelar</button>
              )}
              {row?.status === 'FAILED' && !disconnected && (
                <button type="button" onClick={() => onRetry(row.id)} disabled={isBusy} className={`${ACTION_CLASS} shrink-0`}>Reintentar</button>
              )}
              {row?.status === 'PUBLISHED' && row.permalink && (
                <a href={row.permalink} target="_blank" rel="noreferrer" className={`${ACTION_CLASS} inline-flex shrink-0 items-center gap-1`}>
                  Ver <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {(problems.length > 0 || serverProblems.length > 0) && (
        <ul className="mt-3 space-y-1 text-[12px] text-zinc-600 dark:text-zinc-300" data-social-problems>
          {[...new Set([...problems, ...serverProblems])].map((problem) => (
            <li key={problem} className="flex items-start gap-1.5">
              {/* Son avisos de qué falta, no errores: icono informativo, sin el color destructivo. */}
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <span>{problem}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
