import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUpRight, CheckCircle } from '@/components/ui/icons';
import { BriaIsotipo } from './BriaBrand';
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

/** El bloque de la liga dentro del aviso (3 de noviembre de 2026): los puntos del mes, lo que subió hoy y la posición. Sin niveles, sin barras, sin reloj. */
function NudgeProgress({ progress }) {
  const delta = typeof progress.delta === 'number' ? progress.delta : null;
  return (
    <div data-bria-nudge-progress className="mt-3 flex items-center gap-3 rounded-2xl border border-bria-line bg-bria-mist/40 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
      <div className="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-bria-gold-soft px-2 text-bria-gold-ink dark:bg-bria-gold/15 dark:text-bria-gold" aria-hidden="true">
        <span className="text-base font-semibold leading-none tabular-nums">{progress.score ?? '–'}</span>
        <span className="mt-0.5 text-xs font-medium">pts</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-bria-night dark:text-white">
          {progress.position || 'Liga del mes'}
          {delta !== null && (
            <span data-bria-nudge-delta className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', delta >= 0 ? 'bg-brand-green/15 text-brand-green-deep dark:text-brand-green' : 'bg-brand-coral/15 text-brand-coral-deep dark:text-brand-coral')}>
              {delta >= 0 ? `+${delta}` : delta} hoy
            </span>
          )}
        </p>
        {progress.next && <p className="text-sm leading-5 text-bria-muted dark:text-zinc-300">{progress.next}</p>}
        {progress.detail && <p className="text-xs leading-4 text-bria-muted dark:text-zinc-400">{progress.detail}</p>}
      </div>
    </div>
  );
}

