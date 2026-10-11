import { useEffect, useRef, useState } from 'react';
import { BRIA_AUDIO_MAX_BYTES } from '@/lib/briaAttachments';

// Un solo dictado para toda Bria (11 de octubre de 2026): el chat y la consulta rápida desde la mascota graban,
// acotan y transcriben igual. El audio va al servidor (`POST /dictation`) y el texto vuelve por `onText`; quien
// lo usa decide dónde lo pone. Hasta cinco minutos y 20 MB; una sesión cancelada o un panel que se cierra suelta
// el micrófono de inmediato.
export function useBriaDictation({ request, active = true, disabled = false, onText, onError, onBusy }) {
  const recording = useRef(null), mounted = useRef(true), isActive = useRef(active), generation = useRef(0), timer = useRef(null);
  const callbacks = useRef({}); callbacks.current = { onText, onError, onBusy };
  const [voice, setVoice] = useState('idle'), [seconds, setSeconds] = useState(0), [retryAudio, setRetryAudio] = useState(null);
  const changeVoice = status => { setVoice(status); callbacks.current.onBusy?.(status !== 'idle'); };
  const fail = message => callbacks.current.onError?.(message);
  const cancel = () => {
    generation.current++; clearInterval(timer.current);
    const session = recording.current;
    if (session) { session.cancelled = true; if (session.recorder?.state === 'recording') session.recorder.stop(); session.stream?.getTracks().forEach(track => track.stop()); }
    recording.current = null; setRetryAudio(null);
    if (mounted.current) changeVoice('idle');
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); callbacks.current.onBusy?.(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { isActive.current = active; if (!active) cancel(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const transcribe = async blob => {
    const current = ++generation.current;
    changeVoice('transcribing'); fail('');
    try {
      if (!blob.size || blob.size > BRIA_AUDIO_MAX_BYTES) throw new Error('Graba un dictado de hasta 20 MB.');
      const body = new FormData(); body.append('audio', blob, blob.type.includes('mp4') ? 'dictado.mp4' : 'dictado.webm');
      const result = await request('/dictation', { method: 'POST', body });
      if (!mounted.current || !isActive.current || current !== generation.current) return;
      setRetryAudio(null); callbacks.current.onText?.(String(result?.text || ''));
    } catch (failure) {
      if (mounted.current && isActive.current && current === generation.current) { setRetryAudio(blob); fail(failure.message); }
    } finally { if (mounted.current && current === generation.current) changeVoice('idle'); }
  };
  const stop = () => { const session = recording.current; if (session?.recorder?.state === 'recording') session.recorder.stop(); };
  const start = async () => {
    if (voice !== 'idle' || disabled) return;
    fail(''); setRetryAudio(null); changeVoice('starting');
    const current = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Este navegador no permite grabar dictados.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || !isActive.current || current !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recording.current = { stream };
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const session = { recorder, stream, chunks: [], bytes: 0, cancelled: false }; recording.current = session;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > BRIA_AUDIO_MAX_BYTES) { session.cancelled = true; stop(); fail('El dictado llegó al límite de 20 MB. Graba uno más corto.'); }
        else session.chunks.push(event.data);
      };
      recorder.onerror = () => { cancel(); fail('No se pudo grabar el dictado. Intenta de nuevo.'); };
      recorder.onstop = () => {
        clearInterval(session.timer); stream.getTracks().forEach(track => track.stop());
        if (recording.current !== session) return;
        recording.current = null;
        if (session.cancelled || !mounted.current || !isActive.current) { if (mounted.current) changeVoice('idle'); return; }
        transcribe(new Blob(session.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start(1000); setSeconds(0); changeVoice('recording');
      const started = Date.now(); session.timer = timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= 300) stop(); }, 1000);
    } catch (failure) {
      recording.current?.stream.getTracks().forEach(track => track.stop()); recording.current = null;
      if (mounted.current && current === generation.current) { changeVoice('idle'); fail(['NotAllowedError', 'SecurityError'].includes(failure.name) ? 'Permite el micrófono en el navegador para dictar.' : failure.message); }
    }
  };
  return { voice, seconds, retryAudio, start, stop, cancel, retry: () => { if (retryAudio) transcribe(retryAudio); } };
}

export const formatDictationClock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
