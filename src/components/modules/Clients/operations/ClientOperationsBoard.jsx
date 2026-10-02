import React, { useMemo, useState } from 'react';
import { ChevronRight, Search, User as UserIcon, Building2 } from '@/components/ui/icons';
import Select from '@/components/ui/Select';
import ClientAvatar from '@/components/ui/ClientAvatar';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { CLIENT_AGENCIES, CLIENT_COMPLEXITY, OPERATION_LEVELS, OPERATION_STAGES, isMeasured, labelOf } from '@/lib/clientOperations';
import { LEVEL_META, STAGE_TONE } from './operationTones';
import CycleBar from './CycleBar';

// Pestaña «Operación» de Clientes (borrador del 2 de octubre de 2026): la hoja MIO e INDICADORES del
// Excel, pero calculada. Cada fila abre la página completa del cliente.

const SUMMARY_HINT = {
  red: 'Piezas atrasadas o un mes sin cerrar',
  yellow: 'Algo que mirar antes de que se caiga',
  green: 'Van al ritmo de lo contratado',
  gray: 'En stand by o sin contrato cargado',
};

const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(15rem,1.3fr)_4rem_minmax(0,1.1fr)_5.5rem_5.5rem_minmax(0,1.4fr)_1rem] lg:items-center lg:gap-5';
const FILTER_SELECT = 'min-h-11 border-none bg-transparent pl-0 pr-9 text-sm';

function MonthCell({ cycle }) {
  if (!cycle) return <span className="text-xs text-zinc-400">—</span>;
  const closed = cycle.reached.publicada >= cycle.quota;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold tabular-nums', closed ? LEVEL_META.green.soft : LEVEL_META.red.soft)}
      title={closed ? `${cycle.label}: cerrado` : `${cycle.label}: ${cycle.reached.publicada} de ${cycle.quota} publicadas`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', closed ? LEVEL_META.green.dot : LEVEL_META.red.dot)} />
      {cycle.label.slice(0, 3)} {cycle.reached.publicada}/{cycle.quota}
    </span>
  );
}

