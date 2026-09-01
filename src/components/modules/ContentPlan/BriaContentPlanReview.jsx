import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Sparkles
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

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
  INFO: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  WARNING: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  CRITICAL: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
};

const BriaContentPlanReview = ({ planId, planUpdatedAt }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
  }, [planUpdatedAt]);

  const evidenceById = useMemo(
    () => new Map((result?.evidence || []).map((evidence) => [evidence.id, evidence])),
    [result]
  );

  const runReview = async () => {
    if (!planId || isReviewing) return;
    setIsReviewing(true);
    setError('');
    try {
      const response = await axios.post(
        `${getApiBaseUrl()}/api/content/plans/${planId}/bria-review`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } }
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

  return (
    <section
      aria-busy={isReviewing}
      className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/60 dark:border-white/10 dark:bg-zinc-900/40"
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
          aria-expanded={isExpanded}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:text-violet-300">
            <Brain className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-zinc-950 dark:text-white">Revisión de Bria</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Contrasta estrategia, marca, redacción y coherencia con la memoria del cliente.
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        <Button
          type="button"
          onClick={runReview}
          disabled={isReviewing || !planId}
          className="h-11 w-full shrink-0 sm:w-auto"
        >
          {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {isReviewing ? 'Revisando…' : result ? 'Revisar de nuevo' : 'Revisar parrilla'}
        </Button>
      </div>

      {isExpanded && (
        <div aria-live="polite" className="border-t border-zinc-200/70 px-5 pb-6 pt-5 dark:border-white/10 sm:px-6">
          {!result && !error && !isReviewing && (
            <div className="rounded-2xl bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
              Bria recuperará únicamente evidencia asociada con este cliente y revisará la parrilla actual. No cambia el contenido: las recomendaciones quedan para decisión humana.
            </div>
          )}

          {isReviewing && (
            <div className="flex min-h-32 items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
              Recuperando contexto y revisando la parrilla…
            </div>
          )}

          {error && !isReviewing && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && !isReviewing && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                      {verdictLabels[result.review?.verdict] || 'Revisión lista'}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {result.meta?.memorySourcesUsed || 0} fuentes de memoria utilizadas
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{result.review?.summary}</p>
                </div>
                <div className="flex h-20 min-w-24 flex-col items-center justify-center rounded-2xl bg-zinc-950 px-5 text-white dark:bg-white dark:text-zinc-950">
                  <span className="text-2xl font-semibold">{result.review?.score ?? 0}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">de 100</span>
                </div>
              </div>

              {(result.review?.findings || []).length === 0 ? (
                <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  No se encontraron ajustes prioritarios en esta revisión.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {result.review.findings.map((finding, index) => {
                    const sources = (finding.evidenceIds || []).map((id) => evidenceById.get(id)).filter(Boolean);
                    return (
                      <article key={`${finding.title}-${index}`} className="rounded-2xl bg-zinc-50/90 p-4 dark:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            {categoryLabels[finding.category] || finding.category}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${severityStyles[finding.severity] || severityStyles.INFO}`}>
                            {finding.severity === 'CRITICAL' ? 'Crítico' : finding.severity === 'WARNING' ? 'Atención' : 'Mejora'}
                          </span>
                          {finding.itemId && <span className="text-[10px] text-zinc-400">Pieza vinculada</span>}
                        </div>
                        <h4 className="mt-3 text-sm font-semibold text-zinc-950 dark:text-white">{finding.title}</h4>
                        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{finding.detail}</p>
                        <p className="mt-3 text-xs leading-5 text-zinc-800 dark:text-zinc-100">
                          <span className="font-semibold">Recomendación:</span> {finding.recommendation}
                        </p>
                        {sources.length > 0 && (
                          <div className="mt-4 border-t border-zinc-200/70 pt-3 dark:border-white/10">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Evidencia</p>
                            <div className="flex flex-wrap gap-2">
                              {sources.map((source) => (
                                <a
                                  key={source.id}
                                  href={source.sourceUrl || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-violet-700 hover:bg-violet-50 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/30"
                                >
                                  {source.title}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-zinc-400">
                Revisión consultiva generada por Bria. No cambia el contenido ni crea tareas sin aprobación.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default BriaContentPlanReview;
