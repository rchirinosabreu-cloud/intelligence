import React, { useState } from 'react';
import Select from '@/components/ui/Select';
import { Search, X, Filter, ChevronDown } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { CRM_STAGES, CRM_ORIGINS, CRM_PRIORITIES, CRM_TRAFFIC_LIGHTS, inputClass } from './crmPresentation';
import { defaultCrmFilters } from '@/lib/crmFilterSession';

const Field = ({ label, children, className }) => (
  <label className={cn('flex min-w-0 flex-col gap-1', className)}>
    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</span>
    {children}
  </label>
);

const selectClass = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100';

/**
 * Shared filter bar for the dashboard, the list and the follow-ups.
 * `show` limits which controls render; the same `filters` object feeds every CRM query.
 */
const CrmFilters = ({ filters, onChange, team = [], show = ['search', 'stage', 'origin', 'priority', 'ownerId', 'trafficLight', 'dates'], className }) => {
  const [expanded, setExpanded] = useState(false);
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const has = key => show.includes(key);
  const active = Object.entries(filters).filter(([, value]) => value && value.trim() !== '').length;
  const hidden = Object.entries(filters).filter(([key, value]) => key !== 'search' && value && value.trim() !== '').length;

  return (
    <div className={cn('rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4', className)}>
      <div className="flex items-end gap-2 md:hidden">
        {has('search') && (
          <Field label="Buscar" className="flex-1">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input type="search" value={filters.search || ''} onChange={event => set('search', event.target.value)} placeholder="Empresa, contacto, correo…" className={cn(inputClass, 'pl-9')} />
            </span>
          </Field>
        )}
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors', hidden ? 'border-primary/40 bg-primary/10 text-primary' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300', !has('search') && 'flex-1 justify-center')}>
          <Filter className="h-3.5 w-3.5" /> Filtros{hidden ? ` (${hidden})` : ''} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>
      <div className={cn('gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', expanded ? 'mt-3 grid' : 'hidden', 'md:mt-0 md:grid')}>
        {has('search') && (
          <Field label="Buscar" className="hidden sm:col-span-2 md:flex xl:col-span-2">
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input type="search" value={filters.search || ''} onChange={event => set('search', event.target.value)} placeholder="Empresa, contacto, correo, código…" className={cn(inputClass, 'pl-9')} />
            </span>
          </Field>
        )}
        {has('stage') && (
          <Field label="Etapa">
            <Select value={filters.stage || ''} onChange={event => set('stage', event.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {CRM_STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </Select>
          </Field>
        )}
        {has('origin') && (
          <Field label="Origen">
            <Select value={filters.origin || ''} onChange={event => set('origin', event.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {CRM_ORIGINS.map(origin => <option key={origin.value} value={origin.value}>{origin.label}</option>)}
            </Select>
          </Field>
        )}
        {has('priority') && (
          <Field label="Prioridad">
            <Select value={filters.priority || ''} onChange={event => set('priority', event.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {CRM_PRIORITIES.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
            </Select>
          </Field>
        )}
        {has('ownerId') && (
          <Field label="Responsable">
            <Select value={filters.ownerId || ''} onChange={event => set('ownerId', event.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              <option value="SIN_RESPONSABLE">Sin responsable</option>
            </Select>
          </Field>
        )}
        {has('trafficLight') && (
          <Field label="Semáforo">
            <Select value={filters.trafficLight || ''} onChange={event => set('trafficLight', event.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {CRM_TRAFFIC_LIGHTS.map(light => <option key={light.value} value={light.value}>{light.label}</option>)}
            </Select>
          </Field>
        )}
        {has('dates') && (
          <>
            <Field label="Ingreso desde">
              <input type="date" value={filters.from || ''} onChange={event => set('from', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Ingreso hasta">
              <input type="date" value={filters.to || ''} onChange={event => set('to', event.target.value)} className={inputClass} />
            </Field>
          </>
        )}
      </div>
      {active > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{active} {active === 1 ? 'filtro activo' : 'filtros activos'}</span>
          <button type="button" onClick={() => onChange(defaultCrmFilters())} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white">
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        </div>
      )}
    </div>
  );
};

export default CrmFilters;
