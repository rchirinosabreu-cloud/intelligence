import React, { useEffect, useRef, useState } from 'react';
import { Check, Mic, MicOff, Settings, X } from '@/components/ui/icons';
import { VOICE_SAMPLE } from '@/lib/briaVoice';
import { requestVoiceAudio, requestVoices } from '@/lib/briaVoiceRequest';
import { useBriaDictation } from './useBriaDictation';

// Hablar con Bria (Rodny, 20 de noviembre de 2026: «quiero darle una voz a Bria y poder tenerla así, hablando con
// ella»). Una pantalla de voz sobre el chat: Bria escucha, piensa con su cerebro de siempre y responde en voz alta con
// ElevenLabs. Manos libres: cuando la persona calla, su turno se cierra solo. Todo lo dicho queda escrito en el chat.
// Fases: `listening` (te escucho) → `thinking` (Bria responde) → `speaking` (lo dice) → `listening`. Con el micrófono
// en pausa nada se graba. Si la voz falla o se acabó el tope del día, la respuesta queda escrita y se sigue escuchando.
export const VOICE_STATUS = { listening: 'Te escucho…', hearing: 'Te escucho…', transcribing: 'Entendiendo lo que dijiste…', thinking: 'Bria está pensando…', speaking: 'Bria está hablando', paused: 'Micrófono en pausa' };
// La esfera (Rodny, 20 de noviembre de 2026: «cuando es voz me gusta ese redondito con degradado»): crece con la voz
// de quien habla, gira rápido mientras Bria piensa y respira mientras habla. `orbScale` va de 1 a 1,14.
export const orbScale = (levels = []) => 1 + Math.min(1, Math.max(0, ...levels.slice(-3).map(Number).filter(Number.isFinite))) * 0.14;
const TRIAL_KEY = 'bria.voice.trial';
const readTrial = () => { try { const saved = JSON.parse(globalThis.localStorage?.getItem(TRIAL_KEY) || 'null'); return saved && typeof saved.id === 'string' ? saved : null; } catch { return null; } };
const writeTrial = (voice) => { try { if (voice) globalThis.localStorage?.setItem(TRIAL_KEY, JSON.stringify({ id: voice.id, name: voice.name })); else globalThis.localStorage?.removeItem(TRIAL_KEY); } catch { /* sin almacenamiento, la elección dura esta sesión */ } };
export const voiceTraits = (voice) => [voice.accent, voice.style, voice.age].filter(Boolean).join(' · ');
/** La última respuesta de Bria que todavía no se ha dicho, o null. */
export const replyToSpeak = (chat, spokenId) => { const last = chat?.turns?.at(-1); return last?.role === 'assistant' && last.id !== 'pending' && last.id !== spokenId && String(last.text || '').trim() ? last : null; };

