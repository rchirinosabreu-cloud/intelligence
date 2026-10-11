import React, { useRef } from 'react';
import { Mic, Paperclip, X } from '@/components/ui/icons';
import { formatDictationClock, useBriaDictation } from './useBriaDictation';

export default function BriaComposer({ value, onChange, files, onFiles, onAddFiles, disabled, visible, allowAttachments, onSend, onError, onVoiceBusy, inputRef, request }) {
  const picker = useRef(null);
  // El dictado es el mismo de la consulta rápida (useBriaDictation): aquí el texto se suma al mensaje y vuelve el foco.
  const { voice, seconds, retryAudio, start, stop, cancel, retry } = useBriaDictation({
    request, active: visible, disabled,
    onText: text => { onChange(previous => [previous.trim(), text].filter(Boolean).join('\n\n')); inputRef.current?.focus({ preventScroll: true }); },
    onError, onBusy: onVoiceBusy
  });
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
      {voice === 'recording' && <><button type="button" aria-label="Cancelar dictado" className={control} onClick={cancel}><X className="h-4 w-4" /></button><span role="status" className="text-xs text-brand-cyan-deep dark:text-brand-cyan">Grabando {formatDictationClock(seconds)}</span></>}
      {['starting', 'transcribing'].includes(voice) && <span role="status" className="text-xs text-brand-cyan-deep dark:text-brand-cyan">{voice === 'starting' ? 'Abriendo micrófono…' : 'Transcribiendo…'}</span>}
      {retryAudio && voice === 'idle' && <button type="button" disabled={disabled} className="min-h-11 text-xs text-brand-cyan-deep dark:text-brand-cyan" onClick={retry}>Reintentar dictado</button>}
      <button type="button" title={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-label={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-pressed={voice === 'recording'} disabled={voice === 'recording' ? false : blocked} onClick={voice === 'recording' ? stop : start} className="brain-gradient-primary ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0.5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan"><span className="flex h-full w-full items-center justify-center rounded-full bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"><Mic className={voice === 'recording' ? 'h-4 w-4 animate-pulse text-brand-cyan-deep dark:text-brand-cyan' : 'h-4 w-4'} /></span></button>
    </div>
    {value.length > 12000 && <p role="alert" className="mt-2 text-xs text-destructive">Divide este dictado en mensajes de hasta 12.000 caracteres.</p>}
  </form>;
}
