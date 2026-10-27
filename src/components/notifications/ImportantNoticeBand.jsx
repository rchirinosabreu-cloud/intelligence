import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { FOLLOW_UP_CHANNELS, REVIEW_OUTCOMES, SNOOZE_OPTIONS } from '@/lib/importantNotices';

// Avisos importantes (Rodny, 26 de octubre de 2026): la banda de abajo, de borde a borde y por encima del menú. Un aviso
// a la vez; el siguiente sale cinco minutos después de decidir. Verde para el seguimiento, salmón solo para lo más
// importante. «Recordarme» va siempre al final, «Abrir» es un botón como los demás y no hay «Volver» ni nota: tocar fuera
// del aviso o Esc devuelve a sus botones.
const NOTICE_KEY = ['important-notice'];
const POLL_MS = 60 * 1000;

const fetchCurrent = async () => {
  const response = await fetch(`${getApiBaseUrl()}/api/important-notices/current`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`important-notices ${response.status}`);
  return response.json();
};

const post = async (path, body) => {
  const response = await fetch(`${getApiBaseUrl()}/api/important-notices/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Avisos importantes]', data);
    throw new Error(data?.error || 'No pudimos guardar tu decisión.');
  }
  return data;
};

const NoticeButton = ({ primary = false, className, ...props }) => (
  <button
    type="button"
    className={cn(
      'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60',
      primary ? 'brain-notice-primary' : 'brain-notice-ghost',
      className
    )}
    {...props}
  />
);

function NoticeBody({ notice, onDecided }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('base'); // base | channels | close | snooze
  const [busy, setBusy] = useState(false);
  const contentRef = useRef(null);
  const isReview = notice.kind === 'CRM_REVIEW';

  // Que el aviso estuvo a la vista queda en la trazabilidad de Salud operativa (27 de octubre de 2026). Solo con la
  // pestaña visible: una pestaña de fondo no le muestra nada a nadie. El servidor lo anota una vez por aparición.
  useEffect(() => {
    let reported = false;
    const report = () => {
      if (reported || document.visibilityState !== 'visible') return;
      reported = true;
      post(`${notice.id}/shown`).catch(() => {});
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [notice.id]);

  // Esc o tocar fuera del aviso devuelve a sus botones; el aviso no se va.
  useEffect(() => {
    if (mode === 'base') return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMode('base'); };
    const onPointer = (event) => { if (!contentRef.current?.contains(event.target)) setMode('base'); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [mode]);

  const decide = async (path, body, success) => {
    setBusy(true);
    try {
      await post(`${notice.id}/${path}`, body);
      toast.success(success);
      onDecided();
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="brain-notice-band" data-important-notice={notice.id} data-level={notice.level} data-mode={mode === 'base' ? 'base' : 'choose'}>
      <div className="brain-notice-wash" aria-hidden="true" />
      <div className="brain-notice-content">
        <section ref={contentRef} role="region" aria-label="Aviso importante" aria-live="polite" className="mx-auto max-w-3xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/90">{notice.label}</p>
          <p className="brain-notice-title mb-4 text-[22px] font-bold leading-tight text-white">{notice.message}</p>
          {mode === 'channels' && <p className="-mt-1.5 mb-3 text-[15px] font-medium text-white/95">¿Cómo hiciste el seguimiento?</p>}
          {mode === 'snooze' && <p className="-mt-1.5 mb-3 text-[15px] font-medium text-white/95">¿Cuándo te lo recuerdo?</p>}
          {mode === 'close' && <p className="-mt-1.5 mb-3 text-[15px] font-medium text-white/95">¿Cómo la cerramos?</p>}
          <div className="flex flex-wrap justify-center gap-2.5" aria-busy={busy}>
            {mode === 'base' && (
              <>
                <NoticeButton primary disabled={busy} data-notice-action="follow-up" onClick={() => setMode('channels')}>
                  Ya hice seguimiento
                </NoticeButton>
                {/* En la revisión, «No sigue» pregunta si quedó perdida o descartada, y no hay «Abrir» (Rodny, 26 de
                    octubre de 2026). «Cerrar» se confundía con cerrar el aviso y «Descartar» elegía una de las dos. */}
                {isReview && (
                  <NoticeButton disabled={busy} data-notice-action="close" onClick={() => setMode('close')}>
                    No sigue
                  </NoticeButton>
                )}
                {!isReview && notice.url && (
                  <NoticeButton disabled={busy} data-notice-action="open" onClick={() => navigate(notice.url)}>Abrir</NoticeButton>
                )}
                <NoticeButton disabled={busy} data-notice-action="snooze" aria-haspopup="true" onClick={() => setMode('snooze')}>
                  Recordarme <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </NoticeButton>
              </>
            )}
            {mode === 'channels' && FOLLOW_UP_CHANNELS.map((channel) => (
              <NoticeButton key={channel.value} disabled={busy} data-notice-channel={channel.value}
                onClick={() => decide('follow-up', { channel: channel.value }, 'Seguimiento registrado en el CRM')}>
                {channel.label}
              </NoticeButton>
            ))}
            {mode === 'close' && REVIEW_OUTCOMES.map((outcome) => (
              <NoticeButton key={outcome.value} disabled={busy} data-notice-outcome={outcome.value}
                onClick={() => decide('close', { outcome: outcome.value }, `La oportunidad pasó a ${outcome.stage}`)}>
                {outcome.label}
              </NoticeButton>
            ))}
            {mode === 'snooze' && SNOOZE_OPTIONS.map((option) => (
              <NoticeButton key={option.value} disabled={busy} data-notice-snooze={option.value}
                onClick={() => decide('snooze', { option: option.value }, `Te lo recuerdo ${option.label.charAt(0).toLowerCase()}${option.label.slice(1)}`)}>
                {option.label}
              </NoticeButton>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** La banda de avisos importantes. `onVisibleChange` deja espacio abajo en la página para que nada quede tapado. */
export default function ImportantNoticeBand({ enabled = true, onVisibleChange }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: NOTICE_KEY,
    queryFn: fetchCurrent,
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: false
  });
  const notice = enabled ? data?.notice || null : null;
  const nextAt = data?.nextAt || null;

  // Cuando termina la espera de cinco minutos o vuelve un aviso pospuesto, se pregunta otra vez sin esperar al sondeo.
  useEffect(() => {
    if (!enabled || !nextAt) return undefined;
    const wait = new Date(nextAt).getTime() - Date.now();
    if (!(wait > 0) || wait > POLL_MS) return undefined;
    const timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: NOTICE_KEY }), wait + 500);
    return () => clearTimeout(timer);
  }, [enabled, nextAt, queryClient]);

  const visible = Boolean(notice);
  useEffect(() => { onVisibleChange?.(visible); }, [visible, onVisibleChange]);

  if (!notice) return null;
  return (
    <NoticeBody
      key={notice.id}
      notice={notice}
      onDecided={() => {
        queryClient.invalidateQueries({ queryKey: NOTICE_KEY });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['crm'] });
      }}
    />
  );
}
