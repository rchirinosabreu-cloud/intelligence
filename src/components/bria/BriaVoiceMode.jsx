import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X } from '@/components/ui/icons';
import { Bria3D } from '@/components/bria/BriaBrand';
import { waveBars } from '@/lib/briaComposer';
import { requestVoiceAudio } from '@/lib/briaVoiceRequest';
import { useBriaDictation } from './useBriaDictation';

// Hablar con Bria (Rodny, 20 de noviembre de 2026: «quiero darle una voz a Bria y poder tenerla así, hablando con
// ella»). Una pantalla de voz sobre el chat: Bria escucha, piensa con su cerebro de siempre y responde en voz alta con
// ElevenLabs. Manos libres: cuando la persona calla, su turno se cierra solo. Todo lo dicho queda escrito en el chat.
// Fases: `listening` (te escucho) → `thinking` (Bria responde) → `speaking` (lo dice) → `listening`. Con el micrófono
// en pausa nada se graba. Si la voz falla o se acabó el tope del día, la respuesta queda escrita y se sigue escuchando.
export const VOICE_STATUS = { listening: 'Te escucho…', hearing: 'Te escucho…', transcribing: 'Entendiendo lo que dijiste…', thinking: 'Bria está pensando…', speaking: 'Bria está hablando', paused: 'Micrófono en pausa' };
export const voiceMood = (phase) => (phase === 'thinking' ? 'pensando' : phase === 'speaking' ? 'feliz' : 'reposo');
/** La última respuesta de Bria que todavía no se ha dicho, o null. */
export const replyToSpeak = (chat, spokenId) => { const last = chat?.turns?.at(-1); return last?.role === 'assistant' && last.id !== 'pending' && last.id !== spokenId && String(last.text || '').trim() ? last : null; };

