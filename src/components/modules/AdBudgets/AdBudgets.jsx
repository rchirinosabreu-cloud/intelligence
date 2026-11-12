import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronDown, Edit, ExternalLink, Loader2, Megaphone, Plus, Trash2 } from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/Select';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Button } from '@/components/ui/button';
import { FinancialSummaryCard } from '@/components/modules/financial/FinancialSectionParts';
import { LEVEL_META } from '@/components/modules/Clients/operations/operationTones';
import { AD_CAMPAIGN_STATUSES, AD_PAYERS, AD_PLATFORMS, campaignFlags, formatAdMoney, labelOfAd, shortDay, toCents } from '@/lib/adBudgets';
import { cn } from '@/lib/utils';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AdEditContext, useAdBudgetDetail, useAdBudgets, useAdMeta, useCanEditAds, useDeleteAdReading, useReopenAdCycle } from './adBudgetsApi';
import { AdBudgetDialog, AdCampaignDialog, AdCarryOverDialog, AdCycleDialog, AdSpendDialog } from './AdBudgetDialogs';
import { AdMetaBudgetDialog, AdMetaLinkDialog, MetaBudgetSection, MetaReadingNotes, MetaStatus, MetaUnassignedDialog } from './AdBudgetMeta';

// Pautas (reunión del 6 de noviembre de 2026): el presupuesto global de cada cliente contra su cierre. Primero lo que hay
// que hacer hoy; las campañas y el historial se abren por pauta. Todo lo calculado viene del servidor.

const FILTERS = {
  revisar: (budget) => budget.evaluation.reviewDue || Boolean(budget.pendingClose) || budget.evaluation.flags.length > 0,
  atrasadas: (budget) => budget.evaluation.state === 'ATRASADA',
  pasadas: (budget) => budget.evaluation.state === 'PASADA',
  cierran: (budget) => budget.evaluation.closingWindow
};

const closeText = ({ daysToClose, closed }) => {
  if (closed) return 'Ciclo cerrado';
  if (daysToClose < 0) return 'Ciclo terminado';
  if (daysToClose === 0) return 'Cierra hoy';
  return daysToClose === 1 ? 'Cierra mañana' : `Cierra en ${daysToClose} días`;
};

const readingText = ({ hasReading, asOf, daysSinceReading }, source) => {
  if (!hasReading) return 'Sin gasto registrado';
  const from = source === 'META' ? 'Según Meta, a' : 'A';
  if (daysSinceReading === 0) return `${from}ctualizado hoy`;
  return daysSinceReading === 1 ? `${from}ctualizado ayer` : `${from}ctualizado el ${shortDay(asOf)}`;
};

/** La barra: lo gastado, y una marca de dónde debería ir hoy. */
function SpendBar({ evaluation }) {
  const { percent, availableCents, expectedCents, level } = evaluation;
  const expected = availableCents > 0 ? Math.min((expectedCents / availableCents) * 100, 100) : 0;
  const fill = { red: 'bg-destructive', yellow: 'bg-brand-yellow', green: 'bg-brand-green', gray: 'bg-zinc-300 dark:bg-zinc-600' }[level];
  return (
    <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-white/10" role="img" aria-label={`Gastado ${percent} %; el ritmo parejo iría en ${Math.round(expected)} %`}>
      <div className={cn('h-2 rounded-full', fill)} style={{ width: `${Math.min(percent, 100)}%` }} />
      {level !== 'gray' && <span data-ad-pace-mark className="absolute -top-1 h-4 w-0.5 rounded bg-zinc-700 dark:bg-zinc-200" style={{ left: `${expected}%` }} />}
    </div>
  );
}

