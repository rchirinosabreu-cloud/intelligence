import React from 'react';
import { Card } from '@/components/ui/Card';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Plus, AlertCircle, ChevronRight } from '@/components/ui/icons';
import CrmFilters from './CrmFilters';
import { useCrmLeads } from './crmApi';
import { StageBadge, TrafficLightBadge, PriorityBadge, FollowUpLabel, OriginBadge, leadTitle, leadSubtitle } from './crmPresentation';

const Empty = ({ onCreate, filtered }) => (
  <div className="px-6 py-14 text-center">
    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{filtered ? 'Ninguna oportunidad coincide con estos filtros.' : 'Todavía no hay oportunidades registradas.'}</p>
    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{filtered ? 'Prueba limpiando los filtros.' : 'Registra la primera y el CRM empieza a medir desde hoy.'}</p>
    {!filtered && onCreate && (
      <button type="button" onClick={onCreate} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-transform hover:shadow-md active:scale-95">
        <Plus className="h-4 w-4" /> Nueva oportunidad
      </button>
    )}
  </div>
);

const CrmLeadList = ({ filters, onFiltersChange, team, onOpenLead, onCreate }) => {
  const { data, isLoading, error } = useCrmLeads(filters);
  const items = data?.items || [];
  const filtered = Object.values(filters).some(value => value && value.trim() !== '');

  return (
    <div className="space-y-4">
      <CrmFilters filters={filters} onChange={onFiltersChange} team={team} />

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{isLoading ? 'Cargando…' : `${data?.total ?? 0} ${data?.total === 1 ? 'oportunidad' : 'oportunidades'} · ordenadas por urgencia`}</span>
      </div>

      {error && (
        <div className="brain-alert-surface rounded-2xl p-4 text-sm">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> No pudimos cargar las oportunidades</div>
          <p className="mt-1 pl-6">{error.message}</p>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-3">Empresa / contacto</th>
                <th className="px-3 py-3">Etapa</th>
                <th className="px-3 py-3">Semáforo</th>
                <th className="px-3 py-3">Prioridad</th>
                <th className="px-3 py-3">Responsable</th>
                <th className="px-3 py-3">Próxima acción</th>
                <th className="px-3 py-3">Seguimiento</th>
                <th className="px-3 py-3" aria-label="Abrir" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {isLoading ? (
                <tr><td colSpan="8" className="px-6 py-12 text-center text-zinc-400">Cargando oportunidades…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="8"><Empty onCreate={onCreate} filtered={filtered} /></td></tr>
              ) : items.map(lead => (
                <tr key={lead.id} onClick={() => onOpenLead?.(lead.id)} className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</p>
                      <OriginBadge origin={lead.origin} />
                    </div>
                    <p className="text-xs text-zinc-500">{leadSubtitle(lead) || lead.serviceInterest || lead.code}</p>
                  </td>
                  <td className="px-3 py-3"><StageBadge stage={lead.stage} /></td>
                  <td className="px-3 py-3"><TrafficLightBadge light={lead.trafficLight} /></td>
                  <td className="px-3 py-3"><PriorityBadge priority={lead.priority} /></td>
                  <td className="px-3 py-3">
                    {lead.owner ? (
                      <span className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200"><TeamAvatar member={lead.owner} className="h-7 w-7" size={28} showTitle={false} /> <span className="hidden xl:inline">{lead.owner.name.split(' ')[0]}</span></span>
                    ) : <span className="text-xs text-zinc-400">Sin asignar</span>}
                  </td>
                  <td className="max-w-[16rem] px-3 py-3 text-zinc-700 dark:text-zinc-200"><p className="line-clamp-2 text-xs leading-5">{lead.nextAction || <span className="text-zinc-400">Sin próxima acción</span>}</p></td>
                  <td className="px-3 py-3"><FollowUpLabel lead={lead} /></td>
                  <td className="px-3 py-3 text-zinc-300 group-hover:text-primary dark:text-zinc-600"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 md:hidden">
          {isLoading ? (
            <li className="px-6 py-12 text-center text-sm text-zinc-400">Cargando oportunidades…</li>
          ) : items.length === 0 ? (
            <li><Empty onCreate={onCreate} filtered={filtered} /></li>
          ) : items.map(lead => (
            <li key={lead.id}>
              <button type="button" onClick={() => onOpenLead?.(lead.id)} className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</p>
                    <p className="truncate text-xs text-zinc-500">{leadSubtitle(lead) || lead.serviceInterest || lead.code}</p>
                  </div>
                  <TrafficLightBadge light={lead.trafficLight} showMode={false} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={lead.stage} />
                  <PriorityBadge priority={lead.priority} />
                  <OriginBadge origin={lead.origin} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <p className="line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{lead.nextAction || 'Sin próxima acción'}</p>
                  <FollowUpLabel lead={lead} className="shrink-0 items-end text-right" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default CrmLeadList;
