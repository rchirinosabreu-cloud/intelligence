import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useNavigateFrom } from '@/components/layout/BackToOrigin';
import { FOLLOW_UP_CHANNELS, NOTICE_ARCHIVE_OUTCOME, REVIEW_OUTCOMES, SNOOZE_OPTIONS, noticeTitleHref } from '@/lib/importantNotices';
import ContractContinuityDecision from '@/components/modules/Clients/operations/ContractContinuityDecision';
import { noticeResponsePolicy, noticeAllows } from '@/lib/alertResponsePolicy';
import AnnouncementPreview from './AnnouncementPreview';
import { announcementRequest, openAnnouncementPreview } from '@/lib/announcementApi';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { bogotaDateKey } from '@/lib/crmNextFollowUp';

// Avisos importantes: tarjeta inferior con halo suave, por encima del menú. Un aviso
// a la vez; el siguiente sale cinco minutos después de decidir. Verde para el seguimiento, salmón solo para lo más
// importante. «Recordarme» va al final. Tocar fuera o Esc devuelve a los botones sin resolver el aviso.
// Las decisiones de negocio muestran consecuencias y confirmación; el registro nativo determina su resolución.
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
  const [mode, setMode] = useState('base'); // base | channels | close | confirm | snooze
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [reason, setReason] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const scheduleRequest = useRef(null);
  const scheduleRevision = useRef(null);
  const changeSchedule = (setter, value) => { setter(value); scheduleRequest.current = crypto.randomUUID(); };
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
    const selector = mode === 'base' ? `[data-notice-action="${returnAction.current}"]` : mode === 'schedule' ? 'textarea' : 'button:not([disabled])';
    if (mode !== 'base' || restoreFocus.current) contentRef.current?.querySelector(selector)?.focus({ preventScroll: true });
  }, [mode]);
  const policy = noticeResponsePolicy(notice);
  // Un aviso de una oportunidad: se puede archivar a la vista (Rodny, 4 de noviembre de 2026).
  const isCrm = policy?.family === 'CRM';
  const isAnnouncement = policy?.family === 'ANNOUNCEMENT';
  const titleHref = noticeTitleHref(notice);
  // Cartera vencida (28 de octubre de 2026): la decide Elisa. «Ya le escribí» deja la gestión de cobro en la
  // trazabilidad y «Registrar pago» abre Cuentas por cobrar; el aviso sale solo cuando el cliente se pone al día.
  const isCollection = policy?.family === 'COLLECTION';
  // Propuesta de suspender (30 de octubre de 2026): lleva a la página del cliente, donde está «Suspender». La
  // suspensión no se decide desde la banda porque exige decir quién la autorizó y por qué.
  const isSuspension = notice.kind === 'CARTERA_SUSPENSION';
  // Parrilla con piezas sin publicar (30 de octubre de 2026): aquí no hay seguimiento que registrar. Se abre la
  // parrilla y se marcan las piezas una por una —que es mirarlas—, y el aviso se cae solo en cuanto están publicadas,
  // también el de la otra persona a cargo de la cuenta: por eso no hay «avisarle a la otra».
  const isPlan = policy?.family === 'PLAN';
  const isAd = policy?.family === 'ADS';
  const isOperational = policy?.family === 'OPERATION';
  const selectOutcome = (value, action) => {
    // Descartar es una decisión directa pedida por Comercial; conserva revisión e historial nativos.
    if (value === 'DESCARTADO') {
      decide('close', { outcome: value, confirmed: true, expectedUpdatedAt: notice.sourceRevision }, 'Oportunidad descartada');
      return;
    }
    setOutcome(value); setReason(''); openOptions('confirm', action || (value === NOTICE_ARCHIVE_OUTCOME ? 'archive' : 'close'));
  };
  const openSchedule = () => {
    scheduleRequest.current = crypto.randomUUID();
    scheduleRevision.current = notice.sourceRevision;
    setNextAction(notice.followUpPlan?.action || ''); setNextFollowUpAt(notice.followUpPlan?.date || '');
    openOptions('schedule', 'schedule-follow-up');
  };
  const needsReason = outcome === 'PERDIDO';
  const outcomeLabel = outcome === NOTICE_ARCHIVE_OUTCOME ? 'Archivar oportunidad' : REVIEW_OUTCOMES.find(item => item.value === outcome)?.label;

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
      if (mode === 'schedule' && event.target.closest?.('#brain-datepicker-portal')) return;
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

  const dismissAnnouncement = async () => {
    setBusy(true);
    try {
      await announcementRequest(notice.announcement.id, 'response', { action: 'dismiss', expectedRevision: notice.announcement.revision });
      onDecided();
    } catch (error) {
      toast.error(error.message); setBusy(false); onRefresh();
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
          {isAnnouncement && notice.pendingAnnouncements > 1 && <p className="mb-2 text-xs text-zinc-500">{notice.pendingAnnouncements} anuncios pendientes · uno a la vez</p>}
          <p className="brain-notice-title">
            {titleHref ? (
              <a href={titleHref} data-notice-title-link onClick={openTitle} className="rounded transition-colors hover:underline">
                {notice.message}
              </a>
            ) : notice.message}
          </p>
          {mode === 'base' && !isAnnouncement && policy?.explanation && <p className="mb-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300" data-notice-effect>{policy.explanation}</p>}
          {mode === 'channels' && <p className="mb-3 text-sm font-medium">{isCollection ? '¿Cómo le escribiste?' : '¿Cómo hiciste el seguimiento?'}</p>}
          {mode === 'snooze' && <p className="mb-3 text-sm font-medium">¿Cuándo te lo recuerdo?</p>}
          {mode === 'close' && <p className="mb-3 text-sm font-medium">¿Qué resultado confirmó el cliente o el equipo?</p>}
          {mode === 'confirm' && <div className="mb-4 space-y-3 text-sm">
            <p className="font-semibold">{outcomeLabel}</p>
            <p>{outcome === NOTICE_ARCHIVE_OUTCOME ? 'Se archivará la oportunidad, conservando sus datos e historial.' : 'Se guardará este resultado en la oportunidad del CRM para todo el equipo.'}</p>
            {needsReason && <label className="block">Motivo de la decisión<textarea aria-label="Motivo de la decisión" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={2} disabled={busy} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></label>}
          </div>}
          {mode === 'schedule' && <div className="mb-4 space-y-3 text-sm">
            <p className="font-semibold">Próximo seguimiento</p>
            <label className="block">¿Qué se hará?<textarea aria-label="Acción del próximo seguimiento" value={nextAction}
              onChange={event => changeSchedule(setNextAction, event.target.value)} maxLength={1000} rows={2} disabled={busy}
              placeholder="Por ejemplo: llamar para revisar la propuesta"
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></label>
            <label className="block" htmlFor="notice-next-follow-up">Fecha del próximo seguimiento</label>
            <BrainDatePicker id="notice-next-follow-up" ariaLabel="Fecha del próximo seguimiento" value={nextFollowUpAt}
              onChange={value => changeSchedule(setNextFollowUpAt, value)} disabled={busy}
              min={bogotaDateKey(new Date(Date.now() + 86400000))} />
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Se guardará en la oportunidad para el equipo. El aviso volverá ese día a las 8:00 a. m. (Bogotá). Esto no registra una gestión realizada.</p>
          </div>}
          <div className="flex flex-wrap gap-2" role="group" aria-label={mode === 'base' ? 'Acciones del aviso' : 'Opciones del aviso'} aria-busy={busy}>
            {mode === 'base' && (
              <>
                {isAnnouncement ? <>
                  <NoticeButton primary disabled={busy} data-notice-action="preview" onClick={() => openAnnouncementPreview(notice.announcement.id)}>Ver anuncio</NoticeButton>
                  <NoticeButton disabled={busy} data-notice-action="dismiss" onClick={dismissAnnouncement}>Cerrar</NoticeButton>
                </> : isOperational ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-operation" onClick={() => navigateFrom(notice.kind === 'OPERACION_RENOVACION' ? `${notice.url}?action=renew-contract` : notice.url)}>
                    {policy.openLabel}
                  </NoticeButton>
                ) : isPlan ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-plan" onClick={() => navigate(notice.url || '/clientes')}>
                    {policy.openLabel}
                  </NoticeButton>
                ) : isAd ? (
                  <NoticeButton primary disabled={busy} data-notice-action="open-ad-budget" onClick={() => navigateFrom(notice.url || '/pautas')}>
                    {policy.openLabel}
                  </NoticeButton>
                ) : noticeAllows(notice, 'follow-up') ? (
                  <NoticeButton primary disabled={busy} data-notice-action="follow-up" onClick={() => openOptions('channels', 'follow-up')}>
                    {isCollection ? 'Ya le escribí' : 'Ya hice seguimiento'}
                  </NoticeButton>
                ) : titleHref && <NoticeButton primary onClick={() => navigateFrom(titleHref)}>Abrir aviso</NoticeButton>}
                {isCollection && notice.url && (
                  <NoticeButton disabled={busy} data-notice-action={isSuspension ? 'suspend' : 'pay'} onClick={() => navigate(notice.url)}>
                {isSuspension ? 'Revisar suspensión' : 'Registrar pago'}
              </NoticeButton>
                )}
                {/* El resultado es de la oportunidad, no un cierre genérico de la tarjeta. */}
                {noticeAllows(notice, 'schedule-follow-up') && <NoticeButton disabled={busy} data-notice-action="schedule-follow-up" onClick={openSchedule}>Próximo seguimiento</NoticeButton>}
                {isCrm && noticeAllows(notice, 'close') && <NoticeButton disabled={busy || !notice.sourceRevision} data-notice-action="discard" onClick={() => selectOutcome('DESCARTADO', 'discard')}>Descartar</NoticeButton>}
                {noticeAllows(notice, 'close') && (
                  <NoticeButton disabled={busy} data-notice-action="close" onClick={() => openOptions('close', 'close')}>
                    Resolver oportunidad
                  </NoticeButton>
                )}
                {isCrm && notice.url && (
                  <NoticeButton disabled={busy} data-notice-action="open" onClick={() => navigate(notice.url)}>Abrir</NoticeButton>
                )}
                {isCrm && (
                  <NoticeButton disabled={busy} data-notice-action="archive" onClick={() => selectOutcome(NOTICE_ARCHIVE_OUTCOME)}>
                    Archivar
                  </NoticeButton>
                )}
                {noticeAllows(notice, 'acknowledge') && <NoticeButton disabled={busy} data-notice-action="acknowledge" onClick={() => decide('acknowledge', {}, 'Aviso recibido')}>Recibido</NoticeButton>}
                {isOperational && notice.continuity && <ContractContinuityDecision clientId={notice.continuity.clientId}
                  clientName={notice.label.split(' · ').slice(1).join(' · ')} onDecided={onDecided}
                  contract={{ id: notice.continuity.contractId, endDate: notice.continuity.endDate, updatedAt: notice.continuity.expectedUpdatedAt }} />}
                {noticeAllows(notice, 'snooze') && <NoticeButton disabled={busy} data-notice-action="snooze" onClick={() => openOptions('snooze', 'snooze')}>
                  Recordarme <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </NoticeButton>}
              </>
            )}
            {mode === 'channels' && FOLLOW_UP_CHANNELS.map((channel) => (
              <NoticeButton key={channel.value} disabled={busy} data-notice-channel={channel.value}
                onClick={() => decide('follow-up', { channel: channel.value, ...(isCollection ? { receivableIds: notice.receivableIds } : {}) }, isCollection ? 'Gestión de cobro registrada' : 'Seguimiento registrado en el CRM')}>
                {channel.label}
              </NoticeButton>
            ))}
            {mode === 'close' && REVIEW_OUTCOMES.map((outcome) => (
              <NoticeButton key={outcome.value} disabled={busy} data-notice-outcome={outcome.value}
                onClick={() => selectOutcome(outcome.value)}>
                {outcome.label}
              </NoticeButton>
            ))}
            {mode === 'confirm' && <>
              <NoticeButton disabled={busy} onClick={() => setMode('base')}>Volver</NoticeButton>
              <NoticeButton primary disabled={busy || (needsReason && !reason.trim()) || !notice.sourceRevision}
                onClick={() => decide('close', { outcome, confirmed: true, reason, expectedUpdatedAt: notice.sourceRevision }, 'Decisión registrada en el CRM')}>Confirmar decisión</NoticeButton>
              {!notice.sourceRevision && <p role="alert" className="text-xs text-destructive">Actualiza el aviso para confirmar sobre la oportunidad vigente.</p>}
            </>}
            {mode === 'schedule' && <>
              <NoticeButton disabled={busy} onClick={() => setMode('base')}>Volver</NoticeButton>
              <NoticeButton primary disabled={busy || !nextAction.trim() || !nextFollowUpAt || !scheduleRevision.current}
                onClick={() => decide('schedule-follow-up', { nextAction, nextFollowUpAt, confirmed: true,
                  expectedUpdatedAt: scheduleRevision.current, requestId: scheduleRequest.current }, 'Próximo seguimiento guardado en el CRM')}>
                {busy ? 'Programando…' : 'Programar seguimiento'}
              </NoticeButton>
            </>}
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

  return (
    <><AnnouncementPreview />{notice && <NoticeBody
      key={notice.id}
      notice={notice}
      appearance={appearance}
      onHeightChange={onHeightChange}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: NOTICE_KEY })}
      onDecided={() => {
        queryClient.invalidateQueries({ queryKey: NOTICE_KEY });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['crm'] });
        queryClient.invalidateQueries({ queryKey: ['client-operations'] });
        queryClient.invalidateQueries({ queryKey: ['financial-collection-activities'] });
        queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
      }}
    />}</>
  );
}
