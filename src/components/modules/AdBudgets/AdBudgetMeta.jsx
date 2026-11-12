import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link2, Loader2, RefreshCw, Search } from '@/components/ui/icons';
import Select from '@/components/ui/Select';
import { adBudgetName, formatAdMoney, shortDay } from '@/lib/adBudgets';
import { suggestMetaCampaigns } from '@/lib/adBudgetMeta';
import { cn } from '@/lib/utils';
import { useAdMeta, useAdMetaSuggestions, useAssignAdMeta, useIgnoreAdMeta, useRecordAdSpend, useSyncAdMeta } from './adBudgetsApi';
import { AdBudgetForm } from './AdBudgetDialogs';

// Pautas conectadas a Meta (12 de noviembre de 2026). La plataforma lee el gasto de las campañas ligadas a cada pauta; lo
// que aquí se hace es ligar campañas, ver lo que gasta sin pauta y comparar con lo escrito a mano. Nada cambia en Meta.

const textAction = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep disabled:opacity-50 dark:text-brand-cyan';
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

const timeText = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const key = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const time = date.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });
  return key(date) === key(new Date()) ? `hoy a las ${time}` : `el ${shortDay(key(date))} a las ${time}`;
};

/** La barra del tablero: si Meta está conectado, cuándo se leyó y cuánto gasta sin estar en ninguna pauta. */
export function MetaStatus({ meta, onOpenUnassigned }) {
  const sync = useSyncAdMeta();
  if (!meta) return null;
  if (!meta.configured) {
    return <p data-ad-meta-status className="text-sm text-zinc-500 dark:text-zinc-400">La conexión con Meta no está configurada en el servidor: el gasto se escribe a mano.</p>;
  }
  const failing = meta.accounts.filter((account) => account.isActive && account.problem);
  const run = async () => {
    try {
      const result = await sync.mutateAsync();
      toast.success(result?.skipped ? 'Meta se acaba de leer: ya está al día' : 'Meta leído: gasto y campañas al día');
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <div data-ad-meta-status className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm dark:border-white/10 dark:bg-zinc-900">
      <span className="text-zinc-700 dark:text-zinc-200">
        <span className="font-semibold">Meta</span> · {meta.lastSyncAt ? `leído ${timeText(meta.lastSyncAt)}` : 'todavía no se ha leído'} · se lee solo cada {meta.everyHours} horas
      </span>
      <button type="button" data-ad-meta-sync disabled={sync.isPending} onClick={run} className={textAction}>
        {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {sync.isPending ? 'Leyendo Meta…' : 'Actualizar ahora'}
      </button>
      {meta.unassigned.length > 0 && (
        <button type="button" data-ad-meta-unassigned onClick={onOpenUnassigned} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-status-attention-fg underline-offset-2 hover:underline">
          {meta.unassigned.length === 1 ? '1 campaña gasta sin pauta' : `${meta.unassigned.length} campañas gastan sin pauta`}
        </button>
      )}
      {failing.length > 0 && <span className="text-xs text-status-attention-fg" title={failing.map((account) => `${account.name}: ${account.problem}`).join('\n')}>{failing.length === 1 ? `${failing[0].name} no respondió` : `${failing.length} cuentas no respondieron`}</span>}
    </div>
  );
}

/** La fila de una pauta: de dónde sale el gasto, y si lo escrito a mano no coincide con Meta. */
export function MetaReadingNotes({ budget }) {
  const record = useRecordAdSpend();
  const { meta, currency } = budget;
  if (!meta?.linked) return null;
  const useMeta = async () => {
    try {
      await record.mutateAsync({ id: budget.id, input: { spent: String(meta.spentCents / 100), readOn: meta.asOf, note: 'Tomado de Meta' } });
      toast.success('Gasto actualizado con la cifra de Meta');
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <>
      {meta.difference && (
        <p data-ad-meta-difference className="flex flex-wrap items-center gap-x-2 text-sm text-status-attention-fg">
          Meta marca {formatAdMoney(meta.spentCents, currency)} hasta el {shortDay(meta.asOf)}; la cifra escrita a mano es {formatAdMoney(budget.evaluation.spentCents, currency)}.
          <button type="button" data-ad-meta-use disabled={record.isPending} onClick={useMeta} className="min-h-7 rounded font-semibold underline">Usar la de Meta</button>
        </p>
      )}
      {meta.problem && <p data-ad-meta-problem className="text-sm text-status-attention-fg">No se pudo leer Meta: {meta.problem}</p>}
    </>
  );
}

/** En el detalle de la pauta: sus campañas de Meta y lo que gastó cada una en el ciclo. */
export function MetaBudgetSection({ budget, onLink }) {
  const { meta, currency } = budget;
  const spentOf = new Map((meta?.detail || []).map((item) => [item.id, item.spendCents]));
  return (
    <section aria-label="Gasto en Meta" data-ad-meta-section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Gasto en Meta</h4>
        <button type="button" data-ad-meta-link onClick={onLink} className={textAction}><Link2 className="h-4 w-4" /> {meta?.linked ? 'Cambiar campañas' : 'Ligar campañas'}</button>
      </div>
      {!meta?.linked && <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin campañas de Meta: el gasto se escribe a mano. Al ligarlas, la plataforma lo lee sola.</p>}
      {meta?.linked && (
        <>
          <ul className="space-y-1">
            {meta.campaigns.map((campaign) => (
              <li key={campaign.id} data-ad-meta-campaign={campaign.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0"><span className="block truncate text-zinc-900 dark:text-white">{campaign.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{campaign.accountName}</span></span>
                <span className="shrink-0 text-zinc-700 dark:text-zinc-200">{spentOf.has(campaign.id) ? formatAdMoney(spentOf.get(campaign.id), currency) : '—'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {meta.fetchedAt ? `Del ${shortDay(budget.cycle.start)} al ${shortDay(meta.asOf || budget.cycle.start)} · leído ${timeText(meta.fetchedAt)}` : 'Se lee en la próxima lectura de Meta.'}
          </p>
        </>
      )}
    </section>
  );
}

/** Ligar las campañas de una pauta. Propone las que llevan el nombre del cliente o la marca; decide la persona. */
export function AdMetaLinkDialog({ budget, onClose }) {
  const { data: meta, isLoading } = useAdMeta();
  const { data: suggestions } = useAdMetaSuggestions(budget.id);
  const assign = useAssignAdMeta();
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState('');
  const [problem, setProblem] = useState('');
  const linked = useMemo(() => (budget.meta?.campaigns || []).map((campaign) => campaign.id), [budget]);
  const suggested = useMemo(() => suggestions?.suggested || [], [suggestions]);
  const proposing = picked === null && !linked.length && suggested.length > 0;
  const selected = picked ?? (linked.length ? linked : suggested);
  const toggle = (id) => { setProblem(''); setPicked(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]); };

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (meta?.campaigns || [])
      .filter((campaign) => !campaign.ignored || selected.includes(campaign.id))
      .filter((campaign) => !words || `${campaign.name} ${campaign.accountName}`.toLowerCase().includes(words))
      .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || Number(!b.budgetId) - Number(!a.budgetId) || b.spend30Cents - a.spend30Cents);
  }, [meta, search, selected]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await assign.mutateAsync({ id: budget.id, campaignIds: selected });
      toast.success(selected.length ? 'Campañas ligadas: el gasto se lee de Meta' : 'Pauta sin campañas de Meta: el gasto vuelve a ser a mano');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };

  return (
    <AdBudgetForm open wide title="Campañas de Meta" dataAttr="data-ad-meta-dialog" onClose={onClose} onSubmit={submit} saving={assign.isPending} error={problem} submitLabel="Guardar campañas"
      description={`${adBudgetName(budget)} · el gasto de la pauta será la suma de estas campañas en los días de su ciclo.`}>
      {!meta?.configured && !isLoading && <p className="text-sm text-status-attention-fg">La conexión con Meta no está configurada en el servidor.</p>}
      {proposing && <p data-ad-meta-proposed className="rounded-xl bg-brand-cyan/10 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">Vienen marcadas las que parecen de {budget.brand || budget.client?.name} por su nombre o el de su cuenta. Revísalas antes de guardar.</p>}
      <label className="relative block">
        <span className="sr-only">Buscar campaña o cuenta</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar campaña o cuenta" className={cn(field, 'pl-9')} />
      </label>
      {isLoading && <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando campañas…</p>}
      {!isLoading && !rows.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">{meta?.campaigns?.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay campañas leídas de Meta. Usa «Actualizar ahora» en el tablero.'}</p>}
      <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
        {rows.map((campaign) => {
          const elsewhere = campaign.budgetId && campaign.budgetId !== budget.id;
          const otherCurrency = campaign.currency && campaign.currency !== budget.currency;
          const blocked = elsewhere || otherCurrency;
          const reason = elsewhere ? `Es de ${campaign.budgetName}` : otherCurrency ? `En ${campaign.currency}` : '';
          return (
            <li key={campaign.id}>
              <label data-ad-meta-option={campaign.id} className={cn('flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5', blocked ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5')}>
                <input type="checkbox" className="h-4 w-4 shrink-0" disabled={blocked} checked={selected.includes(campaign.id)} onChange={() => toggle(campaign.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-900 dark:text-white">{campaign.name}</span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{campaign.accountName}{reason ? ` · ${reason}` : ''}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">{formatAdMoney(campaign.spend30Cents, campaign.currency || budget.currency)}<span className="block">30 días</span></span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{selected.length === 1 ? '1 campaña elegida' : `${selected.length} campañas elegidas`}. Lo que se escriba a mano sigue valiendo: si no coincide con Meta, la pauta lo dice.</p>
    </AdBudgetForm>
  );
}

/** Lo que gastó en los últimos 30 días y no está en ninguna pauta: se liga a una o se marca como que no es de ninguna. */
export function MetaUnassignedDialog({ meta, budgets, onClose }) {
  const assign = useAssignAdMeta();
  const ignore = useIgnoreAdMeta();
  const [targets, setTargets] = useState({});
  const busy = assign.isPending || ignore.isPending;
  // Si una sola pauta lleva el nombre de la campaña o de su cuenta, viene elegida: la persona solo confirma.
  const guess = (campaign, options) => {
    const found = options.filter((budget) => suggestMetaCampaigns(budget, [campaign], options.filter((other) => other.id !== budget.id && other.clientId === budget.clientId)).length > 0);
    return found.length === 1 ? found[0].id : '';
  };
  const targetOf = (campaign, options) => targets[campaign.id] ?? guess(campaign, options);
  const link = async (campaign, options) => {
    const budget = budgets.find((item) => item.id === targetOf(campaign, options));
    if (!budget) { toast.error('Elige la pauta'); return; }
    try {
      await assign.mutateAsync({ id: budget.id, campaignIds: [...(budget.meta?.campaigns || []).map((item) => item.id), campaign.id] });
      toast.success(`Ligada a ${adBudgetName(budget)}`);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const dismiss = async (campaign) => {
    try {
      await ignore.mutateAsync({ campaignId: campaign.id, ignored: true });
      toast.success('Marcada como que no es de ninguna pauta');
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <AdBudgetForm open wide title="Campañas que gastan sin pauta" dataAttr="data-ad-meta-unassigned-dialog" onClose={onClose} onSubmit={(event) => { event.preventDefault(); onClose(); }} submitLabel="Listo"
      description={`Gastaron en los últimos ${meta.discoveryDays} días y no están en ninguna pauta. Lígalas a la suya, o márcalas si son de la agencia o de un cliente que paga por su cuenta.`}>
      {!meta.unassigned.length && <p className="text-sm text-zinc-500 dark:text-zinc-400">Todas las campañas con gasto están en una pauta.</p>}
      <ul className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {meta.unassigned.map((campaign) => {
          const options = budgets.filter((budget) => !campaign.currency || budget.currency === campaign.currency);
          return (
            <li key={campaign.id} data-ad-meta-unassigned-row={campaign.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-900 dark:text-white">{campaign.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{campaign.accountName}</span></span>
                <span className="shrink-0 text-sm text-zinc-700 dark:text-zinc-200">{formatAdMoney(campaign.spend30Cents, campaign.currency || 'COP')}</span>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Select value={targetOf(campaign, options)} onChange={(event) => setTargets((current) => ({ ...current, [campaign.id]: event.target.value }))} aria-label={`Pauta para ${campaign.name}`} className={field}>
                    <option value="">Elegir la pauta…</option>
                    {options.map((budget) => <option key={budget.id} value={budget.id}>{adBudgetName(budget)}</option>)}
                  </Select>
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" data-ad-meta-assign disabled={busy || !targetOf(campaign, options)} onClick={() => link(campaign, options)} className={textAction}>Ligar</button>
                  <button type="button" data-ad-meta-ignore disabled={busy} onClick={() => dismiss(campaign)} className="min-h-11 rounded-lg px-2 text-sm text-zinc-600 disabled:opacity-50 dark:text-zinc-300">No es de una pauta</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </AdBudgetForm>
  );
}
