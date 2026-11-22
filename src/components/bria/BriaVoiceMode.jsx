import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X } from '@/components/ui/icons';
import { VOICE_MAX_CHARS, VOICE_TAIL, nextSpeech, voiceFiller } from '@/lib/briaVoice';
import { requestVoiceAudio } from '@/lib/briaVoiceRequest';
import BriaVoiceOrb from './BriaVoiceOrb';
import { useBriaDictation } from './useBriaDictation';

// Hablar con Bria (Rodny, 20 de noviembre de 2026: «quiero darle una voz a Bria y poder tenerla así, hablando con
// ella»). Una pantalla de voz sobre el chat: Bria escucha, piensa con su cerebro de siempre y responde en voz alta con
// ElevenLabs. Manos libres: cuando la persona calla, su turno se cierra solo. Todo lo dicho queda escrito en el chat.
// Fases: `listening` (te escucho) → `thinking` (Bria responde) → `speaking` (lo dice) → `listening`. Con el micrófono
// en pausa nada se graba. En pantalla no hay rótulos de estado ni lo que se va dictando (Rodny, mismo día: «para eso
// están los gestos y movimientos»): lo cuenta el círculo, y el estado se dice solo a los lectores de pantalla.
// Interrumpir hablando (21 de noviembre de 2026): mientras Bria habla el micrófono sigue grabando; si la persona habla,
// Bria se calla y esa misma grabación es su turno. Si Bria termina sin que la interrumpan, esa grabación se descarta
// (solo tendría la voz de Bria) y se empieza a escuchar de cero. Tocar el círculo sigue interrumpiendo.
// Si la voz falla o se acabó el tope del día, la respuesta queda escrita y se sigue escuchando.
export const VOICE_STATUS = { listening: 'Te escucho…', hearing: 'Te escucho…', transcribing: 'Entendiendo lo que dijiste…', thinking: 'Bria está pensando…', speaking: 'Bria está hablando', paused: 'Micrófono en pausa' };
/** La última respuesta de Bria que todavía no se ha dicho, o null. */
export const replyToSpeak = (chat, spokenId) => { const last = chat?.turns?.at(-1); return last?.role === 'assistant' && last.id !== 'pending' && last.id !== spokenId && String(last.text || '').trim() ? last : null; };
/** Qué tan fuerte habla la persona ahora mismo, de 0 a 1, con las últimas medidas del micrófono. */
export const orbLevel = (levels = []) => Math.min(1, Math.max(0, ...levels.slice(-3).map(Number).filter(Number.isFinite)));
export default function BriaVoiceMode({ chat, busy, liveText = '', liveStatus = '', request, send, audio, onClose, silent = false, speak = requestVoiceAudio }) {
  const [phase, setPhase] = useState('listening'), [paused, setPaused] = useState(false), [notice, setNotice] = useState(silent ? 'Bria todavía no tiene voz elegida: te responde por escrito en el chat.' : '');
  const spoken = useRef(chat?.turns?.at(-1)?.role === 'assistant' ? chat.turns.at(-1).id : null), player = useRef(audio || null), url = useRef(''), failures = useRef(0), alive = useRef(true), turns = useRef(0);
  // Lo que Bria va diciendo de la respuesta en curso: hasta dónde del texto ya se pidió (`said`), los trozos en cola,
  // si uno suena ahora, si ya llegó el final, cuánto se ha dicho y si la persona la interrumpió (`muted`).
  const talk = useRef({ said: 0, seen: '', queue: [], playing: false, ended: false, total: 0, muted: false });
  const barged = useRef(false), before = useRef('listening'), held = useRef('');
  const deliver = (said) => { const last = chat?.turns?.at(-1); if (last?.role === 'assistant') spoken.current = last.id; failures.current = 0; if (!silent) setNotice(''); stopAudio(); talk.current = { said: 0, seen: '', queue: [], playing: false, ended: false, total: 0, muted: false }; setPhase('thinking'); send(said); };
  const { voice, levels, start, cancel } = useBriaDictation({
    request, handsFree: true,
    // Si la interrumpieron mientras todavía escribía, lo dicho espera a que termine: el chat no recibe otro mensaje antes.
    onText: (text) => { const said = String(text || '').trim(); if (!said) return; if (busy) { held.current = said; return; } deliver(said); },
    onSpeech: () => { if (phase !== 'speaking') return; barged.current = true; stopAudio(); talk.current.muted = true; talk.current.ended = true; setPhase('listening'); },
    speechGate: () => phase === 'speaking',
    onError: (message) => { if (!message) return; failures.current += 1; if (/micrófono|navegador/i.test(message) || failures.current >= 3) { setPaused(true); setNotice(message); } },
    onIdle: () => { if (phase === 'speaking' || phase === 'thinking') return; setPaused(true); setNotice('Pausé el micrófono porque no escuché nada. Tócalo para seguir.'); }
  });
  function stopAudio() { const state = talk.current; state.queue.forEach(item => item.control.abort()); state.queue = []; state.playing = false; const element = player.current; if (element) { element.onended = null; element.onerror = null; element.pause(); } if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; } }
  /** Reproduce la cola en orden. Cuando se vacía y ya llegó el final de la respuesta, vuelve a escuchar. */
  const pump = () => {
    const state = talk.current;
    if (!alive.current || state.playing) return;
    const item = state.queue.shift();
    if (!item) { if (state.ended) setPhase('listening'); return; }
    state.playing = true;
    const next = () => { if (talk.current !== state || !alive.current) return; state.playing = false; pump(); };
    item.audio.then((blob) => {
      if (talk.current !== state || !alive.current || item.control.signal.aborted) return undefined;
      if (url.current) URL.revokeObjectURL(url.current);
      const element = player.current; url.current = URL.createObjectURL(blob);
      element.onended = next; element.onerror = next; element.src = url.current; setPhase('speaking');
      return element.play();
    }).catch((failure) => { if (talk.current !== state || !alive.current || item.control.signal.aborted) return; if (item.aside) { next(); return; } setNotice(failure?.code === 'VOICE_DAILY_LIMIT' ? failure.message : 'No pude decirlo en voz alta. La respuesta quedó escrita en el chat.'); next(); });
  };
  /** Pide ya el audio de un trozo (los pedidos van en paralelo) y lo deja en la cola para sonar en su turno. */
  const say = (text) => {
    const state = talk.current, room = VOICE_MAX_CHARS - state.total;
    if (state.muted || room <= 0 || !String(text).trim()) return;
    const piece = text.length > room ? VOICE_TAIL : text; // lo largo queda escrito; se avisa una vez
    state.total += text.length > room ? VOICE_MAX_CHARS : text.length;
    const control = new AbortController(), sound = speak(piece, { signal: control.signal });
    sound.catch(() => {}); // el fallo se atiende cuando le toca sonar
    state.queue.push({ audio: sound, control }); pump();
  };
  useEffect(() => { alive.current = true; if (!player.current) player.current = new Audio(); return () => { alive.current = false; stopAudio(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Escuchar: mientras sea su turno, el micrófono no esté en pausa y Bria no esté escribiendo, la grabación arranca sola.
  // Si la interrumpieron mientras escribía, se espera a que termine: el chat no recibe otro mensaje hasta entonces.
  useEffect(() => { if (!paused && voice === 'idle' && ((phase === 'listening' && !busy && !held.current) || (phase === 'speaking' && !silent))) start(); }, [phase, paused, busy, voice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bria dejó de hablar sin que la interrumpieran: lo grabado mientras hablaba no es de la persona y se descarta.
  useEffect(() => { if (before.current === 'speaking' && phase !== 'speaking' && !barged.current) cancel(); if (phase === 'speaking') barged.current = false; before.current = phase; }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lo que la persona dijo al interrumpir se envía apenas Bria termina de escribir.
  useEffect(() => { if (busy || !held.current) return; const said = held.current; held.current = ''; deliver(said); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busy || !talk.current.muted) return; const last = chat?.turns?.at(-1); if (last?.role === 'assistant') spoken.current = last.id; }, [busy, chat?.turns?.length]); // lo interrumpido no se repite
  // Hablar mientras escribe: cada frase completa del texto que va llegando se manda a decir sin esperar el resto.
  useEffect(() => {
    const state = talk.current;
    if (silent || !busy || state.ended || (phase !== 'thinking' && phase !== 'speaking')) return;
    if (liveText.length < state.said || !liveText.startsWith(state.seen.slice(0, state.said))) { stopAudio(); state.said = 0; state.total = 0; if (phase === 'speaking') setPhase('thinking'); } // Bria borró lo escrito: se empieza de nuevo
    state.seen = liveText;
    for (let piece = nextSpeech(liveText, state.said, { first: state.total === 0 }); piece; piece = nextSpeech(liveText, state.said, { first: false })) { state.said = piece.to; say(piece.text); }
  }, [liveText, busy, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si Bria va a consultar algo antes de haber dicho nada, avisa con una frase corta en vez de quedarse callada.
  useEffect(() => {
    const state = talk.current;
    if (silent || !busy || !liveStatus || state.ended || state.muted || state.aside || state.total > 0 || phase !== 'thinking') return;
    state.aside = true; turns.current += 1;
    const control = new AbortController(), sound = speak(voiceFiller(turns.current), { signal: control.signal });
    sound.catch(() => {});
    state.queue.push({ audio: sound, control, aside: true }); pump();
  }, [liveStatus, busy, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // El final: cuando Bria termina de escribir se dice lo que faltaba. Si no hubo respuesta nueva o aún no hay voz, vuelve a escuchar.
  useEffect(() => {
    const state = talk.current;
    if (busy || state.ended || (phase !== 'thinking' && phase !== 'speaking')) return;
    const reply = replyToSpeak(chat, spoken.current);
    if (!reply || silent) { if (reply) spoken.current = reply.id; state.ended = true; if (!state.playing && !state.queue.length) setPhase('listening'); return; }
    spoken.current = reply.id; state.ended = true;
    // Lo guardado manda: si coincide con lo que ya se fue diciendo, se dice el resto; si no se había dicho nada, todo.
    const same = state.said > 0 && reply.text.slice(0, state.said) === state.seen.slice(0, state.said);
    const rest = state.said === 0 ? nextSpeech(reply.text, 0, { final: true }) : same ? nextSpeech(reply.text, state.said, { final: true }) : null;
    if (rest) say(rest.text);
    pump();
  }, [phase, busy, chat?.turns?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePause = () => { if (paused) { failures.current = 0; setNotice(''); setPaused(false); if (phase !== 'thinking' && phase !== 'speaking') setPhase('listening'); } else { cancel(); setPaused(true); } };
  const interrupt = () => { if (phase !== 'speaking') return; stopAudio(); talk.current.muted = true; talk.current.ended = true; setPhase('listening'); };
  const close = () => { cancel(); stopAudio(); onClose?.(); };
  const shown = paused && phase !== 'thinking' && phase !== 'speaking' ? 'paused' : phase === 'listening' && voice === 'transcribing' ? 'transcribing' : phase;
  const control = 'group flex h-14 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none';
  const disc = 'flex h-12 w-12 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-bria-cyan group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-bria-night';
  return (
    <div data-bria-voice data-bria-voice-phase={shown} role="dialog" aria-label="Hablar con Bria" className="absolute inset-0 z-20 flex flex-col bg-white text-bria-night dark:bg-bria-night dark:text-white">
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 pt-6 text-center">
        <button type="button" data-bria-orb onClick={interrupt} disabled={phase !== 'speaking'} aria-label={phase === 'speaking' ? 'Interrumpir a Bria' : 'Bria'} title={phase === 'speaking' ? 'Toca para interrumpir' : undefined} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan focus-visible:ring-offset-8 dark:focus-visible:ring-offset-bria-night">
          <BriaVoiceOrb state={shown === 'transcribing' ? 'thinking' : shown} level={orbLevel(levels)} className="w-[clamp(5.5rem,22vh,9.5rem)]" />
        </button>
        <p role="status" aria-live="polite" className="sr-only">{VOICE_STATUS[shown]}</p>
        {notice && <p role="alert" className="max-w-xs text-sm leading-6 text-destructive">{notice}</p>}
      </div>
      <div className="relative flex shrink-0 items-center justify-center gap-6 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={togglePause} aria-pressed={paused} aria-label={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} title={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} className={control}><span className={`${disc} ${paused ? 'bg-bria-night text-white dark:bg-white dark:text-bria-night' : 'bg-bria-mist text-bria-night dark:bg-white/10 dark:text-white'}`}>{paused ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</span></button>
        <button type="button" onClick={close} aria-label="Cerrar la voz" title="Cerrar la voz" className={control}><span className={`${disc} bg-bria-night text-white dark:bg-white dark:text-bria-night`}><X className="h-5 w-5" /></span></button>
      </div>
    </div>
  );
}
