import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, Facebook, Info, Instagram, Loader2, Send } from '@/components/ui/icons';
import {
  SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, pieceSocialPageIds, publishAtIso, schedulingNotices, schedulingProblems, socialPagesOf
} from '@/lib/socialPublishing';

/**
 * Publicación automática de una pieza en Instagram y Facebook (Rodny, 29 de septiembre de 2026).
 *
 * Una banda al pie de la tarjeta: por cada cuenta a la que va la pieza, qué pasa con ella (nada todavía,
 * programada, publicando, publicada con enlace, o falló con su motivo). Nada sale solo por estar
 * aprobado: siempre hay un «Programar» explícito. Los motivos que impiden programar se calculan aquí
 * con la misma regla del servidor (`schedulingProblems`) y se dicen antes de pedirlo.
 *
 * Un cliente puede tener varias cuentas (Rodny, 2 de octubre de 2026: PromoGroup y Endova comparten
 * parrilla). Entonces la banda pregunta primero **a qué cuentas va esta pieza** —una o varias; por
 * defecto solo la primera que se conectó— y debajo muestra el Facebook y el Instagram de esas cuentas.
 * Con una sola cuenta esa pregunta no aparece y todo se ve como siempre.
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
  // El motivo se dice: «Cancelada» a secas no distingue lo que canceló una persona de lo que la
  // plataforma soltó por un cambio de hora o de lo que se reabrió para publicar de nuevo.
  CANCELLED: (row) => row.error || 'Cancelada'
};

const STATUS_CLASS = {
  SCHEDULED: 'border-brand-cyan/30 bg-brand-cyan-soft/40 text-brand-cyan-deep dark:bg-brand-cyan/10 dark:text-brand-cyan',
  PUBLISHING: 'border-brand-cyan/30 bg-brand-cyan-soft/40 text-brand-cyan-deep dark:bg-brand-cyan/10 dark:text-brand-cyan',
  PUBLISHED: 'border-brand-green/30 bg-brand-green-soft/50 text-brand-green-deep dark:bg-brand-green/10 dark:text-brand-green',
  FAILED: 'border-destructive/30 bg-destructive/5 text-destructive',
  CANCELLED: 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400'
};

const ACTION_CLASS = 'text-[12px] font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan disabled:cursor-not-allowed disabled:opacity-50';
/** Lo que ya salió o está por salir se sigue mostrando aunque la pieza deje esa cuenta: es su historial. */
const KEPT_STATUSES = ['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'];

