import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Select from '@/components/ui/Select';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { externalPeriodOptions, periodDestination, planPeriodOptions } from '@/lib/contentPlanNavigation';

export default function PlanPeriodSelector({ plan, external = false, disabled = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const clientId = plan?.clientId || plan?.client?.id;
  const clientSlug = plan?.client?.slug;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: external ? ['external-plan-periods', clientSlug] : ['content-plans', clientId],
    enabled: Boolean(clientId && (!external || clientSlug)),
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/${external ? `external-plans/${encodeURIComponent(clientSlug)}/periods` : 'plans'}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      ...(external ? {} : { params: { clientId } }),
    })).data,
    staleTime: 30_000,
    retry: false,
  });
  const buildOptions = external ? externalPeriodOptions : planPeriodOptions;
  const options = buildOptions(plan, external ? (data ? [data] : []) : data);
  const current = buildOptions(plan)[0]?.value || '';
  return (
    <div className="w-full min-w-0 sm:w-56" data-plan-period-selector>
      <Select id="plan-period" aria-label="Período de la parrilla" value={current} disabled={disabled || isLoading || isError || options.length < 2}
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
        onChange={event => {
          if (event.target.value === current || !options.some(option => option.value === event.target.value)) return;
          // Es una selección dentro del cliente, no otro origen en la cadena de regreso.
          navigate(periodDestination(event.target.value, location.search), { state: location.state });
        }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      {disabled ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Termina la edición o entrega antes de cambiar de período.</p>
        : isError ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400" role="status">No pudimos consultar otros períodos. <button type="button" onClick={() => refetch()} className="font-medium text-brand-cyan-deep underline dark:text-brand-cyan">Reintentar</button></p>
          : !isLoading && options.length < 2 ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No hay otros períodos disponibles.</p> : null}
    </div>
  );
}
