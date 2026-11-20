import React, { useLayoutEffect, useRef } from 'react';
import { ArrowUp, AudioWave, Check, Mic, Paperclip, X } from '@/components/ui/icons';
import { canSendMessage, waveBars } from '@/lib/briaComposer';
import { formatDictationClock, useBriaDictation } from './useBriaDictation';

// El cuadro crece con lo que se escribe y, pasado su tope, desplaza (Rodny, 10 de noviembre de 2026). Desde el 20 de
// noviembre de 2026 arranca en una sola línea, como los chats del celular, y conserva el mismo tope de 192 px. Los
// botones redondos miden todos lo mismo (36 px dentro de un área táctil de 44): adjuntar, dictar y enviar, que ahora
// vive dentro del cuadro. Mientras graba, en lugar del texto se ve la onda del micrófono.
export const COMPOSER_BASE_PX = 32;
export const COMPOSER_MAX_PX = 192;
export const composerHeight = (scrollHeight) => Math.min(Math.max(Number(scrollHeight) || 0, COMPOSER_BASE_PX), COMPOSER_MAX_PX);

export default function BriaComposer({ value, onChange, files, onFiles, onAddFiles, disabled, visible, allowAttachments, onSend, onError, onVoiceBusy, inputRef, request, onVoice }) {
  const picker = useRef(null);
  useLayoutEffect(() => {
    const box = inputRef?.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${composerHeight(box.scrollHeight)}px`;
    box.style.overflowY = box.scrollHeight > COMPOSER_MAX_PX ? 'auto' : 'hidden';
  }, [value, visible, inputRef]);
  // El dictado es el mismo de la consulta rápida (useBriaDictation): aquí el texto se suma al mensaje y vuelve el foco.
  const { voice, seconds, levels, preview, retryAudio, start, stop, cancel, retry } = useBriaDictation({
    request, active: visible, disabled,
    onText: text => { onChange(previous => [previous.trim(), text].filter(Boolean).join('\n\n')); inputRef.current?.focus({ preventScroll: true }); },
    onError, onBusy: onVoiceBusy
  });
  const addFiles = event => {
    onAddFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };
  const blocked = disabled || voice !== 'idle', recording = voice === 'recording', sendable = canSendMessage({ value, files, blocked });
  // Un área táctil de 44 px con un círculo de 36 adentro: todos los botones redondos se ven del mismo tamaño.
  const control = 'group flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-40';
  const disc = 'flex h-9 w-9 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-bria-cyan group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-bria-night-raised';
  const ghost = `${disc} text-bria-muted group-hover:bg-bria-night/5 dark:text-zinc-300 dark:group-hover:bg-white/10`;
  return <form data-bria-composer className="mx-auto max-w-3xl rounded-[26px] border border-bria-line bg-white px-1.5 pb-1 pt-2.5 shadow-[0_14px_28px_-22px_rgba(9,32,56,0.5)] focus-within:border-bria-turquoise dark:border-white/10 dark:bg-bria-night-raised dark:shadow-none" onSubmit={event => { event.preventDefault(); if (sendable) onSend(); }}>
    {files.length > 0 && <ul aria-label="Archivos por enviar" className="mx-2.5 mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">{files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`} className="flex max-w-full items-center gap-1 rounded-xl bg-bria-mist pl-3 text-xs text-bria-night dark:bg-white/10 dark:text-white"><span className="truncate">{file.name}</span><button type="button" disabled={blocked} aria-label={`Quitar ${file.name}`} className={control} onClick={() => onFiles(files.filter((_, position) => position !== index))}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
    <label htmlFor="bria-message" className="sr-only">Mensaje para Bria</label>
    <textarea id="bria-message" ref={inputRef} value={value} rows={1} enterKeyHint="send" maxLength={12000} hidden={recording || (voice === 'transcribing' && Boolean(preview))} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (sendable) onSend(); } }} placeholder={voice === 'transcribing' ? 'Transcribiendo lo que dijiste…' : 'Conversa con Bria…'} className={`max-h-48 min-h-8 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 text-bria-night placeholder:text-bria-muted/70 focus:outline-none dark:text-white dark:placeholder:text-zinc-400 ${voice === 'transcribing' ? 'placeholder:animate-pulse' : ''}`} />
    {preview && voice !== 'idle' && <p data-bria-dictation-preview aria-hidden="true" className={`max-h-24 overflow-y-auto whitespace-pre-wrap px-2.5 pb-1 text-base leading-6 text-bria-muted/60 dark:text-zinc-500 ${voice === 'transcribing' ? 'animate-pulse' : ''}`}>{preview}</p>}
    {recording && <div data-bria-recording role="status" aria-label={`Grabando ${formatDictationClock(seconds)}`} className="flex h-8 items-center gap-3 px-2.5"><div aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center justify-between overflow-hidden">{waveBars(levels).map((height, index) => <span key={index} className="w-[3px] shrink-0 rounded-full bg-bria-turquoise transition-[height] duration-100 dark:bg-bria-mint" style={{ height: `${height}%` }} />)}</div><span className="shrink-0 text-sm tabular-nums text-bria-cyan-deep dark:text-bria-mint">{formatDictationClock(seconds)}</span></div>}
    <div className="flex items-center">
      {allowAttachments && !recording && <><input ref={picker} type="file" multiple hidden aria-label="Archivos para Bria" onChange={addFiles} disabled={blocked} /><button type="button" title="Adjuntar archivos · hasta 5, 20 MB por archivo" aria-label="Adjuntar archivos" disabled={blocked} className={control} onClick={() => picker.current?.click()}><span className={ghost}><Paperclip className="h-[18px] w-[18px]" /></span></button></>}
      {recording && <button type="button" title="Cancelar dictado" aria-label="Cancelar dictado" className={control} onClick={cancel}><span className={ghost}><X className="h-[18px] w-[18px]" /></span></button>}
      {voice === 'starting' && <span role="status" className="px-2.5 text-xs text-bria-cyan-deep dark:text-bria-mint">Abriendo micrófono…</span>}
      {retryAudio && voice === 'idle' && <button type="button" disabled={disabled} className="min-h-11 px-2.5 text-xs text-bria-cyan-deep dark:text-bria-mint" onClick={retry}>Reintentar dictado</button>}
      <button type="button" title={recording ? 'Terminar dictado' : 'Grabar dictado'} aria-label={recording ? 'Terminar dictado' : 'Grabar dictado'} aria-pressed={recording} disabled={recording ? false : blocked} onClick={recording ? stop : start} className={`${control} ml-auto`}><span data-bria-mic className={`${disc} bg-gradient-to-br from-[#00AC8A] to-[#009EB9] text-white`}>{recording ? <Check className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</span></button>
      {!recording && onVoice && !sendable && voice === 'idle' && !disabled
        ? <button type="button" title="Hablar con Bria" aria-label="Hablar con Bria" onClick={onVoice} className={control}><span data-bria-voice-open className={`${disc} bg-bria-night text-white dark:bg-white dark:text-bria-night`}><AudioWave className="h-[18px] w-[18px]" /></span></button>
        : !recording && <button type="submit" title="Enviar" aria-label="Enviar mensaje" disabled={!sendable} className={control}><span data-bria-send className={`${disc} bg-bria-night text-white dark:bg-white dark:text-bria-night`}><ArrowUp className="h-[18px] w-[18px]" /></span></button>}
    </div>
    {value.length > 12000 && <p role="alert" className="mt-2 text-xs text-destructive">Divide este dictado en mensajes de hasta 12.000 caracteres.</p>}
  </form>;
}
