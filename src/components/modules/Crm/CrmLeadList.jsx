import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, AlertCircle, ChevronRight, Archive, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import CrmFilters from './CrmFilters';
import { useCrmLeads, useArchiveLeads } from './crmApi';
import { StageBadge, TrafficLightBadge, PriorityBadge, FollowUpLabel, OriginBadge, RequestBadge, SilenceBadge, ArchivedBadge, leadTitle, leadSubtitle } from './crmPresentation';

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

const checkboxClass = 'h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-900';

const CrmLeadList = ({ filters, onFiltersChange, team, onOpenLead, onCreate }) => {
  const { data, isLoading, error } = useCrmLeads(filters);
  const confirm = useConfirmDialog();
  const archiveMany = useArchiveLeads();
  const items = data?.items || [];
  const filtered = Object.values(filters).some(value => value && value.trim() !== '');
  const viewingArchived = filters.archived === 'SOLO';

  // Varias de una vez (reunión del 4 de noviembre de 2026: 55 oportunidades viejas pidiendo seguimiento). La selección
  // vive aquí y se poda contra la lista visible: lo que un filtro saca de la vista no se archiva por estar marcado.
  const [chosen, setChosen] = useState(() => new Set());
  const selectable = items.filter(lead => !lead.archivedAt);
  const selected = selectable.filter(lead => chosen.has(lead.id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const toggle = id => setChosen(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setChosen(allSelected ? new Set() : new Set(selectable.map(lead => lead.id)));

  const archiveSelected = async () => {
    const count = selected.length;
    const accepted = await confirm({
      title: count === 1 ? 'Archivar 1 oportunidad' : `Archivar ${count} oportunidades`,
      description: 'Salen de las listas, de las métricas y de los avisos. Sus datos y su historial se conservan y se pueden desarchivar desde el filtro «Archivadas».',
      confirmLabel: 'Archivar',
      tone: 'neutral'
    });
    if (!accepted) return;
    try {
      const result = await archiveMany.mutateAsync({ ids: selected.map(lead => lead.id) });
      toast.success(result.archived === 1 ? '1 oportunidad archivada' : `${result.archived} oportunidades archivadas`);
      setChosen(new Set());
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  return (
    <div className="space-y-4">
      <CrmFilters filters={filters} onChange={onFiltersChange} team={team} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{isLoading ? 'Cargando…' : `${data?.total ?? 0} ${data?.total === 1 ? 'oportunidad' : 'oportunidades'} · ${viewingArchived ? 'la archivada más reciente primero' : 'ordenadas por urgencia'}`}</span>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950" data-crm-selection>
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">{selected.length} {selected.length === 1 ? 'seleccionada' : 'seleccionadas'}</span>
            <button type="button" onClick={archiveSelected} disabled={archiveMany.isPending} data-crm-archive-selected className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-800">
              <Archive className="h-3.5 w-3.5" /> Archivar
            </button>
            <button type="button" onClick={() => setChosen(new Set())} aria-label="Quitar la selección" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
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
                <th className="w-10 px-4 py-3">
                  {selectable.length > 0 && <input type="checkbox" className={checkboxClass} checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todas las oportunidades visibles" />}
                </th>
                <th className="px-2 py-3">Empresa / contacto</th>
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
                <tr><td colSpan="9" className="px-6 py-12 text-center text-zinc-400">Cargando oportunidades…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="9"><Empty onCreate={onCreate} filtered={filtered} /></td></tr>
              ) : items.map(lead => (
                <tr key={lead.id} onClick={() => onOpenLead?.(lead.id)} className={cn('group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50', lead.archivedAt && 'opacity-70')}>
                  <td className="px-4 py-3" onClick={event => event.stopPropagation()}>
                    {!lead.archivedAt && <input type="checkbox" className={checkboxClass} checked={chosen.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Seleccionar ${leadTitle(lead)}`} />}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</p>
                      <OriginBadge origin={lead.origin} />
                      <RequestBadge lead={lead} />
                      <ArchivedBadge lead={lead} />
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
                  <td className="px-3 py-3"><FollowUpLabel lead={lead} /><SilenceBadge lead={lead} alertDays={data?.alertDays} className="mt-1" /></td>
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
            <li key={lead.id} className="flex items-start gap-2 px-3">
              {!lead.archivedAt && (
                <label className="flex min-h-11 min-w-11 items-center justify-center pt-1">
                  <input type="checkbox" className={checkboxClass} checked={chosen.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Seleccionar ${leadTitle(lead)}`} />
                </label>
              )}
              <button type="button" onClick={() => onOpenLead?.(lead.id)} className={cn('flex min-w-0 flex-1 flex-col gap-2 px-1 py-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50', lead.archivedAt && 'opacity-70')}>
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
                  <RequestBadge lead={lead} />
                  <ArchivedBadge lead={lead} />
                  <SilenceBadge lead={lead} alertDays={data?.alertDays} />
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