export default function BriaVoiceMode({ chat, busy, request, send, audio, onClose, speak = requestVoiceAudio }) {
  const [phase, setPhase] = useState('listening'), [paused, setPaused] = useState(false), [notice, setNotice] = useState(''), [heard, setHeard] = useState('');
  const spoken = useRef(chat?.turns?.at(-1)?.role === 'assistant' ? chat.turns.at(-1).id : null), player = useRef(audio || null), url = useRef(''), fetching = useRef(null), failures = useRef(0), alive = useRef(true);
  const { voice, levels, preview, start, cancel } = useBriaDictation({
    request, handsFree: true,
    onText: (text) => { const said = String(text || '').trim(); if (!said) return; failures.current = 0; setHeard(said); setNotice(''); setPhase('thinking'); send(said); },
    onError: (message) => { if (!message) return; failures.current += 1; if (/micrófono|navegador/i.test(message) || failures.current >= 3) { setPaused(true); setNotice(message); } },
    onIdle: () => { setPaused(true); setNotice('Pausé el micrófono porque no escuché nada. Tócalo para seguir.'); }
  });
  const stopAudio = () => { fetching.current?.abort(); fetching.current = null; const element = player.current; if (element) { element.onended = null; element.onerror = null; element.pause(); } if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; } };
  useEffect(() => { alive.current = true; if (!player.current) player.current = new Audio(); return () => { alive.current = false; stopAudio(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Escuchar: mientras sea su turno y el micrófono no esté en pausa, la grabación arranca sola.
  useEffect(() => { if (phase === 'listening' && !paused && voice === 'idle') start(); }, [phase, paused, voice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Responder: cuando Bria termina de escribir, lo dice. Si no hubo respuesta nueva (falló), vuelve a escuchar.
  useEffect(() => {
    if (phase !== 'thinking' || busy) return;
    const reply = replyToSpeak(chat, spoken.current);
    if (!reply) { setPhase('listening'); return; }
    spoken.current = reply.id; setPhase('speaking');
    const control = new AbortController(); fetching.current = control;
    const done = () => { if (alive.current) setPhase('listening'); };
    speak(reply.text, { signal: control.signal }).then((blob) => {
      if (!alive.current || control.signal.aborted) return undefined;
      const element = player.current; url.current = URL.createObjectURL(blob);
      element.onended = done; element.onerror = done; element.src = url.current;
      return element.play();
    }).catch((failure) => { if (!alive.current || control.signal.aborted) return; setNotice(failure?.code === 'VOICE_DAILY_LIMIT' ? failure.message : 'No pude decirlo en voz alta. La respuesta quedó escrita en el chat.'); done(); });
  }, [phase, busy, chat?.turns?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePause = () => { if (paused) { failures.current = 0; setNotice(''); setPaused(false); if (phase !== 'thinking' && phase !== 'speaking') setPhase('listening'); } else { cancel(); setPaused(true); } };
  const interrupt = () => { if (phase !== 'speaking') return; stopAudio(); setPhase('listening'); };
  const close = () => { cancel(); stopAudio(); onClose?.(); };
  const shown = paused && phase !== 'thinking' && phase !== 'speaking' ? 'paused' : phase === 'listening' && voice === 'transcribing' ? 'transcribing' : phase;
  const said = shown === 'listening' || shown === 'transcribing' ? preview : heard;
  const control = 'group flex h-14 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none';
  const disc = 'flex h-12 w-12 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-bria-cyan group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-bria-night';
  return (
    <div data-bria-voice data-bria-voice-phase={shown} role="dialog" aria-label="Hablar con Bria" className="absolute inset-0 z-20 flex flex-col bg-white text-bria-night dark:bg-bria-night dark:text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-bria-mist/70 to-transparent dark:from-bria-turquoise/15" aria-hidden="true" />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.5rem,2.5vh,1.5rem)] overflow-y-auto px-6 pt-6 text-center">
        <button type="button" onClick={interrupt} disabled={phase !== 'speaking'} aria-label={phase === 'speaking' ? 'Interrumpir a Bria' : 'Bria'} title={phase === 'speaking' ? 'Toca para interrumpir' : undefined} className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan">
          <span aria-hidden="true" className={`absolute inset-[-8%] rounded-full bg-gradient-to-br from-bria-mint/40 to-bria-cyan/30 blur-xl transition-opacity duration-500 ${shown === 'speaking' ? 'animate-pulse opacity-100' : shown === 'listening' ? 'opacity-70' : 'opacity-30'}`} />
          <Bria3D mood={voiceMood(shown)} className="relative w-[clamp(7rem,30vh,14rem)]" />
        </button>
        <p role="status" aria-live="polite" className="font-bria text-xl font-bold [@media(max-height:560px)]:text-lg">{VOICE_STATUS[shown]}</p>
        <div aria-hidden="true" className={`flex h-8 w-40 shrink-0 items-center justify-between transition-opacity ${shown === 'listening' ? 'opacity-100' : 'opacity-0'}`}>{waveBars(levels).map((height, index) => <span key={index} className="w-[3px] rounded-full bg-bria-turquoise transition-[height] duration-100 dark:bg-bria-mint" style={{ height: `${height}%` }} />)}</div>
        {said && <p data-bria-voice-heard className="line-clamp-3 max-w-md text-base leading-6 text-bria-muted/80 dark:text-zinc-400">{said}</p>}
        {notice && <p role="alert" className="max-w-md text-sm leading-6 text-bria-cyan-deep dark:text-bria-mint">{notice}</p>}
      </div>
      <div className="relative flex shrink-0 items-center justify-center gap-6 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={togglePause} aria-pressed={paused} aria-label={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} title={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} className={control}><span className={`${disc} ${paused ? 'bg-bria-night text-white dark:bg-white dark:text-bria-night' : 'bg-bria-mist text-bria-night dark:bg-white/10 dark:text-white'}`}>{paused ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</span></button>
        <button type="button" onClick={close} aria-label="Cerrar la voz" title="Cerrar la voz" className={control}><span className={`${disc} bg-bria-night text-white dark:bg-white dark:text-bria-night`}><X className="h-5 w-5" /></span></button>
      </div>
    </div>
  );
}
