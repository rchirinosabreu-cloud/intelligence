import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { getFindingVerificationUi } from '@/lib/briaVerificationUi';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

const verdictLabels = {
  ALINEADA: 'Alineada',
  REQUIERE_AJUSTES: 'Requiere ajustes',
  RIESGO: 'Riesgo relevante'
};
const categoryLabels = {
  ESTRATEGIA: 'Estrategia',
  MARCA: 'Marca',
  GRAMATICA: 'Gramática',
  CONSISTENCIA: 'Consistencia'
};
const severityStyles = {
  INFO: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200',
  WARNING: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
  CRITICAL: 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive'
};
const dismissReasons = [
  'No aplica al cliente',
  'Decisión estratégica consciente',
  'La evidencia está desactualizada',
  'Interpretación incorrecta',
  'Se resolverá fuera de la parrilla',
  'Duplicado de otro hallazgo',
  'Otro motivo'
];
const cardsPerStep = 3;
const scrollAnimationDuration = 420;

const authConfig = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });

const BriaContentPlanReview = ({ planId, planUpdatedAt }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [dismissFinding, setDismissFinding] = useState(null);
  const [dismissReason, setDismissReason] = useState(dismissReasons[0]);
  const [customReason, setCustomReason] = useState('');
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const findingsRailRef = useRef(null);
  const findingsAnimationRef = useRef(null);

  const loadReview = useCallback(async ({ silent = false } = {}) => {
    if (!planId) return;
    if (!silent) setError('');
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/content/plans/${planId}/bria-review`, authConfig());
      setResult(response.data);
    } catch (requestError) {
      console.error('Bria shared content-plan review failed:', requestError.response?.data || requestError);
      if (!silent) setError(requestError.response?.data?.error || 'Bria no pudo cargar la revisión compartida.');
    }
  }, [planId]);

  useEffect(() => {
    loadReview();
  }, [loadReview, planUpdatedAt]);

  const hasVerifyingFindings = result?.review?.findings?.some(finding => finding.status === 'VERIFYING');
  useEffect(() => {
    if (!['PENDING', 'RUNNING'].includes(result?.meta?.state) && !hasVerifyingFindings) return undefined;
    const timer = window.setInterval(() => loadReview({ silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [loadReview, result?.meta?.state, hasVerifyingFindings]);

  const evidenceById = useMemo(
    () => new Map((result?.evidence || []).map((evidence) => [evidence.id, evidence])),
    [result]
  );
  const findings = result?.review?.findings || [];
  const isPending = ['PENDING', 'RUNNING'].includes(result?.meta?.state);

  const updateRailControls = useCallback(() => {
    const rail = findingsRailRef.current;
    if (!rail) return;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setCanScrollPrevious(rail.scrollLeft > 2);
    setCanScrollNext(rail.scrollLeft < maxScrollLeft - 2);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateRailControls);
    window.addEventListener('resize', updateRailControls);
    return () => {
      window.cancelAnimationFrame(frame);
      if (findingsAnimationRef.current) window.cancelAnimationFrame(findingsAnimationRef.current);
      window.removeEventListener('resize', updateRailControls);
    };
  }, [findings.length, updateRailControls]);

  const animateFindingsScroll = (rail, targetLeft) => {
    if (findingsAnimationRef.current) window.cancelAnimationFrame(findingsAnimationRef.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rail.scrollLeft = targetLeft;
      updateRailControls();
      return;
    }
    const startLeft = rail.scrollLeft;
    const distance = targetLeft - startLeft;
    const startedAt = window.performance.now();
    const animate = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / scrollAnimationDuration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      rail.scrollLeft = startLeft + distance * easedProgress;
      if (progress < 1) {
        findingsAnimationRef.current = window.requestAnimationFrame(animate);
      } else {
        findingsAnimationRef.current = null;
        updateRailControls();
      }
    };
    findingsAnimationRef.current = window.requestAnimationFrame(animate);
  };

  const scrollFindings = (direction) => {
    const rail = findingsRailRef.current;
    const firstCard = rail?.querySelector('[data-bria-finding-card]');
    if (!rail || !firstCard) return;
    const gap = Number.parseFloat(window.getComputedStyle(rail).columnGap || window.getComputedStyle(rail).gap) || 0;
    const cardStep = firstCard.getBoundingClientRect().width + gap;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const targetLeft = Math.min(maxScrollLeft, Math.max(0, rail.scrollLeft + direction * cardStep * cardsPerStep));
    animateFindingsScroll(rail, targetLeft);
  };

  const openFindingItem = (itemId) => {
    const target = document.getElementById(`item-${itemId}`);
    if (!target) return;
    const url = new URL(window.location.href);
    url.searchParams.set('item', itemId);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  };

  const runReview = async () => {
    if (!planId || isReviewing) return;
    setIsReviewing(true);
    setError('');
    try {
      const response = await axios.post(
        `${getApiBaseUrl()}/api/content/plans/${planId}/bria-review`, {}, authConfig()
      );
      setResult(response.data);
      setIsExpanded(true);
    } catch (requestError) {
      console.error('Bria content-plan review failed:', requestError.response?.data || requestError);
      setError(requestError.response?.data?.error || 'Bria no pudo revisar esta parrilla en este momento.');
      setIsExpanded(true);
    } finally {
      setIsReviewing(false);
    }
  };

  const applyFindingAction = async (finding, action, reason) => {
    if (!finding?.id || actingId) return;
    setActingId(finding.id);
    setError('');
    try {
      await axios.patch(
        `${getApiBaseUrl()}/api/content/plans/${planId}/bria-review/findings/${finding.id}`,
        { action, reason },
        authConfig()
      );
      setDismissFinding(null);
      await loadReview();
    } catch (requestError) {
      console.error('Bria finding action failed:', requestError.response?.data || requestError);
      setError(requestError.response?.data?.error || 'No fue posible actualizar esta recomendación.');
    } finally {
      setActingId(null);
    }
  };

  const confirmDismiss = () => {
    const reason = dismissReason === 'Otro motivo' ? customReason.trim() : dismissReason;
    applyFindingAction(dismissFinding, 'DISMISS', reason);
  };

  const reviewedDate = result?.meta?.reviewedAt
    ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.meta.reviewedAt))
    : null;

  return (
    <section
      aria-busy={isReviewing || result?.meta?.state === 'RUNNING'}
      className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="relative overflow-hidden bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-5 py-5 text-white sm:px-6">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4" aria-label="Revisión de Bria">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white dark:bg-white">
              <img src="/brainstudio-mascot-tip.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-base font-semibold sm:text-lg">Revisión de Bria</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/90 sm:text-sm">
                {result?.review
                  ? `Hola, revisé esta parrilla y encontré ${findings.length} ${findings.length === 1 ? 'oportunidad prioritaria' : 'oportunidades prioritarias'}.`
                  : 'Hola, revisaré estrategia, marca, redacción y coherencia para todo el equipo.'}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-3">
            {result?.review && (
              <div className="flex h-11 min-w-[72px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-semibold tabular-nums sm:text-base">
                {result.review.score ?? 0}/100
              </div>
            )}
            {result?.review ? (
              <Button
                type="button"
                onClick={runReview}
                disabled={isReviewing || !planId}
                aria-label="Revisar nuevamente"
                title="Revisar nuevamente"
                className="h-11 w-11 shrink-0 rounded-xl border border-white/35 bg-white p-0 text-teal-800 hover:bg-white/90 dark:bg-white dark:text-teal-800"
              >
                {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={runReview}
                disabled={isReviewing || !planId}
                className="min-h-11 flex-1 border border-white/35 bg-white text-teal-800 hover:bg-white/90 sm:flex-none dark:bg-white dark:text-teal-800"
              >
                {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isReviewing ? 'Revisando…' : 'Revisar parrilla'}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              aria-expanded={isExpanded}
              aria-controls="bria-content-plan-review-body"
              aria-label={isExpanded ? 'Cerrar' : 'Ver más'}
              title={isExpanded ? 'Cerrar' : 'Ver más'}
              className="h-11 w-11 shrink-0 rounded-xl border border-white/30 bg-white/10 p-0 text-white hover:bg-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <ChevronDown className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div id="bria-content-plan-review-body" aria-live="polite" className="space-y-5 px-5 pb-6 pt-5 sm:px-6">
          {isPending && !isReviewing && (
            <div className="flex items-start gap-3 rounded-2xl bg-cyan-50 p-4 text-sm text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
              <Loader2 className={`mt-0.5 h-5 w-5 shrink-0 ${result?.meta?.state === 'RUNNING' ? 'animate-spin' : ''}`} />
              <span>
                {result?.meta?.state === 'RUNNING'
                  ? 'Bria está actualizando la revisión compartida.'
                  : 'Hay cambios recientes. Bria actualizará esta revisión automáticamente en aproximadamente un minuto.'}
              </span>
            </div>
          )}

          {result?.meta?.state === 'FAILED' && (
            <div role="alert" className="brain-alert-surface flex items-start gap-3 rounded-2xl p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>No se pudo completar el último análisis automático. Puedes intentarlo de nuevo.</span>
            </div>
          )}
          {error && (
            <div role="alert" className="brain-alert-surface flex items-start gap-3 rounded-2xl p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!result?.review && !error && (
            <div className="rounded-2xl bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              La primera revisión ya está programada. Bria usará únicamente la memoria asociada con este cliente. No cambia el contenido ni crea tareas sin aprobación.
            </div>
          )}

          {result?.review && (
            <>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">
                      {verdictLabels[result.review.verdict] || 'Revisión lista'}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {result.meta?.memorySourcesUsed || 0} fuentes · {result.review.coverage ?? 0}% de cobertura
                    </span>
                  </div>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-700 dark:text-zinc-200">{result.review.summary}</p>
                  {reviewedDate && <p className="mt-2 text-[11px] text-zinc-400">Actualizada {reviewedDate}</p>}
                </div>
                {(result.review.coverage ?? 100) < 100 && (
                  <p className="max-w-sm rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    El puntaje solo pondera dimensiones con contexto suficiente; la cobertura indica cuánto pudo evaluar Bria sin inventar información.
                  </p>
                )}
              </div>

              {findings.length === 0 ? (
                <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  No hay ajustes prioritarios abiertos en la revisión compartida.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {findings.length} {findings.length === 1 ? 'hallazgo abierto' : 'hallazgos abiertos'}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Hallazgos anteriores"
                        disabled={!canScrollPrevious}
                        onClick={() => scrollFindings(-1)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:text-cyan-200"
                      >
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Siguientes hallazgos"
                        disabled={!canScrollNext}
                        onClick={() => scrollFindings(1)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:text-cyan-200"
                      >
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div
                    ref={findingsRailRef}
                    onScroll={updateRailControls}
                    aria-label="Hallazgos de Bria"
                    className="flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {findings.map((finding) => {
                      const sources = (finding.evidenceIds || []).map((id) => evidenceById.get(id)).filter(Boolean);
                      const verificationUi = getFindingVerificationUi(finding, result?.meta);
                      return (
                        <article data-bria-finding-card key={finding.id || finding.fingerprint} className="relative flex w-[84vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 sm:w-[360px] dark:border-zinc-800 dark:bg-zinc-900">
                          <button type="button" disabled={actingId === finding.id} onClick={() => { setDismissFinding(finding); setDismissReason(dismissReasons[0]); setCustomReason(''); }} className="absolute right-3 top-3 min-h-11 rounded-xl px-2.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60 dark:text-destructive dark:hover:bg-destructive/15">
                            Descartar
                          </button>
                          <div className="flex flex-wrap items-center gap-2 pr-20">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              {categoryLabels[finding.category] || finding.category}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${severityStyles[finding.severity] || severityStyles.INFO}`}>
                              {finding.severity === 'CRITICAL' ? 'Crítico' : finding.severity === 'WARNING' ? 'Atención' : 'Mejora'}
                            </span>
                            {verificationUi.label && (
                              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${verificationUi.isError ? 'bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive' : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200'}`}>{verificationUi.label}</span>
                            )}
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-zinc-950 dark:text-white">{finding.title}</h4>
                          <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{finding.detail}</p>
                          <p className="mt-3 flex-1 text-xs leading-5 text-zinc-800 dark:text-zinc-100">
                            <span className="font-semibold">Recomendación:</span> {finding.recommendation}
                          </p>
                          {verificationUi.description && (
                            <p role="status" className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{verificationUi.description}</p>
                          )}
                          {sources.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                              {sources.map((source) => (
                                <a key={source.id} href={source.sourceUrl || '#'} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-violet-700 hover:bg-violet-50 dark:bg-zinc-950 dark:text-violet-200 dark:hover:bg-violet-950/40">
                                  {source.title}<ExternalLink className="h-3 w-3" />
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-zinc-200/80 pt-3 sm:grid-cols-2 dark:border-zinc-800">
                            {finding.itemId && (
                              <button type="button" onClick={() => openFindingItem(finding.itemId)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800">
                                Ver pieza
                              </button>
                            )}
                            <button type="button" disabled={actingId === finding.id || verificationUi.busy} onClick={() => applyFindingAction(finding, 'MARK_CORRECTED')} className={`min-h-11 rounded-xl bg-cyan-100 px-3 text-xs font-semibold text-cyan-800 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-900 ${finding.itemId ? '' : 'sm:col-span-2'}`}>
                              {verificationUi.busy ? verificationUi.label : verificationUi.canRetry ? 'Reintentar verificación' : 'Corregido'}
                            </button>
                            {verificationUi.canUndo && (
                              <button type="button" disabled={actingId === finding.id} onClick={() => applyFindingAction(finding, 'UNDO_CORRECTION')} className="min-h-11 rounded-xl px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 sm:col-span-2 dark:text-zinc-300 dark:hover:bg-zinc-800">
                                Deshacer «corregido»
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Revisión consultiva global. No cambia el contenido ni crea tareas sin aprobación; el puntaje se recalcula al revisar nuevamente.
              </p>
            </>
          )}
        </div>
      )}

      <Dialog open={Boolean(dismissFinding)} onOpenChange={(open) => !open && setDismissFinding(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-lg">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-6 py-6 pr-28 text-white">
            <img src="/brainstudio-mascot-tip.png" alt="Mascota de Brainstudio" className="pointer-events-none absolute -bottom-4 right-2 h-24 w-24 object-contain drop-shadow-xl" />
            <DialogHeader className="relative z-10 text-left">
              <DialogTitle className="text-white">Descartar recomendación</DialogTitle>
              <DialogDescription className="max-w-sm text-white/90">
                El motivo quedará guardado para todo el equipo y evita que la misma observación reaparezca sin cambios.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 p-6">
            <label className="grid gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Motivo
              <select value={dismissReason} onChange={(event) => setDismissReason(event.target.value)} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-destructive/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white">
                {dismissReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </label>
            {dismissReason === 'Otro motivo' && (
              <label className="grid gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Explicación
                <textarea value={customReason} onChange={(event) => setCustomReason(event.target.value)} maxLength={300} rows={3} placeholder="Explica brevemente por qué no aplica…" className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-destructive/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDismissFinding(null)} className="min-h-11">Cancelar</Button>
              <Button type="button" disabled={actingId || (dismissReason === 'Otro motivo' && !customReason.trim())} onClick={confirmDismiss} className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:text-destructive-foreground">
                Confirmar descarte
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default BriaContentPlanReview;