export default function BriaNudge({ userId, hidden = false, request = requestBriaNudges, decide = decideAccess, refreshMs = NUDGE_REFRESH_MS, className }) {
  const [nudges, setNudges] = useState([]), [busy, setBusy] = useState(false), mounted = useRef(true);
  // El borrador listo de un correo (20 de noviembre de 2026) se despliega en la misma tarjeta; guarda de qué aviso es,
  // así el aviso siguiente nunca aparece con el borrador del anterior abierto.
  const [draftFor, setDraftFor] = useState(null);
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
  // La marca de Bria (Rodny, 18 de noviembre de 2026): el isotipo firma el aviso, sin franja de color arriba; en
  // oscuro, el azul noche de la guía. La primera acción es el botón principal; las demás, secundarias.
  const primary = 'inline-flex min-h-11 items-center gap-1 rounded-xl bg-bria-night px-3.5 text-sm font-semibold text-white hover:bg-bria-night/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:bg-white dark:text-bria-night dark:hover:bg-white/90';
  const secondary = 'inline-flex min-h-11 items-center gap-1 rounded-xl border border-bria-line bg-white px-3 text-sm font-medium text-bria-night hover:bg-bria-mist/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10';
  const kind = (index) => (index === 0 ? primary : secondary);
  const draft = (nudge.actions || []).find((item) => item.draft?.reply)?.draft || null;
  const draftOpen = Boolean(draft) && draftFor === nudge.key;
  // Bria nunca envía correos: la persona copia la respuesta, la pega en su correo y la revisa antes de mandarla.
  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(draft.reply); toast.success('Respuesta copiada. Revísala en tu correo antes de enviarla.'); }
    catch (failure) { console.error('[BriaNudge] No se pudo copiar el borrador:', failure.message); toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.'); }
  };
  return (
    <section role="status" aria-label="Aviso de Bria" data-bria-nudge={nudge.kind} className={cn('fixed right-4 z-[49] w-[min(340px,calc(100vw-2rem))] rounded-[20px] border border-bria-night/5 bg-white pb-4 text-bria-night shadow-[0_18px_36px_-20px_rgba(9,32,56,0.45)] dark:border-white/10 dark:bg-bria-night dark:text-white dark:shadow-[0_18px_36px_-18px_rgba(0,0,0,0.7)] bottom-[calc(1rem+env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[calc(1rem+env(safe-area-inset-bottom)+6.75rem)]', className)}>
      <div className="flex items-center gap-2.5 pl-4 pr-1.5 pt-2">
        <BriaIsotipo className="h-[30px] shrink-0" />
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-bria-muted dark:text-zinc-300">
          <span><span className="font-bria font-bold text-bria-night dark:text-white">Bria</span> se adelanta</span>
          {nudges.length > 1 && <span className="text-xs text-bria-muted dark:text-zinc-400" data-bria-nudge-count>1 de {nudges.length}</span>}
        </p>
        <button type="button" onClick={dismiss} disabled={busy} aria-label="Ocultar por hoy" title="Ocultar por hoy" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-bria-muted transition-colors hover:bg-bria-night/5 hover:text-bria-night disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4">
        <h3 className="text-base font-semibold leading-6 text-bria-night dark:text-white">{nudge.title}</h3>
        {nudge.body && <p className="mt-1 text-sm leading-6 text-bria-ink dark:text-zinc-200">{nudge.body}</p>}
        {/* El seguimiento (14 de octubre de 2026): el desenlace del aviso en verde, o «sigue igual» en gris, escritos por el pulso. */}
        {nudge.resolution && <p data-bria-nudge-resolution className="mt-1.5 flex items-start gap-1.5 text-sm leading-5 text-status-positive-fg"><CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />{nudge.resolution}</p>}
        {!nudge.resolution && nudge.followUp && <p data-bria-nudge-follow-up className="mt-1.5 text-sm leading-5 text-bria-muted dark:text-zinc-400">{nudge.followUp}</p>}
        {/* La liga del buen uso (27 de octubre de 2026): el puntaje del mes, lo que se movió hoy y la posición. */}
        {nudge.progress && <NudgeProgress progress={nudge.progress} />}
        {/* Los botones los decide la plataforma según el hecho: a dónde ir y qué pedirle a Bria (queda escrito, la persona lo envía). */}
        <div className="mt-3 flex flex-wrap items-center gap-2" data-bria-nudge-actions>
          {(nudge.actions || []).map((item, index) => item.draft
            ? <button key={item.label} type="button" aria-expanded={draftOpen} data-bria-nudge-draft-toggle className={kind(index)} onClick={() => setDraftFor(draftOpen ? null : nudge.key)}>{draftOpen ? 'Ocultar borrador' : item.label}</button>
            : item.decide
            ? <button key={item.label} type="button" disabled={busy} data-bria-nudge-decision={item.decide.decision} className={cn(item.decide.decision === 'APPROVE' ? primary : secondary, 'disabled:opacity-50')} onClick={() => answer(item.decide)}>{item.label}</button>
            : item.href
            // Abrir un módulo recién concedido recarga la página: el menú y las rutas leen el permiso nuevo.
            ? <a key={item.label} href={item.href} className={kind(index)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></a>
            : item.conversationId
            ? <button key={item.label} type="button" className={kind(index)} onClick={() => openBriaConversation(item.conversationId)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></button>
            : item.ask
              ? <button key={item.label} type="button" className={kind(index)} onClick={() => askBria(item.ask)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></button>
              : item.to && (item.external || /^https?:\/\//.test(item.to))
                ? <a key={item.label} href={item.to} target="_blank" rel="noopener noreferrer" className={kind(index)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></a>
                : item.to ? <Link key={item.label} to={item.to} onClick={(event) => { event.preventDefault(); navigateFrom(item.to); }} className={kind(index)}>{item.label}<ArrowUpRight className="h-3.5 w-3.5" /></Link> : null)}
        </div>
        {/* El borrador que Bria dejó listo: qué dice el correo y la respuesta propuesta, para copiar. Misma superficie que el bloque de la liga. */}
        {draftOpen && (
          <div data-bria-nudge-draft className="mt-3 rounded-2xl border border-bria-line bg-bria-mist/40 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
            {draft.summary && <p className="text-sm leading-5 text-bria-muted dark:text-zinc-300">{draft.summary}</p>}
            <p data-bria-nudge-draft-reply className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-bria-ink dark:text-zinc-200">{draft.reply}</p>
            <button type="button" onClick={copyDraft} className={cn(secondary, 'mt-2.5')}>Copiar respuesta</button>
          </div>
        )}
      </div>
    </section>
  );
}