function ClientRow({ client, evaluation, onOpen }) {
  const meta = LEVEL_META[evaluation.level];
  const { current, previous } = client.cycles || {};
  const tasks = client.openTasks || [];
  const overdue = tasks.filter((t) => t.overdue).length;
  const [first, ...rest] = evaluation.reasons;
  const measured = isMeasured(client) && current;
  const tags = [labelOf(CLIENT_AGENCIES, client.agency), client.complexity && `Complejidad ${labelOf(CLIENT_COMPLEXITY, client.complexity).toLowerCase()}`].filter(Boolean).join(' · ');
  return (
    <li className="border-b border-zinc-100 last:border-b-0 dark:border-white/5">
      <button type="button" onClick={onOpen}
        className={cn('grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/[0.03] sm:px-6', ROW_GRID)}>
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
          <ClientAvatar client={client} size={32} className="shrink-0 rounded-lg border border-zinc-200 dark:border-white/10" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-zinc-900 dark:text-zinc-50" title={client.name}>{client.name}</span>
            <span className="block truncate text-xs"><span className={cn('font-medium', meta.text)}>{meta.label}</span>{tags && <span className="text-zinc-400"> · {tags}</span>}</span>
          </span>
        </span>

        <ChevronRight className="h-4 w-4 self-center text-zinc-400 lg:order-last" aria-hidden="true" />

        <span className="col-span-2 flex -space-x-2 lg:col-span-1" aria-label={`PM ${client.projectManager?.name || 'sin asignar'}, CM ${client.communityManager?.name || 'sin asignar'}`}>
          {[client.projectManager, client.communityManager].map((member, index) => member
            ? <TeamAvatar key={index} member={member} size={28} className="ring-2 ring-white dark:ring-zinc-900" />
            : <span key={index} className="h-7 w-7 rounded-full border border-dashed border-zinc-300 bg-white dark:border-white/15 dark:bg-zinc-900" />)}
        </span>

        <span className="col-span-2 min-w-0 lg:col-span-1">
          {measured ? (
            <>
              <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">{current.label}</span>
                <span className="tabular-nums text-zinc-500">{current.reached.publicada} de {current.quota} publicadas</span>
              </span>
              <CycleBar cycle={current} />
            </>
          ) : <span className="text-xs text-zinc-400">{client.contract?.serviceType === 'SERVICIOS' ? 'Servicios: se sigue por tareas' : 'Sin medir'}</span>}
        </span>

        <span className="hidden lg:block">{measured ? <MonthCell cycle={previous} /> : <span className="text-xs text-zinc-400">—</span>}</span>

        <span className="hidden text-xs lg:block">
          <span className="block text-zinc-700 dark:text-zinc-200">{tasks.length === 1 ? '1 abierta' : `${tasks.length} abiertas`}</span>
          {overdue > 0 && <span className="block font-semibold text-destructive">{overdue === 1 ? '1 vencida' : `${overdue} vencidas`}</span>}
        </span>

        <span className="col-span-2 min-w-0 text-sm text-zinc-700 dark:text-zinc-300 lg:col-span-1">
          {first ? <span className="line-clamp-2">{first.text}{rest.length > 0 && <span className="text-zinc-400"> · y {rest.length} más</span>}</span> : <span className="text-zinc-400">Todo al día.</span>}
          {client.latestObservation && (
            <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400" title={client.latestObservation.text}>
              <span className="font-medium">Observación:</span> {client.latestObservation.text}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export default function ClientOperationsBoard({ evaluated, team, onOpenClient }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [agency, setAgency] = useState('all');
  const [pmId, setPmId] = useState('all');
  const [cmId, setCmId] = useState('all');

  const counts = useMemo(() => Object.fromEntries(OPERATION_LEVELS.map((key) => [key, evaluated.filter((e) => e.evaluation.level === key).length])), [evaluated]);
  const pms = useMemo(() => team.filter((m) => evaluated.some(({ client }) => client.projectManager?.id === m.id)), [team, evaluated]);
  const cms = useMemo(() => team.filter((m) => evaluated.some(({ client }) => client.communityManager?.id === m.id)), [team, evaluated]);

  const visible = evaluated.filter(({ client, evaluation }) =>
    (level === 'all' || evaluation.level === level)
    && (agency === 'all' || client.agency === agency)
    && (pmId === 'all' || client.projectManager?.id === pmId)
    && (cmId === 'all' || client.communityManager?.id === cmId)
    && client.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Filtrar por estado">
        {OPERATION_LEVELS.map((key) => {
          const meta = LEVEL_META[key];
          const active = level === key;
          return (
            <button key={key} type="button" aria-pressed={active} onClick={() => setLevel(active ? 'all' : key)}
              className={cn('brain-glass flex min-h-[5.5rem] flex-col justify-between p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active && 'ring-2 ring-zinc-900/80 dark:ring-white/70')}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100"><span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />{meta.label}</span>
                <span className={cn('text-2xl font-bold tabular-nums', key === 'gray' ? 'text-zinc-500' : meta.text)}>{counts[key]}</span>
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{SUMMARY_HINT[key]}</span>
            </button>
          );
        })}
      </div>

      <div className="brain-glass flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente…"
            className="min-h-11 w-full rounded-xl border border-transparent bg-zinc-100 pl-10 pr-4 text-sm text-zinc-900 focus:border-primary/40 focus:outline-none dark:bg-white/5 dark:text-zinc-100" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:flex">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 pl-3 dark:bg-white/5">
            <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
            <Select value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Agencia" className={FILTER_SELECT}>
              <option value="all">Brain y MIO</option>
              {CLIENT_AGENCIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 pl-3 dark:bg-white/5">
            <UserIcon className="h-4 w-4 shrink-0 text-zinc-400" />
            <Select value={pmId} onChange={(e) => setPmId(e.target.value)} aria-label="Project manager" className={FILTER_SELECT}>
              <option value="all">Todos los PM</option>
              {pms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 pl-3 dark:bg-white/5">
            <UserIcon className="h-4 w-4 shrink-0 text-zinc-400" />
            <Select value={cmId} onChange={(e) => setCmId(e.target.value)} aria-label="Community manager" className={FILTER_SELECT}>
              <option value="all">Todos los CM</option>
              {cms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" aria-label="Clientes">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:border-white/5 sm:px-6">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Cada pieza va del color de la etapa a la que llegó:</span>
          {OPERATION_STAGES.map((stage) => (
            <span key={stage.key} className="flex items-center gap-1.5" title={stage.hint}><span className={cn('h-2 w-2 rounded-full', STAGE_TONE[stage.key])} />{stage.label}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', STAGE_TONE.creada)} />Sin redactar</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-zinc-300 dark:border-white/20" />Falta crearla</span>
        </div>
        <div className={cn('hidden border-b border-zinc-100 bg-zinc-50/60 px-6 py-3 text-xs font-medium text-zinc-500 dark:border-white/5 dark:bg-white/[0.02]', ROW_GRID)}>
          <span>Cliente</span><span>Equipo</span><span>Este mes</span><span>Mes anterior</span><span>Tareas</span><span>Lo más urgente</span><span />
        </div>
        {visible.length ? (
          <ul>
            {visible.map(({ client, evaluation }) => (
              <ClientRow key={client.id} client={client} evaluation={evaluation} onOpen={() => onOpenClient(client)} />
            ))}
          </ul>
        ) : (
          <p className="p-12 text-center text-sm text-zinc-500">Ningún cliente con estos filtros.</p>
        )}
      </section>
    </div>
  );
}
