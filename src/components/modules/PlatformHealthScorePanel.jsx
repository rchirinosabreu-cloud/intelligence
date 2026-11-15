import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { CheckCircle2, ChevronDown, Circle, Loader2 } from '@/components/ui/icons';

/**
 * Salud de la plataforma (Rodny, 14 de noviembre de 2026: «ponlo en Salud operativa»): la nota de cada área
 * del health score y, al abrir una, qué criterios se cumplen y cuáles faltan. Solo administradores. La regla
 * vive en `scripts/health-score.mjs`; aquí solo se pinta, con la misma superficie del semáforo de servicios.
 */

const panelClass = 'rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const scoreFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const dayFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

const measuredOn = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? `medido el ${dayFormatter.format(date)}` : null;
};

const AreaTile = ({ area, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-expanded={selected}
    aria-controls="platform-health-detail"
    data-health-area={area.id}
    className={cn(
      'flex min-w-0 flex-col gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40',
      selected
        ? 'border-brand-cyan/60 bg-brand-cyan/5 dark:bg-brand-cyan/10'
        : 'border-zinc-200/80 bg-white hover:border-brand-cyan/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-cyan/40'
    )}
  >
    <span className="min-h-10 text-sm font-semibold leading-5 sm:min-h-0 text-zinc-900 dark:text-zinc-50">{area.name}</span>
    <span className="flex items-baseline gap-1">
      <span className="text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">{scoreFormatter.format(area.score)}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">de 10</span>
    </span>
    <span className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
      <span className="block h-full rounded-full bg-brand-cyan" style={{ width: `${Math.max(0, Math.min(100, area.score * 10))}%` }} />
    </span>
    <span className="text-xs text-zinc-500 dark:text-zinc-400">{area.met} de {area.total} criterios</span>
  </button>
);

const CriterionRow = ({ criterion }) => (
  <li className="flex min-w-0 items-start gap-3 py-2.5">
    {criterion.met
      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-positive-fg" aria-hidden="true" />
      : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />}
    <div className="min-w-0 flex-1">
      <p className="text-sm text-zinc-800 dark:text-zinc-100">{criterion.label}</p>
      {(criterion.kind === 'manual' || !criterion.met) && (
        <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {[criterion.detail, criterion.kind === 'manual' ? 'Lo confirma una persona.' : null].filter(Boolean).join(' ')}
        </p>
      )}
    </div>
    <span className={cn('shrink-0 text-xs font-semibold', criterion.met ? 'text-status-positive-fg' : 'text-zinc-500 dark:text-zinc-400')}>
      {criterion.met ? 'Cumplido' : 'Pendiente'}
    </span>
  </li>
);

const PlatformHealthScorePanel = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [openAreaId, setOpenAreaId] = useState(null);
  // En la demo no se muestra (la abre un cliente potencial). El distintivo «Demo» del header ya dejó
  // leído `/api/health`; el servidor además responde `available: false`.
  const isDemo = Boolean(useQueryClient().getQueryData(['app-health'])?.demo);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-health'],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/platform-health`, { headers: authHeaders(), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[HealthScore] Error al leer la salud de la plataforma:', payload);
        throw new Error(payload.error || 'No fue posible leer la salud de la plataforma.');
      }
      return payload;
    },
    enabled: isAdmin && !isDemo,
    staleTime: 5 * 60_000
  });

  if (!isAdmin) return null;
  if (isDemo || data?.available === false) return null;

  const areas = data?.areas || [];
  const openArea = areas.find((area) => area.id === openAreaId) || null;
  // Primero lo que falta: es lo que hay que leer.
  const criteria = openArea ? [...openArea.criteria].sort((a, b) => Number(a.met) - Number(b.met)) : [];
  const summary = data && [`${data.met} de ${data.total} criterios cumplidos`, measuredOn(data.measuredAt)].filter(Boolean).join(' · ');

  return (
    <section className={cn(panelClass, 'mb-4 p-5 sm:p-6')} aria-labelledby="platform-health-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="platform-health-title" className="text-lg font-semibold text-zinc-950 dark:text-white">Salud de la plataforma</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {isLoading ? 'Leyendo la medición…' : error ? error.message : summary}
          </p>
        </div>
        {data && (
          <p className="flex shrink-0 items-baseline gap-1.5" aria-label={`Nota general: ${scoreFormatter.format(data.average)} de 10`}>
            <span className="text-3xl font-bold tabular-nums text-zinc-950 dark:text-white">{scoreFormatter.format(data.average)}</span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">de 10</span>
          </p>
        )}
      </div>

      {isLoading && (
        <div className="mt-5 flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      )}

      {data && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {areas.map((area) => (
            <AreaTile
              key={area.id}
              area={area}
              selected={area.id === openAreaId}
              onSelect={() => setOpenAreaId((current) => (current === area.id ? null : area.id))}
            />
          ))}
        </div>
      )}

      {data && !openArea && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          Elige un área para ver qué se cumple y qué falta.
        </p>
      )}

      {openArea && (
        <div id="platform-health-detail" className="mt-4 rounded-lg border border-zinc-200/80 px-4 py-2 dark:border-zinc-800" data-health-detail={openArea.id}>
          <h3 className="pt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {openArea.name} · {openArea.met} de {openArea.total} criterios
          </h3>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {criteria.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} />)}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlatformHealthScorePanel;
