import React, { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, X } from '@/components/ui/icons';
import { BRIA_AUDIO_MAX_BYTES } from '@/lib/briaAttachments';

export default function BriaComposer({ value, onChange, files, onFiles, onAddFiles, disabled, visible, allowAttachments, onSend, onError, onVoiceBusy, inputRef, request }) {
  const picker = useRef(null), recording = useRef(null), mounted = useRef(true), active = useRef(visible), requestGeneration = useRef(0), timer = useRef(null);
  const [voice, setVoice] = useState('idle'), [seconds, setSeconds] = useState(0), [retryAudio, setRetryAudio] = useState(null);
  const changeVoice = status => { setVoice(status); onVoiceBusy(status !== 'idle'); };
  const cancel = () => {
    requestGeneration.current++; clearInterval(timer.current);
    const session = recording.current;
    if (session) { session.cancelled = true; if (session.recorder?.state === 'recording') session.recorder.stop(); session.stream?.getTracks().forEach(track => track.stop()); }
    recording.current = null; setRetryAudio(null);
    if (mounted.current) changeVoice('idle');
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); onVoiceBusy(false); };
  }, []);
  useEffect(() => { active.current = visible; if (!visible) cancel(); }, [visible]);
  const transcribe = async blob => {
    const generation = ++requestGeneration.current;
    changeVoice('transcribing'); onError('');
    try {
      if (!blob.size || blob.size > BRIA_AUDIO_MAX_BYTES) throw new Error('Graba un dictado de hasta 20 MB.');
      const body = new FormData(); body.append('audio', blob, blob.type.includes('mp4') ? 'dictado.mp4' : 'dictado.webm');
      const result = await request('/dictation', { method: 'POST', body });
      if (!mounted.current || !active.current || generation !== requestGeneration.current) return;
      onChange(previous => [previous.trim(), result.text].filter(Boolean).join('\n\n'));
      setRetryAudio(null); inputRef.current?.focus({ preventScroll: true });
    } catch (failure) {
      if (mounted.current && active.current && generation === requestGeneration.current) { setRetryAudio(blob); onError(failure.message); }
    } finally { if (mounted.current && generation === requestGeneration.current) changeVoice('idle'); }
  };
  const stop = () => { const session = recording.current; if (session?.recorder?.state === 'recording') session.recorder.stop(); };
  const start = async () => {
    if (voice !== 'idle' || disabled) return;
    onError(''); setRetryAudio(null); changeVoice('starting');
    const generation = ++requestGeneration.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador no permite grabar dictados.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || !active.current || generation !== requestGeneration.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recording.current = { stream };
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const session = { recorder, stream, chunks: [], bytes: 0, cancelled: false }; recording.current = session;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > BRIA_AUDIO_MAX_BYTES) { session.cancelled = true; stop(); onError('El dictado llegó al límite de 20 MB. Graba uno más corto.'); }
        else session.chunks.push(event.data);
      };
      recorder.onerror = () => { cancel(); onError('No se pudo grabar el dictado. Intenta de nuevo.'); };
      recorder.onstop = () => {
        clearInterval(session.timer); stream.getTracks().forEach(track => track.stop());
        if (recording.current !== session) return;
        recording.current = null;
        if (session.cancelled || !mounted.current || !active.current) { if (mounted.current) changeVoice('idle'); return; }
        transcribe(new Blob(session.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start(1000); setSeconds(0); changeVoice('recording');
      const started = Date.now(); session.timer = timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= 300) stop(); }, 1000);
    } catch (failure) {
      recording.current?.stream.getTracks().forEach(track => track.stop()); recording.current = null;
      if (mounted.current && generation === requestGeneration.current) { changeVoice('idle'); onError(['NotAllowedError', 'SecurityError'].includes(failure.name) ? 'Permite el micrófono en el navegador para dictar.' : failure.message); }
    }
  };
  const addFiles = event => {
    onAddFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };
  const blocked = disabled || voice !== 'idle', control = 'flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800';
  return <form className="mx-auto max-w-3xl rounded-3xl border border-zinc-200 bg-white p-3 focus-within:border-brand-cyan/60 dark:border-zinc-700 dark:bg-zinc-900" onSubmit={event => { event.preventDefault(); if (!blocked) onSend(); }}>
    {files.length > 0 && <ul aria-label="Archivos por enviar" className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">{files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="flex max-w-full items-center gap-1 rounded-xl bg-zinc-100 pl-3 text-xs dark:bg-zinc-800"><span className="truncate">{file.name}</span><button type="button" disabled={blocked} aria-label={`Quitar ${file.name}`} className={control} onClick={() => onFiles(files.filter((_, position) => position !== index))}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    <label htmlFor="bria-message" className="sr-only">Mensaje para Bria</label>
    <textarea id="bria-message" ref={inputRef} value={value} rows={2} enterKeyHint="send" maxLength={12000} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!blocked) onSend(); } }} placeholder="Conversa con Bria…" className="max-h-40 min-h-16 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500" />
    <div className="flex items-center gap-1">
      {allowAttachments && <><input ref={picker} type="file" multiple hidden aria-label="Archivos para Bria" onChange={addFiles} disabled={blocked} /><button type="button" title="Adjuntar archivos · hasta 5, 20 MB por archivo" aria-label="Adjuntar archivos" disabled={blocked} className={control} onClick={() => picker.current?.click()}><Paperclip className="h-4 w-4" /></button></>}
      {voice === 'recording' && <><button type="button" aria-label="Cancelar dictado" className={control} onClick={cancel}><X className="h-4 w-4" /></button><span role="status" className="text-xs text-brand-cyan-deep dark:text-brand-cyan">Grabando {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></>}
      {['starting', 'transcribing'].includes(voice) && <span role="status" className="text-xs text-brand-cyan-deep dark:text-brand-cyan">{voice === 'starting' ? 'Abriendo micrófono…' : 'Transcribiendo…'}</span>}
      {retryAudio && voice === 'idle' && <button type="button" disabled={disabled} className="min-h-11 text-xs text-brand-cyan-deep dark:text-brand-cyan" onClick={() => transcribe(retryAudio)}>Reintentar dictado</button>}
      <button type="button" title={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-label={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-pressed={voice === 'recording'} disabled={voice === 'recording' ? false : blocked} onClick={voice === 'recording' ? stop : start} className="brain-gradient-primary ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan"><span className="flex h-full w-full items-center justify-center rounded-full bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"><Mic className={voice === 'recording' ? 'h-4 w-4 animate-pulse text-brand-cyan-deep dark:text-brand-cyan' : 'h-4 w-4'} /></span></button>
    </div>
    {value.length > 12000 && <p role="alert" className="mt-2 text-xs text-destructive">Divide este dictado en mensajes de hasta 12.000 caracteres.</p>}
  </form>;
}
