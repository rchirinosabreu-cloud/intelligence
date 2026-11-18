import React, { useLayoutEffect, useRef } from 'react';
import { Mic, Paperclip, X } from '@/components/ui/icons';
import { formatDictationClock, useBriaDictation } from './useBriaDictation';

// El cuadro crece con lo que se escribe hasta el triple de su alto inicial; de ahí en adelante, desplazamiento
// (Rodny, 10 de noviembre de 2026).
export const COMPOSER_BASE_PX = 64;
export const COMPOSER_MAX_PX = COMPOSER_BASE_PX * 3;
export const composerHeight = (scrollHeight) => Math.min(Math.max(Number(scrollHeight) || 0, COMPOSER_BASE_PX), COMPOSER_MAX_PX);

export default function BriaComposer({ value, onChange, files, onFiles, onAddFiles, disabled, visible, allowAttachments, onSend, onError, onVoiceBusy, inputRef, request }) {
  const picker = useRef(null);
  useLayoutEffect(() => {
    const box = inputRef?.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${composerHeight(box.scrollHeight)}px`;
    box.style.overflowY = box.scrollHeight > COMPOSER_MAX_PX ? 'auto' : 'hidden';
  }, [value, visible, inputRef]);
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
  const blocked = disabled || voice !== 'idle', control = 'flex h-11 w-11 items-center justify-center rounded-full text-bria-muted hover:bg-bria-night/5 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10';
  return <form className="mx-auto max-w-3xl rounded-3xl border border-bria-line bg-white p-2.5 pl-4 shadow-[0_14px_28px_-22px_rgba(9,32,56,0.5)] focus-within:border-bria-turquoise dark:border-white/10 dark:bg-bria-night-raised dark:shadow-none" onSubmit={event => { event.preventDefault(); if (!blocked) onSend(); }}>
    {files.length > 0 && <ul aria-label="Archivos por enviar" className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">{files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="flex max-w-full items-center gap-1 rounded-xl bg-bria-mist pl-3 text-xs text-bria-night dark:bg-white/10 dark:text-white"><span className="truncate">{file.name}</span><button type="button" disabled={blocked} aria-label={`Quitar ${file.name}`} className={control} onClick={() => onFiles(files.filter((_, position) => position !== index))}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    <label htmlFor="bria-message" className="sr-only">Mensaje para Bria</label>
    <textarea id="bria-message" ref={inputRef} value={value} rows={2} enterKeyHint="send" maxLength={12000} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!blocked) onSend(); } }} placeholder="Conversa con Bria…" className="max-h-48 min-h-16 w-full resize-none bg-transparent px-0 py-1 text-base leading-6 text-bria-night placeholder:text-bria-muted/70 focus:outline-none dark:text-white dark:placeholder:text-zinc-400" />
    <div className="-ml-2.5 flex items-center gap-1">
      {allowAttachments && <><input ref={picker} type="file" multiple hidden aria-label="Archivos para Bria" onChange={addFiles} disabled={blocked} /><button type="button" title="Adjuntar archivos · hasta 5, 20 MB por archivo" aria-label="Adjuntar archivos" disabled={blocked} className={control} onClick={() => picker.current?.click()}><Paperclip className="h-4 w-4" /></button></>}
      {voice === 'recording' && <><button type="button" aria-label="Cancelar dictado" className={control} onClick={cancel}><X className="h-4 w-4" /></button><span role="status" className="text-xs text-bria-cyan-deep dark:text-bria-mint">Grabando {formatDictationClock(seconds)}</span></>}
      {['starting', 'transcribing'].includes(voice) && <span role="status" className="text-xs text-bria-cyan-deep dark:text-bria-mint">{voice === 'starting' ? 'Abriendo micrófono…' : 'Transcribiendo…'}</span>}
      {retryAudio && voice === 'idle' && <button type="button" disabled={disabled} className="min-h-11 text-xs text-bria-cyan-deep dark:text-bria-mint" onClick={retry}>Reintentar dictado</button>}
      <button type="button" title={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-label={voice === 'recording' ? 'Terminar dictado' : 'Grabar dictado'} aria-pressed={voice === 'recording'} disabled={voice === 'recording' ? false : blocked} onClick={voice === 'recording' ? stop : start} className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bria text-bria-night disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bria-cyan"><Mic className={voice === 'recording' ? 'h-[18px] w-[18px] animate-pulse' : 'h-[18px] w-[18px]'} /></button>
    </div>
    {value.length > 12000 && <p role="alert" className="mt-2 text-xs text-destructive">Divide este dictado en mensajes de hasta 12.000 caracteres.</p>}
  </form>;
}
