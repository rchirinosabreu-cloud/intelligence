import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { FOLLOW_UP_CHANNELS, NOTICE_ARCHIVE_OUTCOME, REVIEW_OUTCOMES, SNOOZE_OPTIONS, noticeTitleHref } from '@/lib/importantNotices';

// Avisos importantes: tarjeta inferior con halo suave, por encima del menú. Un aviso
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
    throw Object.assign(new Error(data?.error || 'No pudimos guardar tu decisión.'), { status: response.status });
  }
  return data;
};

const NoticeButton = ({ primary = false, className, ...props }) => (
  <button
    type="button"
    className={cn(
      'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60',
      primary ? 'brain-notice-primary' : 'brain-notice-ghost',
      className
    )}
    {...props}
  />
);

function NoticeBody({ notice, onDecided, onRefresh, onHeightChange, appearance = 'halo' }) {
  const navigate = useNavigate();
  const navigateFrom = useNavigateFrom();
  const [mode, setMode] = useState('base'); // base | channels | close | snooze
  const [busy, setBusy] = useState(false);
  const contentRef = useRef(null);
  const bandRef = useRef(null);
  useEffect(() => {
    if (!onHeightChange || !bandRef.current) return undefined;
    const measure = () => onHeightChange(Math.ceil(bandRef.current.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(bandRef.current);
    measure();
    return () => { observer.disconnect(); onHeightChange(0); };
  }, [onHeightChange]);
  const previousMode = useRef('base');
  const returnAction = useRef('snooze');
  const restoreFocus = useRef(true);
  const openOptions = (nextMode, action) => {
    returnAction.current = action;
    restoreFocus.current = true;
    setMode(nextMode);
  };
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const selector = mode === 'base' ? `[data-notice-action="${returnAction.current}"]` : 'button:not([disabled])';
    if (mode !== 'base' || restoreFocus.current) contentRef.current?.querySelector(selector)?.focus({ preventScroll: true });
  }, [mode]);
  const isReview = notice.kind === 'CRM_REVIEW';
  // Un aviso de una oportunidad: se puede archivar a la vista (Rodny, 4 de noviembre de 2026).
  const isCrm = String(notice.kind || '').startsWith('CRM_');
  const titleHref = noticeTitleHref(notice);
  // Cartera vencida (28 de octubre de 2026): la decide Elisa. «Ya le escribí» deja la gestión de cobro en la
  // trazabilidad y «Registrar pago» abre Cuentas por cobrar; el aviso sale solo cuando el cliente se pone al día.
  const isCollection = String(notice.kind || '').startsWith('CARTERA_');
  // Propuesta de suspender (30 de octubre de 2026): lleva a la página del cliente, donde está «Suspender». La
  // suspensión no se decide desde la banda porque exige decir quién la autorizó y por qué.
  const isSuspension = notice.kind === 'CARTERA_SUSPENSION';
  // Parrilla con piezas sin publicar (30 de octubre de 2026): aquí no hay seguimiento que registrar. Se abre la
  // parrilla y se marcan las piezas una por una —que es mirarlas—, y el aviso se cae solo en cuanto están publicadas,
  // también el de la otra persona a cargo de la cuenta: por eso no hay «avisarle a la otra».
  const isPlan = String(notice.kind || '').startsWith('PARRILLA_');
  const isOperational = String(notice.kind || '').startsWith('OPERACION_');
  const openLabel = notice.kind === 'PARRILLA_RESUMEN' ? 'Abrir Operación' : 'Abrir la parrilla';
  // Pauta (6 de noviembre de 2026): igual que la parrilla, el aviso no se decide aquí. Se abre la pauta, se actualiza el
  // gasto o se apaga la campaña, y el aviso se cae solo.
  const isAd = String(notice.kind || '').startsWith('PAUTA_');

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
    const onPointer = (event) => {
      if (!contentRef.current?.contains(event.target)) {
        restoreFocus.current = false; // El clic exterior conserva el foco donde la persona decidió ir.
        setMode('base');
      }
    };
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
      if (error.status === 409) { setMode('base'); onRefresh(); }
    }
  };

  // Mirar no es decidir (Rodny, 4 de noviembre de 2026): el título lleva a lo que nombra y el aviso sigue ahí. Con Ctrl o
  // Cmd se abre en otra pestaña, como cualquier enlace.
  const openTitle = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigateFrom(titleHref);
  };

  return (
    <div ref={bandRef} className="brain-notice-band" data-important-notice={notice.id} data-appearance={appearance} data-level={notice.level} data-mode={mode === 'base' ? 'base' : 'choose'}>
      <div className="brain-notice-wash" aria-hidden="true" />
      <div className="brain-notice-content">
        <section ref={contentRef} role="region" aria-label="Aviso importante" aria-live="polite">
          <p className="brain-notice-label"><span className="brain-notice-dot" aria-hidden="true" />{notice.label}</p>
          <p className="brain-notice-title">
            {titleHref ? (
              <a href={titleHref} data-notice-title-link onClick={openTitle} className="rounded transition-colors hover:underline">
                {notice.message}
              </a>
            ) : notice.message}
          </p>
          {mode === 'channels' && <p className="mb-3 text-sm font-medium">{isCollection ? '¿Cómo le escribiste?' : '¿Cómo hiciste el seguimiento?'}</p>}
          {mode === 'snooze' && <p className="mb-3 text-sm font-medium">¿Cuándo te lo recuerdo?</p>}
          {mode === 'close' && <p className="mb-3 text-sm font-medium">¿Cómo la cerramos?</p>}
          <div className="flex flex-wrap gap-2" role="group" aria-label={mode === 'base' ? 'Acciones del aviso' : 'Opciones del aviso'} aria-busy={busy}>
            {mode === 'base' && (
              <>
                {isOperational ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-operation" onClick={() => navigateFrom(notice.url)}>
                    {notice.actionLabel || 'Revisar operación'}
                  </NoticeButton>
                ) : isPlan ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-plan" onClick={() => navigate(notice.url || '/clientes')}>
                    {openLabel}
                  </NoticeButton>
                ) : isAd ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-ad-budget" onClick={() => navigateFrom(notice.url || '/pautas')}>
                    {notice.kind === 'PAUTA_RESUMEN' ? 'Abrir Pautas' : 'Abrir la pauta'}
                  </NoticeButton>
                ) : (
                  <NoticeButton primary disabled={busy} data-notice-action="follow-up" onClick={() => openOptions('channels', 'follow-up')}>
                    {isCollection ? 'Ya le escribí' : 'Ya hice seguimiento'}
                  </NoticeButton>
                )}
                {isCollection && notice.url && (
                  <NoticeButton disabled={busy} data-notice-action={isSuspension ? 'suspend' : 'pay'} onClick={() => navigate(notice.url)}>
                {isSuspension ? 'Revisar suspensión' : 'Registrar pago'}
              </NoticeButton>
                )}
                {/* En la revisión, «No sigue» pregunta si quedó perdida o descartada, y no hay «Abrir» (Rodny, 26 de
                    octubre de 2026). «Cerrar» se confundía con cerrar el aviso y «Descartar» elegía una de las dos. */}
                {isReview && (
                  <NoticeButton disabled={busy} data-notice-action="close" onClick={() => openOptions('close', 'close')}>
                    No sigue
                  </NoticeButton>
                )}
                {!isReview && !isCollection && !isPlan && !isOperational && !isAd && notice.url && (
                  <NoticeButton disabled={busy} data-notice-action="open" onClick={() => navigate(notice.url)}>Abrir</NoticeButton>
                )}
                {isCrm && (
                  <NoticeButton disabled={busy} data-notice-action="archive" onClick={() => decide('close', { outcome: NOTICE_ARCHIVE_OUTCOME }, 'Oportunidad archivada: la encuentras en «Ver archivadas»')}>
                    Archivar
                  </NoticeButton>
                )}
                {isOperational && notice.acknowledge && <NoticeButton disabled={busy} data-notice-action="acknowledge" onClick={() => decide('acknowledge', {}, 'Aviso recibido')}>Entendido</NoticeButton>}
                <NoticeButton disabled={busy} data-notice-action="snooze" onClick={() => openOptions('snooze', 'snooze')}>
                  Recordarme <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </NoticeButton>
              </>
            )}
            {mode === 'channels' && FOLLOW_UP_CHANNELS.map((channel) => (
              <NoticeButton key={channel.value} disabled={busy} data-notice-channel={channel.value}
                onClick={() => decide('follow-up', { channel: channel.value, ...(notice.kind === 'CARTERA_MENSUAL' ? { receivableIds: notice.receivableIds } : {}) }, isCollection ? 'Gestión de cobro registrada' : 'Seguimiento registrado en el CRM')}>
                {channel.label}
              </NoticeButton>
            ))}
            {mode === 'close' && REVIEW_OUTCOMES.map((outcome) => (
              <NoticeButton key={outcome.value} disabled={busy} data-notice-outcome={outcome.value}
                onClick={() => decide('close', { outcome: outcome.value }, outcome.done || `La oportunidad pasó a ${outcome.stage}`)}>
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
export default function ImportantNoticeBand({ enabled = true, onVisibleChange, onHeightChange, appearance = 'halo' }) {
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
      appearance={appearance}
      onHeightChange={onHeightChange}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: NOTICE_KEY })}
      onDecided={() => {
        queryClient.invalidateQueries({ queryKey: NOTICE_KEY });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['crm'] });
      }}
    />
  );
}