export default function BriaVoiceMode({ chat, busy, request, send, audio, onClose, canChoose = false, teamVoice = null, speak = requestVoiceAudio, listVoices = requestVoices }) {
  const [phase, setPhase] = useState('listening'), [paused, setPaused] = useState(false), [notice, setNotice] = useState(''), [heard, setHeard] = useState('');
  // Quien administra puede oír las voces de la cuenta y conversar con la que marque; su elección vive en su navegador.
  const [trial, setTrial] = useState(() => (canChoose ? readTrial() : null)), [picking, setPicking] = useState(canChoose && !teamVoice && !readTrial());
  const [voices, setVoices] = useState(null), [voicesError, setVoicesError] = useState(''), [sampling, setSampling] = useState('');
  const spoken = useRef(chat?.turns?.at(-1)?.role === 'assistant' ? chat.turns.at(-1).id : null), player = useRef(audio || null), url = useRef(''), fetching = useRef(null), failures = useRef(0), alive = useRef(true);
  const { voice, levels, preview, start, cancel } = useBriaDictation({
    request, handsFree: true,
    onText: (text) => { const said = String(text || '').trim(); if (!said) return; failures.current = 0; setHeard(said); setNotice(''); setPhase('thinking'); send(said); },
    onError: (message) => { if (!message) return; failures.current += 1; if (/micrófono|navegador/i.test(message) || failures.current >= 3) { setPaused(true); setNotice(message); } },
    onIdle: () => { setPaused(true); setNotice('Pausé el micrófono porque no escuché nada. Tócalo para seguir.'); }
  });
  const stopAudio = () => { fetching.current?.abort(); fetching.current = null; const element = player.current; if (element) { element.onended = null; element.onerror = null; element.pause(); } if (url.current) { URL.revokeObjectURL(url.current); url.current = ''; } };
  /** Pide el audio y lo reproduce; `done` corre al terminar o si falla. */
  const play = (text, voiceId, done, failed) => {
    const control = new AbortController(); fetching.current = control;
    speak(text, { signal: control.signal, voiceId }).then((blob) => {
      if (!alive.current || control.signal.aborted) return undefined;
      const element = player.current; url.current = URL.createObjectURL(blob);
      element.onended = done; element.onerror = done; element.src = url.current;
      return element.play();
    }).catch((failure) => { if (!alive.current || control.signal.aborted) return; failed?.(failure); done(); });
  };
  useEffect(() => { alive.current = true; if (!player.current) player.current = new Audio(); return () => { alive.current = false; stopAudio(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Escuchar: mientras sea su turno, el micrófono no esté en pausa y no se estén eligiendo voces, la grabación arranca sola.
  useEffect(() => { if (phase === 'listening' && !paused && !picking && voice === 'idle') start(); }, [phase, paused, picking, voice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Responder: cuando Bria termina de escribir, lo dice. Si no hubo respuesta nueva (falló), vuelve a escuchar.
  useEffect(() => {
    if (phase !== 'thinking' || busy) return;
    const reply = replyToSpeak(chat, spoken.current);
    if (!reply) { setPhase('listening'); return; }
    spoken.current = reply.id; setPhase('speaking');
    play(reply.text, trial?.id, () => { if (alive.current) setPhase('listening'); }, (failure) => setNotice(failure?.code === 'VOICE_DAILY_LIMIT' ? failure.message : 'No pude decirlo en voz alta. La respuesta quedó escrita en el chat.'));
  }, [phase, busy, chat?.turns?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Elegir voz: al abrir la lista se deja de grabar y se traen las voces de la cuenta una sola vez.
  useEffect(() => {
    if (!picking) return;
    cancel();
    if (voices) return;
    let live = true;
    listVoices().then((data) => { if (live) setVoices(Array.isArray(data?.voices) ? data.voices : []); }).catch((failure) => { if (live) setVoicesError(failure?.message || 'No se pudieron traer las voces.'); });
    return () => { live = false; };
  }, [picking]); // eslint-disable-line react-hooks/exhaustive-deps
  const sample = (option) => { stopAudio(); if (sampling === option.id) { setSampling(''); return; } setVoicesError(''); setSampling(option.id); play(VOICE_SAMPLE, option.id, () => { if (alive.current) setSampling(''); }, (failure) => setVoicesError(failure?.message || 'No se pudo oír esta voz.')); };
  const choose = (option) => { const next = option && option.id !== teamVoice ? option : null; writeTrial(next); setTrial(next); };
  const closePicker = () => { stopAudio(); setSampling(''); setPicking(false); };
  const togglePause = () => { if (paused) { failures.current = 0; setNotice(''); setPaused(false); if (phase !== 'thinking' && phase !== 'speaking') setPhase('listening'); } else { cancel(); setPaused(true); } };
  const interrupt = () => { if (phase !== 'speaking') return; stopAudio(); setPhase('listening'); };
  const close = () => { cancel(); stopAudio(); onClose?.(); };
  const shown = paused && phase !== 'thinking' && phase !== 'speaking' ? 'paused' : phase === 'listening' && voice === 'transcribing' ? 'transcribing' : phase;
  const said = shown === 'listening' || shown === 'transcribing' ? preview : heard;
  const current = trial?.id || teamVoice;
  const control = 'group flex h-14 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none';
  const disc = 'flex h-12 w-12 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-bria-cyan group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-bria-night';
  return (
    <div data-bria-voice data-bria-voice-phase={shown} role="dialog" aria-label="Hablar con Bria" className="absolute inset-0 z-20 flex flex-col bg-white text-bria-night dark:bg-bria-night dark:text-white">
      {canChoose && <button type="button" data-bria-voice-pick onClick={() => setPicking(true)} className="absolute right-3 top-3 z-10 flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-bria-muted hover:bg-bria-night/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:text-zinc-300 dark:hover:bg-white/10"><Settings className="h-4 w-4" />{trial?.name ? `Voz: ${trial.name}` : 'Elegir voz'}</button>}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3vh,2rem)] overflow-y-auto px-6 pt-14 text-center">
        <button type="button" data-bria-orb onClick={interrupt} disabled={phase !== 'speaking'} aria-label={phase === 'speaking' ? 'Interrumpir a Bria' : 'Bria'} title={phase === 'speaking' ? 'Toca para interrumpir' : undefined} className="relative aspect-square w-[clamp(7rem,34vh,15rem)] shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan focus-visible:ring-offset-4 dark:focus-visible:ring-offset-bria-night">
          <span aria-hidden="true" className={`absolute inset-[-14%] rounded-full bg-[radial-gradient(circle,rgba(43,193,175,0.45),rgba(20,174,188,0)_70%)] blur-xl transition-opacity duration-500 ${shown === 'paused' ? 'opacity-20' : shown === 'speaking' ? 'opacity-100' : 'opacity-70'}`} />
          <span aria-hidden="true" className={`absolute inset-0 block transition-transform duration-150 ease-out ${shown === 'speaking' ? 'animate-bria-orb-breathe' : ''}`} style={shown === 'listening' ? { transform: `scale(${orbScale(levels).toFixed(3)})` } : undefined}>
            <span className={`absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_32%_24%,#F4FFF9_0%,#B9F3D0_16%,#72DD9B_36%,#2BC1AF_60%,#14AEBC_82%,#0B8FA6_100%)] shadow-[inset_0_-18px_40px_rgba(6,95,110,0.35),0_18px_50px_-18px_rgba(20,174,188,0.6)] transition-[filter] duration-500 ${shown === 'paused' ? 'saturate-[0.35]' : ''}`}>
              <span className={`absolute inset-[-30%] bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_32%),radial-gradient(circle_at_25%_75%,rgba(114,221,155,0.9)_0%,rgba(114,221,155,0)_38%),radial-gradient(circle_at_80%_80%,rgba(11,143,166,0.8)_0%,rgba(11,143,166,0)_40%)] blur-md motion-reduce:animate-none ${shown === 'paused' ? '' : shown === 'thinking' || shown === 'transcribing' ? 'animate-bria-orb-drift-fast' : 'animate-bria-orb-drift'}`} />
            </span>
          </span>
        </button>
        <p role="status" aria-live="polite" className="font-bria text-xl font-bold [@media(max-height:560px)]:text-lg">{VOICE_STATUS[shown]}</p>
        {said && <p data-bria-voice-heard className="line-clamp-3 max-w-md text-base leading-6 text-bria-muted/80 dark:text-zinc-400">{said}</p>}
        {notice && <p role="alert" className="max-w-md text-sm leading-6 text-destructive">{notice}</p>}
      </div>
      <div className="relative flex shrink-0 items-center justify-center gap-6 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={togglePause} aria-pressed={paused} aria-label={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} title={paused ? 'Activar el micrófono' : 'Pausar el micrófono'} className={control}><span className={`${disc} ${paused ? 'bg-bria-night text-white dark:bg-white dark:text-bria-night' : 'bg-bria-mist text-bria-night dark:bg-white/10 dark:text-white'}`}>{paused ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</span></button>
        <button type="button" onClick={close} aria-label="Cerrar la voz" title="Cerrar la voz" className={control}><span className={`${disc} bg-bria-night text-white dark:bg-white dark:text-bria-night`}><X className="h-5 w-5" /></span></button>
      </div>
      {picking && <div data-bria-voice-picker role="dialog" aria-label="Elegir la voz de Bria" className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-bria-night">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3"><h2 className="font-bria text-lg font-bold">La voz de Bria</h2><button type="button" onClick={closePicker} className="min-h-11 rounded-full bg-bria-night px-5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan focus-visible:ring-offset-2 dark:bg-white dark:text-bria-night dark:focus-visible:ring-offset-bria-night">Listo</button></div>
        <p className="shrink-0 px-4 pb-3 text-sm leading-6 text-bria-muted dark:text-zinc-400">Toca «Oír» para escucharla decir una frase de Bria. La que marques queda para ti en este navegador, para probarla conversando.</p>
        {voicesError && <p role="alert" className="shrink-0 px-4 pb-2 text-sm leading-6 text-destructive">{voicesError}</p>}
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!voices && !voicesError && <li className="px-2 py-3 text-sm text-bria-muted dark:text-zinc-400">Trayendo las voces…</li>}
          {voices?.length === 0 && <li className="px-2 py-3 text-sm text-bria-muted dark:text-zinc-400">La cuenta de ElevenLabs no tiene voces todavía.</li>}
          {voices?.map(option => <li key={option.id} className={`flex items-center gap-2 rounded-2xl px-2 py-1.5 ${current === option.id ? 'bg-bria-mist/70 dark:bg-white/10' : ''}`}>
            <div className="min-w-0 flex-1"><p className="truncate text-base font-medium">{option.name}{option.id === teamVoice && <span className="ml-2 text-xs font-normal text-bria-muted dark:text-zinc-400">la del equipo</span>}</p>{(voiceTraits(option) || option.about) && <p className="line-clamp-2 text-sm leading-5 text-bria-muted dark:text-zinc-400">{voiceTraits(option) || option.about}</p>}</div>
            <button type="button" onClick={() => sample(option)} aria-label={sampling === option.id ? `Parar ${option.name}` : `Oír a ${option.name}`} className="min-h-11 shrink-0 rounded-full border border-bria-night/15 px-4 text-sm font-medium hover:bg-bria-night/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:border-white/20 dark:hover:bg-white/10">{sampling === option.id ? 'Parar' : 'Oír'}</button>
            <button type="button" onClick={() => choose(option)} aria-pressed={current === option.id} aria-label={`Usar la voz ${option.name}`} title="Usar esta voz" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan"><span className={`flex h-7 w-7 items-center justify-center rounded-full border ${current === option.id ? 'border-transparent bg-gradient-to-br from-[#00AC8A] to-[#009EB9] text-white' : 'border-bria-night/25 text-transparent dark:border-white/30'}`}><Check className="h-4 w-4" /></span></button>
          </li>)}
        </ul>
      </div>}
    </div>
  );
}
