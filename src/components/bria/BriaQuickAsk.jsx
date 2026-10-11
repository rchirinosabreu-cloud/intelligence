import React, { useEffect, useRef, useState } from 'react';
import { Activity, Mic, X } from '@/components/ui/icons';
import BriaPortrait from './BriaPortrait';
import { quickAskBria } from '@/lib/briaAsk';
import { requestBriaChat } from '@/lib/briaChatRequest';
import { cn } from '@/lib/utils';
import { formatDictationClock, useBriaDictation } from './useBriaDictation';

// La consulta rápida desde la mascota (Rodny, 11 de octubre de 2026: «cuando poso el cursor sobre ella, aparecen dos
// iconos … la barra de consulta escribiendo o enviando un audio, ninguno es un chat nuevo»). Se abre desde el lápiz
// o el micrófono que aparecen junto a Bria, nunca sola: la caja permanente «estorbaba». Lo que la persona escribe o
// dicta aquí sí se envía, al chat que tenga abierto (`quickAskBria`), porque lo escribió ella. Mientras está abierta
// avisa si se está escribiendo o grabando, y la mascota se inclina o se mece.
export const QUICK_ASK_REMINDERS = Object.freeze([
  'Recuerda que puedes consultarme algo de la plataforma.',
  'Si necesitas un dato de un cliente o una tarea, pregúntame aquí.',
  'Puedo buscarte una parrilla, un pendiente o un acceso; solo dime.'
]);

export default function BriaQuickAsk({ userId, mode = 'write', onClose, onTyping, onListening, request = requestBriaChat, className }) {
  const [question, setQuestion] = useState(''), [error, setError] = useState(''), [focused, setFocused] = useState(false), input = useRef(null);
  const { voice, seconds, retryAudio, start, stop, cancel, retry } = useBriaDictation({
    request,
    onText: text => { setQuestion(previous => [previous.trim(), text.trim()].filter(Boolean).join(' ')); input.current?.focus({ preventScroll: true }); },
    onError: setError
  });
  const listening = voice === 'recording' || voice === 'starting';
  useEffect(() => { onListening?.(listening); return () => onListening?.(false); }, [listening]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onTyping?.(focused || question.trim().length > 0 || voice === 'transcribing'); return () => onTyping?.(false); }, [focused, question, voice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Abierta desde el micrófono, empieza a grabar de una vez; desde el lápiz, deja el cursor listo.
  useEffect(() => { if (mode === 'dictate') start(); else input.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = event => {
    event.preventDefault();
    if (voice !== 'idle') return;
    if (quickAskBria(question)) { setQuestion(''); onClose(); }
  };
  const close = () => { cancel(); onClose(); };
  // El recordatorio cambia con la persona, no con el reloj: nada aquí lee la hora.
  const reminder = QUICK_ASK_REMINDERS[Math.abs([...String(userId || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % QUICK_ASK_REMINDERS.length];
  const icon = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40';
  return (
    <section role="dialog" aria-label="Consulta rápida a Bria" data-bria-quick-ask onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }} className={cn('brain-popover-surface fixed right-4 z-[49] w-[min(340px,calc(100vw-2rem))] rounded-2xl p-3 bottom-[calc(1rem+env(safe-area-inset-bottom)+5.75rem)] sm:bottom-[calc(1rem+env(safe-area-inset-bottom)+6.75rem)]', className)}>
      <div className="flex items-center gap-2 pl-1">
        <BriaPortrait className="h-7 w-7 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-600 dark:text-zinc-300" data-bria-quick-reminder title={reminder}>{reminder}</p>
        <button type="button" onClick={close} aria-label="Cerrar la consulta" title="Cerrar la consulta" className={cn(icon, 'text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200')}><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={submit} className="mt-2 flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 pl-3 pr-1 focus-within:border-brand-cyan/60 dark:border-zinc-700 dark:bg-zinc-950">
        <input ref={input} type="text" value={question} onChange={event => setQuestion(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={1000} aria-label="Haz tu consulta a Bria" placeholder="Haz tu consulta" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500" />
        <button type="button" aria-label={voice === 'recording' ? 'Terminar dictado' : 'Dictar la consulta'} title={voice === 'recording' ? 'Terminar dictado' : 'Dictar la consulta'} aria-pressed={voice === 'recording'} disabled={['starting', 'transcribing'].includes(voice)} onClick={voice === 'recording' ? stop : start} className={cn(icon, voice === 'recording' ? 'text-brand-cyan-deep dark:text-brand-cyan' : 'text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200')}><Mic className={cn('h-[18px] w-[18px]', voice === 'recording' && 'animate-pulse')} /></button>
        <button type="submit" aria-label="Enviar consulta a Bria" title="Enviar consulta a Bria" disabled={!question.trim() || voice !== 'idle'} className={cn(icon, 'text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan')}><Activity className="h-[18px] w-[18px]" /></button>
      </form>
      {(voice !== 'idle' || error || retryAudio) && (
        <div className="mt-2 flex min-h-5 items-center gap-2 pl-1 text-xs">
          {voice === 'recording' && <><span role="status" className="text-brand-cyan-deep dark:text-brand-cyan">Grabando {formatDictationClock(seconds)}</span><button type="button" onClick={cancel} className="text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400">Cancelar</button></>}
          {['starting', 'transcribing'].includes(voice) && <span role="status" className="text-brand-cyan-deep dark:text-brand-cyan">{voice === 'starting' ? 'Abriendo micrófono…' : 'Transcribiendo…'}</span>}
          {voice === 'idle' && error && <span role="alert" className="min-w-0 flex-1 text-destructive">{error}</span>}
          {voice === 'idle' && retryAudio && <button type="button" onClick={retry} className="shrink-0 text-brand-cyan-deep dark:text-brand-cyan">Reintentar dictado</button>}
        </div>
      )}
    </section>
  );
}
