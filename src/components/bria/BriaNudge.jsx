import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUpRight, CheckCircle } from '@/components/ui/icons';
import BriaPortrait from './BriaPortrait';
import { askBria, openBriaConversation } from '@/lib/briaAsk';
import { requestBriaNudges } from '@/lib/briaNudgeRequest';
import { requestVault } from '@/lib/vaultRequest';
import { cn } from '@/lib/utils';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import toast from 'react-hot-toast';

// «Bria se adelanta» (Rodny, 10 de octubre de 2026): un aviso discreto encima del botón de Bria, sin abrir el chat.
// Un hecho de la plataforma y sus acciones según el tipo (a dónde ir, qué pedirle a Bria: queda escrito y la persona
// decide si lo manda). Se oculta por hoy con la X. Se refresca cada cinco minutos con la pestaña visible.
// La tarjeta existe solo cuando Bria tiene algo que decir (Rodny, 11 de octubre de 2026: «siempre aparece el cuadro
// de la consulta, no me gusta así, estorba»): la consulta rápida vive ahora detrás de la mascota (BriaQuickAsk).
export const NUDGE_REFRESH_MS = 5 * 60 * 1000;

// Pedir un acceso (15 de octubre de 2026): «Compartir», «Dar acceso» o «Denegar» lo decide el servidor; la tarjeta solo
// se va y dice el resultado cuando respondió. Una contraseña se decide en la bóveda; un módulo, en los avisos de Bria.
const decideAccess = ({ scope, requestId, decision }) => (scope === 'permission'
  ? requestBriaNudges(`/permission-requests/${requestId}/decision`, { method: 'POST', body: { decision } })
  : requestVault(`/requests/${requestId}/decision`, { method: 'POST', body: { decision } }));

export default function BriaNudge({ userId, hidden = false, request = requestBriaNudges, decide = decideAccess, refreshMs = NUDGE_REFRESH_MS, className }) {
  const [nudges, setNudges] = useState([]), [busy, setBusy] = useState(false), mounted = useRef(true);
  // Ir a un sitio desde el aviso lleva de dónde se salió: allá se ofrece volver (30 de octubre de 2026).
  const navigateFrom = useNavigateFrom();
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
  const answer = async (choice) => {
    setBusy(true);
    try {
      const out = await decide(choice);
      if (mounted.current) setNudges(rows => rows.filter(row => row.key !== nudge.key));
      toast.success(out.message);
    } catch (failure) {
      console.error('[BriaNudge] No se pudo decidir el pedido de acceso:', failure.message);
      toast.error(failure.message);
    } finally { if (mounted.current) setBusy(false); }
  };
  const action = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan';
  const quiet = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-300 dark:hover:bg-white/10';
  return (
    <section role="status" aria-label="Aviso de Bria" data-bria-nudge={nudge.kind} className={cn('brain-popover-surface fixed right-4 z-[49] w-[min(340px,calc(100vw-2rem))] rounded-2xl p-3 bottom-[calc(1rem+env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[calc(1rem+env(safe-area-inset-bottom)+6.75rem)]', className)}>
      <div className="flex items-start gap-3 px-1 pt-1">
        <BriaPortrait className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Bria se adelanta
            {nudges.length > 1 && <span className="normal-case tracking-normal text-zinc-400 dark:text-zinc-500" data-bria-nudge-count>1 de {nudges.length}</span>}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-5 text-zinc-950 dark:text-white">{nudge.title}</h3>
          {nudge.body && <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{nudge.body}</p>}
          {/* El seguimiento (14 de octubre de 2026): el desenlace del aviso en verde, o «sigue igual» en gris, escritos por el pulso. */}
          {nudge.resolution && <p data-bria-nudge-resolution className="mt-1.5 flex items-start gap-1.5 text-sm leading-5 text-status-positive-fg"><CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />{nudge.resolution}</p>}
          {!nudge.resolution && nudge.followUp && <p data-bria-nudge-follow-up className="mt-1.5 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{nudge.followUp}</p>}
          {/* Los botones los decide la plataforma según el hecho: a dónde ir y qué pedirle a Bria (queda escrito, la persona lo envía). */}
          <div className="mt-2 -ml-2 flex flex-wrap items-center gap-x-1" data-bria-nudge-actions>
            {(nudge.actions || []).map((item) => item.decide
              ? <button key={item.label} type="button" disabled={busy} data-bria-nudge-decision={item.decide.decision} className={cn(item.decide.decision === 'APPROVE' ? action : quiet, 'disabled:opacity-50')} onClick={() => answer(item.decide)}>{item.label}</button>
              : item.href
              // Abrir un módulo recién concedido recarga la página: el menú y las rutas leen el permiso nuevo.
              ? <a key={item.label} href={item.href} className={action}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></a>
              : item.conversationId
              ? <button key={item.label} type="button" className={action} onClick={() => openBriaConversation(item.conversationId)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></button>
              : item.ask
                ? <button key={item.label} type="button" className={action} onClick={() => askBria(item.ask)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></button>
                : item.to && (item.external || /^https?:\/\//.test(item.to))
                  ? <a key={item.label} href={item.to} target="_blank" rel="noopener noreferrer" className={action}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></a>
                  : item.to ? <Link key={item.label} to={item.to} onClick={(event) => { event.preventDefault(); navigateFrom(item.to); }} className={action}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></Link> : null)}
          </div>
        </div>
        <button type="button" onClick={dismiss} disabled={busy} aria-label="Ocultar por hoy" title="Ocultar por hoy" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
