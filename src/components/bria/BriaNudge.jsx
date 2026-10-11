import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUpRight } from '@/components/ui/icons';
import BriaPortrait from './BriaPortrait';
import { askBria, openBriaConversation } from '@/lib/briaAsk';
import { requestBriaNudges } from '@/lib/briaNudgeRequest';
import { cn } from '@/lib/utils';

// «Bria se adelanta» (Rodny, 10 de octubre de 2026): un aviso discreto encima del botón de Bria, sin abrir el chat.
// Un hecho de la plataforma y una sugerencia; «Pedírselo a Bria» deja el mensaje escrito en el chat y la persona
// decide si lo manda. Se oculta por hoy con la X. Se refresca cada cinco minutos con la pestaña visible.
export const NUDGE_REFRESH_MS = 5 * 60 * 1000;

export default function BriaNudge({ userId, hidden = false, request = requestBriaNudges, refreshMs = NUDGE_REFRESH_MS, className }) {
  const [nudges, setNudges] = useState([]), [busy, setBusy] = useState(false), mounted = useRef(true);
  const load = async () => {
    try { const data = await request(''); if (mounted.current) setNudges(Array.isArray(data?.nudges) ? data.nudges : []); }
    catch (failure) { console.error('[BriaNudge]', failure.message); }
  };
  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, refreshMs);
    const focus = () => load();
    window.addEventListener('focus', focus);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const nudge = nudges[0];
  if (hidden || !nudge) return null;
  const dismiss = async () => {
    setBusy(true);
    try { await request('/dismiss', { method: 'POST', body: { key: nudge.key } }); if (mounted.current) setNudges(rows => rows.filter(row => row.key !== nudge.key)); }
    catch (failure) { console.error('[BriaNudge] No se pudo ocultar el aviso:', failure.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const action = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan';
  return (
    <section role="status" aria-label="Aviso de Bria" data-bria-nudge={nudge.kind} className={cn('brain-popover-surface fixed right-4 z-[49] w-[min(340px,calc(100vw-2rem))] rounded-2xl p-4 bottom-[calc(1rem+env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[calc(1rem+env(safe-area-inset-bottom)+6.75rem)]', className)}>
      <div className="flex items-start gap-3">
        <BriaPortrait className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Bria se adelanta
            {nudges.length > 1 && <span className="normal-case tracking-normal text-zinc-400 dark:text-zinc-500" data-bria-nudge-count>1 de {nudges.length}</span>}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-5 text-zinc-950 dark:text-white">{nudge.title}</h3>
          {nudge.body && <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{nudge.body}</p>}
          <div className="mt-2 -ml-2 flex flex-wrap items-center gap-x-1">
            {nudge.conversationId && <button type="button" className={action} onClick={() => openBriaConversation(nudge.conversationId)}>Leer en Bria<ArrowUpRight className="h-3.5 w-3.5" /></button>}
            {nudge.ask && <button type="button" className={action} onClick={() => askBria(nudge.ask)}>Pedírselo a Bria<ArrowUpRight className="h-3.5 w-3.5" /></button>}
            {nudge.url && <Link to={nudge.url} className={action}>Ver en Gestión<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          </div>
        </div>
        <button type="button" onClick={dismiss} disabled={busy} aria-label="Ocultar por hoy" title="Ocultar por hoy" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