export default function SocialPublishingPanel({ item, accounts = [], onSchedule, onCancel, onRetry, onReopen, onChangePages, isBusy = false, serverProblems = [] }) {
  const connected = useMemo(() => accounts.filter((account) => SOCIAL_PLATFORMS.includes(account.platform)), [accounts]);
  const pages = useMemo(() => socialPagesOf(connected), [connected]);
  const chosenPageIds = pieceSocialPageIds(item, connected);
  const publications = item.publications || [];
  // Una fila pertenece a una cuenta, no a una red: un cliente puede tener dos Instagram.
  const rowFor = (account) => publications.find((row) => row.socialAccountId === account.id)
    || publications.find((row) => !row.socialAccountId && row.platform === account.platform)
    || null;
  const ofThisPiece = new Set(pages.filter((page) => chosenPageIds.includes(page.pageId)).flatMap((page) => page.accounts.map((account) => account.id)));
  // Las cuentas de esta pieza, más las que conservan algo publicado o en cola aunque la pieza ya no vaya ahí.
  const shown = pages.flatMap((page) => page.accounts)
    .filter((account) => ofThisPiece.has(account.id) || KEPT_STATUSES.includes(rowFor(account)?.status));
  // Lo fallido se vuelve a intentar con «Reintentar», no con «Programar»: dos caminos para lo mismo confunden.
  const selectable = shown.filter((account) => (
    account.isActive !== false && ofThisPiece.has(account.id) && !KEPT_STATUSES.includes(rowFor(account)?.status)
  ));
  // Se recuerda lo que la persona desmarcó, no lo marcado: así una red que vuelve a estar disponible
  // (cancelada, o reabierta para publicar de nuevo) aparece marcada sin tener que acordarse de hacerlo.
  const [excluded, setExcluded] = useState(() => new Set());
  const targets = selectable.filter((account) => !excluded.has(account.id));
  const platforms = Array.from(new Set(targets.map((account) => account.platform)));
  const problems = targets.length
    ? schedulingProblems({ item, assets: item.finalAssets || [], targets, now: new Date() })
    : [];
  // Lo que no impide programar pero hay que saber antes de pulsar (en Facebook el carrusel sale sin video).
  const notices = targets.length && !problems.length
    ? schedulingNotices({ item, assets: item.finalAssets || [], platforms })
    : [];
  const publishAt = publishAtIso(item.publishDate, item.publishTime);
  const canChoosePages = pages.length > 1 && typeof onChangePages === 'function';

  const togglePage = (pageId) => {
    const next = chosenPageIds.includes(pageId) ? chosenPageIds.filter((id) => id !== pageId) : [...chosenPageIds, pageId];
    // La pieza tiene que ir al menos a una cuenta: la última marcada no se desmarca.
    if (next.length) onChangePages(item.id, next);
  };

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
            onClick={() => onSchedule(item.id, targets.map((account) => account.id))}
            disabled={isBusy || !targets.length || problems.length > 0}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-cyan-deep px-4 text-[13px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Programar
          </button>
        )}
      </div>

      {/* A qué cuentas va esta pieza. Casillas, no un desplegable: puede ir a varias, y quitarle una
          cuenta cancela lo que tuviera programado ahí (lo hace el servidor y lo dice en la fila). */}
      {canChoosePages && (
        <div role="group" aria-label="Cuentas a las que va esta pieza" className="mt-3 flex flex-wrap items-center gap-2" data-social-page-choice>
          <span className="mr-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Esta pieza va a</span>
          {pages.map((page) => {
            const checked = chosenPageIds.includes(page.pageId);
            const isLast = checked && chosenPageIds.length === 1;
            return (
              <label
                key={page.pageId}
                title={isLast ? 'La pieza tiene que ir al menos a una cuenta' : undefined}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition ${
                  checked
                    ? 'border-brand-cyan bg-brand-cyan-soft/40 text-brand-cyan-deep dark:bg-brand-cyan/10 dark:text-brand-cyan'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5'
                } ${isBusy ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isBusy || isLast}
                  onChange={() => togglePage(page.pageId)}
                  className="h-3.5 w-3.5 shrink-0 accent-brand-cyan"
                />
                <span className="truncate">{page.name}</span>
                {page.isActive === false && <span className="text-xs text-destructive">· desconectada</span>}
              </label>
            );
          })}
        </div>
      )}

      {/* Una columna y texto que se ajusta: el motivo de un fallo es justo lo que hay que poder leer entero. */}
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((account) => {
          const Icon = PLATFORM_ICON[account.platform];
          const row = rowFor(account);
          const disconnected = account.isActive === false;
          const canChoose = selectable.some((candidate) => candidate.id === account.id);
          const text = disconnected
            ? `Desconectada${account.lastError ? ` · ${account.lastError}` : ''}`
            : row ? STATUS_TEXT[row.status]?.(row) : 'Sin programar';
          const tone = disconnected ? STATUS_CLASS.FAILED : (row ? STATUS_CLASS[row.status] : STATUS_CLASS.CANCELLED);
          return (
            <li key={account.id} className={`flex min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px] ${tone}`} data-social-platform={account.platform} data-social-account={account.id}>
              {canChoose ? (
                <input
                  type="checkbox"
                  checked={!excluded.has(account.id)}
                  onChange={(event) => setExcluded((prev) => { const next = new Set(prev); if (event.target.checked) next.delete(account.id); else next.add(account.id); return next; })}
                  aria-label={`Programar en ${SOCIAL_PLATFORM_LABELS[account.platform]} de ${account.displayName}`}
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
              {/* Lo que ya salió se puede volver a mandar (Rodny, 1 de octubre de 2026: borró el carrusel
                  en la red para corregir una imagen y aquí no había nada que pulsar). Pregunta antes. */}
              {row?.status === 'PUBLISHED' && !disconnected && typeof onReopen === 'function' && (
                <button type="button" onClick={() => onReopen(row.id, account.platform)} disabled={isBusy} className={`${ACTION_CLASS} shrink-0`}>Publicar de nuevo</button>
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

      {/* Avisos que no bloquean: se puede programar, pero la persona sabe antes qué sale distinto. */}
      {notices.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] text-zinc-600 dark:text-zinc-300" data-social-notices>
          {notices.map((notice) => (
            <li key={notice} className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-cyan-deep dark:text-brand-cyan" aria-hidden="true" />
              <span>{notice}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
