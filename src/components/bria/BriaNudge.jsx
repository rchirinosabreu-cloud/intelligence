import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowUpRight, Activity } from '@/components/ui/icons';
import BriaPortrait from './BriaPortrait';
import { askBria, openBriaConversation, quickAskBria } from '@/lib/briaAsk';
import { requestBriaNudges } from '@/lib/briaNudgeRequest';
import { cn } from '@/lib/utils';

// «Bria se adelanta» (Rodny, 10 de octubre de 2026): un aviso discreto encima del botón de Bria, sin abrir el chat.
// Un hecho de la plataforma y una sugerencia; «Pedírselo a Bria» deja el mensaje escrito en el chat y la persona
// decide si lo manda. Se oculta por hoy con la X. Se refresca cada cinco minutos con la pestaña visible.
// Y la consulta rápida (Rodny, el mismo día: «hacerle una pregunta rápida a Bria, no necesariamente abriendo un chat
// nuevo … “Haz tu consulta” y el icono de pulso»): una caja de una línea siempre a mano; lo que la persona escribe ahí
// sí se envía, al chat que tenga abierto. Sin aviso, la tarjeta es solo esa caja con un recordatorio de Bria.
export const NUDGE_REFRESH_MS = 5 * 60 * 1000;
export const QUICK_ASK_REMINDERS = Object.freeze([
  'Recuerda que puedes consultarme algo de la plataforma.',
  'Si necesitas un dato de un cliente o una tarea, pregúntame aquí.',
  'Puedo buscarte una parrilla, un pendiente o un acceso; solo dime.'
]);

export default function BriaNudge({ userId, hidden = false, request = requestBriaNudges, refreshMs = NUDGE_REFRESH_MS, className }) {
  const [nudges, setNudges] = useState([]), [busy, setBusy] = useState(false), [question, setQuestion] = useState(''), mounted = useRef(true), input = useRef(null);
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
  if (hidden) return null;
  const dismiss = async () => {
    setBusy(true);
    try { await request('/dismiss', { method: 'POST', body: { key: nudge.key } }); if (mounted.current) setNudges(rows => rows.filter(row => row.key !== nudge.key)); }
    catch (failure) { console.error('[BriaNudge] No se pudo ocultar el aviso:', failure.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    if (quickAskBria(question)) setQuestion('');
  };
  // El recordatorio cambia con la persona, no con el reloj: nada aquí lee la hora.
  const reminder = QUICK_ASK_REMINDERS[Math.abs([...String(userId || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % QUICK_ASK_REMINDERS.length];
  const action = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan';
  return (
    <section role="status" aria-label="Aviso de Bria" data-bria-nudge={nudge?.kind || 'CONSULTA'} className={cn('brain-popover-surface fixed right-4 z-[49] w-[min(340px,calc(100vw-2rem))] rounded-2xl p-3 bottom-[calc(1rem+env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[calc(1rem+env(safe-area-inset-bottom)+6.75rem)]', className)}>
      {nudge ? (
        <div className="flex items-start gap-3 px-1 pt-1">
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
      ) : (
        <div className="flex items-center gap-2 px-1 pt-1">
          <BriaPortrait className="h-7 w-7 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300" data-bria-quick-reminder title={reminder}>{reminder}</p>
        </div>
      )}
      <form onSubmit={submit} className={cn('flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 pl-3 pr-1 dark:border-zinc-700 dark:bg-zinc-950', nudge ? 'mt-3' : 'mt-2')} data-bria-quick-ask>
        <input ref={input} type="text" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} aria-label="Haz tu consulta a Bria" placeholder="Haz tu consulta" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500" />
        <button type="submit" aria-label="Enviar consulta a Bria" title="Enviar consulta a Bria" disabled={!question.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-cyan-deep transition-colors hover:bg-brand-cyan/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan">
          <Activity className="h-[18px] w-[18px]" />
        </button>
      </form>
    </section>
  );
}