function Campaigns({ budget, onEdit, onAdd }) {
  const canEdit = useCanEditAds();
  return (
    <section aria-label="Campañas" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Campañas</h4>
        {canEdit && <button type="button" data-ad-campaign-add onClick={onAdd} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep dark:text-brand-cyan"><Plus className="h-4 w-4" /> Añadir</button>}
      </div>
      {!budget.campaigns.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin campañas registradas. Son opcionales: el seguimiento es del presupuesto global.</p>}
      <ul className="space-y-2">
        {budget.campaigns.map((campaign) => {
          const flags = campaignFlags(campaign, budget.cycle, budget.today);
          return (
            <li key={campaign.id} data-ad-campaign={campaign.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{campaign.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {labelOfAd(AD_CAMPAIGN_STATUSES, campaign.status)}
                    {campaign.objective && ` · ${campaign.objective}`}
                    {campaign.endDate && ` · hasta el ${shortDay(campaign.endDate)}`}
                    {campaign.planned ? ` · ${formatAdMoney(toCents(campaign.planned), budget.currency)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {campaign.link && <a href={campaign.link} target="_blank" rel="noreferrer" aria-label={`Abrir la publicación de ${campaign.name}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"><ExternalLink className="h-4 w-4" /></a>}
                  {canEdit && <button type="button" aria-label={`Editar ${campaign.name}`} onClick={() => onEdit(campaign)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5"><Edit className="h-4 w-4" /></button>}
                </div>
              </div>
              {flags.map((flag) => <p key={flag.code} className="mt-1 text-xs font-medium text-status-attention-fg">{flag.text}</p>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const textAction = 'min-h-11 rounded-lg px-2 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan';
const iconAction = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5';

function History({ budget, onOpen }) {
  const { data, isLoading, error } = useAdBudgetDetail(budget.id);
  const confirm = useConfirmDialog();
  const removeReading = useDeleteAdReading();
  const reopen = useReopenAdCycle();
  const canEdit = useCanEditAds();
  const run = async (work, success) => {
    try {
      await work();
      toast.success(success);
    } catch (problem) {
      toast.error(problem.message);
    }
  };
  const askRemove = async (reading) => {
    const accepted = await confirm({
      title: 'Eliminar lectura', confirmLabel: 'Eliminar',
      description: `Se borra la lectura del ${shortDay(reading.readOn)} y la cifra vuelve a ser la lectura anterior.`
    });
    if (accepted) await run(() => removeReading.mutateAsync({ id: budget.id, readingId: reading.id }), 'Lectura eliminada');
  };
  const askReopen = async (item) => {
    const accepted = await confirm({ title: 'Reabrir ciclo', confirmLabel: 'Reabrir', tone: 'neutral', description: `${item.cycle.label} vuelve a quedar abierto y lo que pasó al ciclo siguiente queda provisional. El gasto no se borra.` });
    if (accepted) await run(() => reopen.mutateAsync({ id: budget.id, cycleKey: item.cycleKey }), 'Ciclo reabierto');
  };
  return (
    <section aria-label="Historial de gasto" className="min-w-0">
      <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">Historial de gasto</h4>
      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>}
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error.message}</p>}
      {data && !data.history.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">Todavía no hay lecturas.</p>}
      <div className="space-y-3">
        {(data?.history || []).map((item) => (
          <div key={item.cycleKey} data-ad-history={item.cycleKey}>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              {item.cycle.label} · {formatAdMoney(item.evaluation.spentCents, budget.currency)} de {formatAdMoney(item.evaluation.availableCents, budget.currency)}
              {item.evaluation.closed && ` · saldo ${formatAdMoney(item.evaluation.balanceCents, budget.currency)}`}
            </p>
            {canEdit && <div className="flex flex-wrap items-center gap-x-1">
              <button type="button" data-ad-cycle-edit className={textAction} onClick={() => onOpen('cycle', budget, item)}>Corregir presupuesto</button>
              {item.evaluation.closed && <button type="button" data-ad-cycle-reopen disabled={reopen.isPending} className={textAction} onClick={() => askReopen(item)}>Reabrir ciclo</button>}
            </div>}
            <ul>
              {item.readings.map((reading) => (
                <li key={reading.id} data-ad-reading={reading.id} className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="min-w-0">
                    {shortDay(reading.readOn)}: {formatAdMoney(toCents(reading.spent), budget.currency)}
                    {reading.isFinal && ' (final)'}{reading.source === 'META' ? ' · Meta' : reading.recordedBy && ` · ${reading.recordedBy}`}{reading.note && ` · ${reading.note}`}
                  </span>
                  {canEdit && <span className="flex shrink-0">
                    <button type="button" aria-label={`Corregir la lectura del ${shortDay(reading.readOn)}`} data-ad-reading-edit className={iconAction}
                      onClick={() => onOpen('reading', budget, { ...reading, cycle: item.cycle, evaluation: item.evaluation })}><Edit className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Eliminar la lectura del ${shortDay(reading.readOn)}`} data-ad-reading-delete disabled={removeReading.isPending} className={cn(iconAction, 'text-destructive brain-destructive-text')} onClick={() => askRemove(reading)}><Trash2 className="h-4 w-4 text-destructive brain-destructive-text" /></button>
                  </span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data?.changes?.length > 0 && (
        <div data-ad-changes className="mt-3">
          <h4 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-white">Correcciones</h4>
          <ul className="space-y-0.5">
            {data.changes.map((change) => <li key={change.id} className="text-xs text-zinc-500 dark:text-zinc-400">{change.summary}{change.by && ` · ${change.by}`}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function BudgetRow({ budget, expanded, onToggle, onOpen }) {
  const rowRef = useRef(null);
  const canEdit = useCanEditAds();
  const { evaluation: e, cycle, currency } = budget;
  const meta = LEVEL_META[e.level];
  const money = (cents) => formatAdMoney(cents, currency);

  useEffect(() => { if (budget.focused) rowRef.current?.scrollIntoView({ block: 'center' }); }, [budget.focused]);

  return (
    <article ref={rowRef} data-ad-budget={budget.id} data-ad-state={e.state} className="border-t border-zinc-200 first:border-t-0 dark:border-white/10">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{budget.brand || `Pauta en ${labelOfAd(AD_PLATFORMS, budget.platform)}`}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {[budget.brand && labelOfAd(AD_PLATFORMS, budget.platform), budget.kind === 'ESPECIFICA' && 'Específica', budget.objective, labelOfAd(AD_PAYERS, budget.payer)].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {budget.responsible ? <><TeamAvatar member={budget.responsible} size={20} /><span className="truncate">{budget.responsible.name}</span></> : <span className="text-status-attention-fg">Sin responsable</span>}
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-semibold text-zinc-900 dark:text-white">{money(e.spentCents)} <span className="font-normal text-zinc-500 dark:text-zinc-400">de {money(e.availableCents)}</span></span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Saldo {money(e.balanceCents)}</span>
          </div>
          <SpendBar evaluation={e} />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {closeText(e)} · gastar hasta el {shortDay(e.deadline)} · {readingText(e, budget.meta?.source)}
          </p>
          {e.carryCents !== 0 && (
            <p data-ad-carry className="text-xs text-zinc-500 dark:text-zinc-400">
              {e.carryCents > 0 ? 'Incluye' : 'Descuenta'} {money(Math.abs(e.carryCents))} del ciclo anterior{e.carryFinal ? '' : ' (provisional)'}{budget.carryOverReason ? `: ${budget.carryOverReason}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
          <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', meta.soft, meta.text)}><span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />{e.label}</span>
          <div className="flex items-center gap-1">
            {canEdit && <Button size="sm" variant="outline" className="min-h-11" data-ad-spend-open onClick={() => onOpen('spend', budget)}>Actualizar gasto</Button>}
            <button type="button" aria-expanded={expanded} aria-label={expanded ? 'Ocultar el detalle' : 'Ver el detalle'} data-ad-toggle onClick={onToggle} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5">
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
          </div>
        </div>
      </div>
      {(budget.pendingClose || e.reasons.length > 0 || budget.meta?.difference || budget.meta?.problem || budget.meta?.excess) && (
        <div className="space-y-1 px-4 pb-3">
          {budget.pendingClose && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-status-attention-fg">
              Falta el gasto final de {String(budget.pendingClose.cycle.label).toLowerCase()}.
              {canEdit && <button type="button" data-ad-close-open onClick={() => onOpen('close', budget)} className="min-h-7 rounded font-semibold underline">Registrarlo</button>}
            </p>
          )}
          <MetaReadingNotes budget={budget} onBudget={() => onOpen('meta-budget', budget)} />
          {e.reasons.map((reason) => <p key={reason} data-ad-reason className={cn('text-sm', e.level === 'red' ? 'text-destructive brain-destructive-text' : 'text-zinc-700 dark:text-zinc-200')}>{reason}</p>)}
        </div>
      )}
      {expanded && (
        <div data-ad-detail className="grid gap-6 border-t border-zinc-200 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/5 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <MetaBudgetSection budget={budget} onLink={() => onOpen('meta', budget)} onBudget={() => onOpen('meta-budget', budget)} />
            <Campaigns budget={budget} onAdd={() => onOpen('campaign', budget)} onEdit={(campaign) => onOpen('campaign', budget, campaign)} />
          </div>
          <div className="min-w-0 space-y-4">
            <History budget={budget} onOpen={onOpen} />
            {budget.notes && <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{budget.notes}</p>}
            {budget.cutSource === 'CALENDARIO' && <p className="text-xs text-status-attention-fg">Este cliente no tiene contrato cargado: se usa el mes calendario. Puedes fijar el ciclo en «Editar pauta».</p>}
            {canEdit && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="min-h-11" data-ad-edit onClick={() => onOpen('edit', budget)}>Editar pauta</Button>
              {budget.kind === 'MENSUAL' && <Button size="sm" variant="outline" className="min-h-11" data-ad-carry-open onClick={() => onOpen('carry', budget)}>Ajustar saldo anterior</Button>}
            </div>}
          </div>
        </div>
      )}
    </article>
  );
}

export default function AdBudgets() {
  const [params, setParams] = useSearchParams();
  const focusId = params.get('pauta');
  const clientFilter = params.get('cliente');
  const filter = FILTERS[params.get('filtro')] ? params.get('filtro') : null;
  const [search, setSearch] = useState('');
  const [responsible, setResponsible] = useState('');
  const [payer, setPayer] = useState('');
  const [showFinished, setShowFinished] = useState(false);
  const [expandedId, setExpandedId] = useState(focusId);
  const [dialog, setDialog] = useState(null);
  const { data, isLoading, error } = useAdBudgets({ includeFinished: showFinished });
  const { data: meta } = useAdMeta();
  const canEdit = data?.canEdit === true;

  useEffect(() => { if (focusId) setExpandedId(focusId); }, [focusId]);
  // El aviso de «se pasaría» llega con `?meta=presupuesto`: abre la ventana del presupuesto en Meta de esa pauta, una vez.
  const metaParam = params.get('meta');
  const focusedBudget = (data?.budgets || []).find((budget) => budget.id === focusId);
  useEffect(() => {
    if (metaParam !== 'presupuesto' || !focusedBudget?.meta?.linked) return;
    setDialog({ kind: 'meta-budget', budget: focusedBudget, subject: null });
    const next = new URLSearchParams(params);
    next.delete('meta');
    setParams(next, { replace: true });
  }, [metaParam, focusedBudget, params, setParams]);

  const budgets = useMemo(() => (data?.budgets || []).map((budget) => ({ ...budget, today: data.today, focused: budget.id === focusId })), [data, focusId]);
  const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([key, rule]) => [key, budgets.filter(rule).length])), [budgets]);
  const people = useMemo(() => [...new Map(budgets.filter((budget) => budget.responsible).map((budget) => [budget.responsible.id, budget.responsible])).values()], [budgets]);

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase();
    return budgets.filter((budget) => (!filter || FILTERS[filter](budget))
      && (!clientFilter || budget.clientId === clientFilter)
      && (!responsible || (responsible === 'NINGUNO' ? !budget.responsible : budget.responsible?.id === responsible))
      && (!payer || budget.payer === payer)
      && (!words || `${budget.client?.name} ${budget.brand || ''}`.toLowerCase().includes(words)));
  }, [budgets, filter, clientFilter, responsible, payer, search]);

  const groups = useMemo(() => {
    const byClient = new Map();
    for (const budget of visible) {
      if (!byClient.has(budget.clientId)) byClient.set(budget.clientId, { client: budget.client, budgets: [] });
      byClient.get(budget.clientId).budgets.push(budget);
    }
    const urgency = (group) => Math.min(...group.budgets.map((budget) => budget.evaluation.daysToClose));
    return [...byClient.values()].sort((a, b) => urgency(a) - urgency(b) || String(a.client?.name).localeCompare(String(b.client?.name)));
  }, [visible]);

  const toggleFilter = (key) => {
    const next = new URLSearchParams(params);
    if (filter === key) next.delete('filtro');
    else next.set('filtro', key);
    next.delete('pauta');
    setParams(next, { replace: true });
  };
  const open = (kind, budget, subject = null) => setDialog({ kind, budget, subject });
  const close = () => setDialog(null);

  return (
    <AdEditContext.Provider value={canEdit}>
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10" data-ad-budgets data-ad-can-edit={canEdit ? 'true' : 'false'}>
      <PageHeader title="Pautas" subtitle="El presupuesto de cada cliente contra su cierre: cuánto va, cuánto falta y qué hay que revisar." icon={Megaphone}>
        {canEdit && <Button data-ad-new className="min-h-11" onClick={() => open('new', null)}><Plus className="mr-1 h-4 w-4" /> Nueva pauta</Button>}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinancialSummaryCard label="Por revisar" value={counts.revisar ?? 0} tone={counts.revisar ? 'warning' : 'neutral'} hint="Gasto o campañas sin revisar" onClick={() => toggleFilter('revisar')} pressed={filter === 'revisar'} data-ad-filter="revisar" />
        <FinancialSummaryCard label="Cierran pronto" value={counts.cierran ?? 0} tone="accent" hint="En los próximos 5 días" onClick={() => toggleFilter('cierran')} pressed={filter === 'cierran'} data-ad-filter="cierran" />
        <FinancialSummaryCard label="Van atrasadas" value={counts.atrasadas ?? 0} tone={counts.atrasadas ? 'warning' : 'neutral'} hint="Por debajo del ritmo" onClick={() => toggleFilter('atrasadas')} pressed={filter === 'atrasadas'} data-ad-filter="atrasadas" />
        <FinancialSummaryCard label="Se pasaron" value={counts.pasadas ?? 0} tone={counts.pasadas ? 'danger' : 'neutral'} hint="Más del presupuesto" onClick={() => toggleFilter('pasadas')} pressed={filter === 'pasadas'} data-ad-filter="pasadas" />
      </div>

      {data && !canEdit && <p data-ad-view-only className="text-sm text-zinc-500 dark:text-zinc-400">Puedes ver las pautas. Para editarlas, actualizar el gasto o ajustar el presupuesto en Meta, pide a un administrador que te marque «Editar pautas» en Equipo.</p>}

      <MetaStatus meta={meta} onOpenUnassigned={() => open('unassigned', null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente o marca" aria-label="Buscar cliente o marca"
          className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-white sm:w-64" />
        <div className="w-full sm:w-52">
          <Select value={responsible} onChange={(event) => setResponsible(event.target.value)} aria-label="Filtrar por quién la lleva" className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            <option value="">Todas las personas</option>
            <option value="NINGUNO">Sin responsable</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select>
        </div>
        <div className="w-full sm:w-56">
          <Select value={payer} onChange={(event) => setPayer(event.target.value)} aria-label="Filtrar por quién paga" className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            <option value="">Quién paga: todos</option>
            {AD_PAYERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" className="h-4 w-4" checked={showFinished} onChange={(event) => setShowFinished(event.target.checked)} /> Ver terminadas
        </label>
      </div>

      {isLoading && <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando pautas…</p>}
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">No se pudieron cargar las pautas: {error.message}</p>}
      {!isLoading && !error && !budgets.length && (
        <div data-ad-empty className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-white/15">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">Todavía no hay pautas.</p>
          {canEdit && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Crea la primera con el presupuesto aprobado por el cliente.</p>}
        </div>
      )}
      {!isLoading && !error && budgets.length > 0 && !groups.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nada coincide con estos filtros.</p>}

      <div className="space-y-4">
        {groups.map(({ client, budgets: rows }) => (
          <section key={client?.id} data-ad-client={client?.id} aria-label={client?.name} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{client?.name}</h3>
              {rows.some((budget) => budget.kind === 'MENSUAL') && (() => {
                const { cycle } = rows.find((budget) => budget.kind === 'MENSUAL');
                return <p className="text-xs text-zinc-500 dark:text-zinc-400">Ciclo del {shortDay(cycle.start)} al {shortDay(cycle.end)}</p>;
              })()}
            </header>
            {rows.map((budget) => (
              <BudgetRow key={budget.id} budget={budget} expanded={expandedId === budget.id} onToggle={() => setExpandedId((current) => (current === budget.id ? null : budget.id))} onOpen={open} />
            ))}
          </section>
        ))}
      </div>

      {dialog?.kind === 'new' && <AdBudgetDialog defaultClientId={clientFilter} onClose={close} />}
      {dialog?.kind === 'edit' && <AdBudgetDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'spend' && <AdSpendDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'close' && <AdSpendDialog budget={dialog.budget} closing={dialog.budget.pendingClose} onClose={close} />}
      {dialog?.kind === 'carry' && <AdCarryOverDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'campaign' && <AdCampaignDialog budget={dialog.budget} campaign={dialog.subject} onClose={close} />}
      {dialog?.kind === 'reading' && <AdSpendDialog budget={dialog.budget} reading={dialog.subject} onClose={close} />}
      {dialog?.kind === 'cycle' && <AdCycleDialog budget={dialog.budget} entry={dialog.subject} onClose={close} />}
      {dialog?.kind === 'meta' && <AdMetaLinkDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'meta-budget' && <AdMetaBudgetDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'unassigned' && meta && <MetaUnassignedDialog meta={meta} budgets={budgets.filter((budget) => budget.status === 'ACTIVA')} onClose={close} />}
    </div>
    </AdEditContext.Provider>
  );
}
