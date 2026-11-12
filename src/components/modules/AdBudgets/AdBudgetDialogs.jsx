import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AD_BUDGET_KINDS, AD_BUDGET_STATUSES, AD_CAMPAIGN_STATUSES, AD_OBJECTIVES, AD_PAYERS, AD_PLATFORMS,
  adBudgetName, adBudgetProblem, adCampaignProblem, adCarryOverProblem, adCycleAmountProblem, adSpendProblem, formatAdMoney, shortDay
} from '@/lib/adBudgets';
import { memberHasArea } from '@/lib/teamAreas';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useAdBudgetOptions, useAdjustAdCarryOver, useClearAdCarryOver, useDeleteAdBudget, useDeleteAdCampaign, useRecordAdSpend, useSaveAdBudget, useSaveAdCampaign,
  useUpdateAdCycle, useUpdateAdReading
} from './adBudgetsApi';

// Los formularios de Pautas. Cada uno frena con la misma regla del servidor y solo se cierra cuando el servidor respondió.

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const optional = <span className="text-zinc-400">(opcional)</span>;
const dangerLink = 'min-h-11 rounded-lg px-2 text-sm font-medium text-destructive brain-destructive-text';

function Label({ text, children }) {
  return <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">{text}</span>{children}</label>;
}

function Form({ open, title, description, onClose, onSubmit, saving, error, submitLabel, children, dataAttr, wide, secondary }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent {...{ [dataAttr]: '' }} overlayClassName="z-[80]" className={`z-[81] max-h-[90vh] overflow-y-auto dark:bg-zinc-900 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`} onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={(event) => { event.stopPropagation(); onSubmit(event); }} className="space-y-4">
          {children}
          {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
          <DialogFooter className="gap-2 sm:items-center">
            {secondary && <div className="sm:mr-auto">{secondary}</div>}
            <button type="button" disabled={saving} className="min-h-11 rounded-lg px-4 text-sm text-zinc-700 dark:text-zinc-200" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Guardando…' : submitLabel}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { Form as AdBudgetForm };

const CUT_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const cycleLabel = (day) => (day === 1 ? 'Mes calendario (del 1 al último día)' : `Del ${day} al ${day - 1} del mes siguiente`);

const blankBudget = (clientId) => ({
  clientId: clientId || '', brand: '', platform: 'META', kind: 'MENSUAL', currency: 'COP', amount: '', cutDay: '', objective: '', payer: 'POR_DEFINIR',
  responsibleId: '', startDate: '', endDate: '', notes: '', status: 'ACTIVA'
});

const fromBudget = (budget) => ({
  clientId: budget.clientId, brand: budget.brand || '', platform: budget.platform, kind: budget.kind, currency: budget.currency,
  amount: String(budget.amount ?? ''), cutDay: budget.ownCutDay ? String(budget.ownCutDay) : '', objective: budget.objective || '', payer: budget.payer, responsibleId: budget.responsible?.id || '',
  startDate: budget.startDate || '', endDate: budget.endDate || '', notes: budget.notes || '', status: budget.status
});

/** Crear o corregir una pauta. El responsable viene elegido si solo hay una persona en el área de Pauta. */
export function AdBudgetDialog({ budget, defaultClientId, onClose }) {
  const { data: options } = useAdBudgetOptions();
  const save = useSaveAdBudget();
  const remove = useDeleteAdBudget();
  const confirm = useConfirmDialog();
  const [form, setForm] = useState(() => (budget ? fromBudget(budget) : blankBudget(defaultClientId)));
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const team = options?.team || [];
  const specialists = team.filter((member) => memberHasArea(member, 'PAUTA'));
  const responsibleId = form.responsibleId || (!budget && specialists.length === 1 ? specialists[0].id : '');
  const specific = form.kind === 'ESPECIFICA';

  const submit = async (event) => {
    event.preventDefault();
    const input = { ...form, responsibleId: responsibleId || null };
    const found = adBudgetProblem(input);
    if (found) { setProblem(found); return; }
    try {
      await save.mutateAsync({ id: budget?.id, input });
      toast.success(budget ? 'Pauta actualizada' : 'Pauta creada');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };

  const removeBudget = async () => {
    const accepted = await confirm({
      title: 'Eliminar pauta',
      description: `Se borran ${adBudgetName(budget)}, sus lecturas y sus campañas. Es para lo que se creó por error: si solo dejó de correr, márcala como terminada y la conservas.`,
      confirmLabel: 'Eliminar'
    });
    if (!accepted) return;
    try {
      await remove.mutateAsync({ id: budget.id });
      toast.success('Pauta eliminada');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };

  return (
    <Form open title={budget ? 'Editar pauta' : 'Nueva pauta'} wide dataAttr="data-ad-budget-dialog" onClose={onClose} onSubmit={submit} saving={save.isPending || remove.isPending} error={problem} submitLabel={budget ? 'Guardar cambios' : 'Crear pauta'}
      secondary={budget && <button type="button" data-ad-delete onClick={removeBudget} className={dangerLink}>Eliminar pauta</button>}
      description="El presupuesto global del cliente. Las fechas salen del cierre de su contrato; un anuncio puede terminar antes.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Cliente">
          <Select required className={field} value={form.clientId} onChange={(event) => set({ clientId: event.target.value })} aria-label="Cliente">
            <option value="">Elige un cliente</option>
            {(options?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </Label>
        <Label text={<>Marca o cuenta {optional}</>}>
          <input className={field} value={form.brand} maxLength={120} onChange={(event) => set({ brand: event.target.value })} placeholder="Ej.: Wine Summit" />
        </Label>
        <Label text="Plataforma">
          <Select required className={field} value={form.platform} onChange={(event) => set({ platform: event.target.value })} aria-label="Plataforma">
            {AD_PLATFORMS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Label>
        <Label text="Tipo">
          <Select required className={field} value={form.kind} onChange={(event) => set({ kind: event.target.value })} aria-label="Tipo de pauta">
            {AD_BUDGET_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Label>
      </div>
      {!specific && (
        <Label text="Ciclo">
          <Select className={field} value={form.cutDay} onChange={(event) => set({ cutDay: event.target.value })} aria-label="Día de corte">
            <option value="">El del contrato del cliente</option>
            {CUT_DAYS.map((day) => <option key={day} value={String(day)}>{cycleLabel(day)}</option>)}
          </Select>
        </Label>
      )}
      {specific && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Inicio"><BrainDatePicker required className={field} value={form.startDate} onChange={(startDate) => set({ startDate })} ariaLabel="Fecha de inicio" /></Label>
          <Label text="Fin"><BrainDatePicker required className={field} value={form.endDate} onChange={(endDate) => set({ endDate })} ariaLabel="Fecha de fin" /></Label>
        </div>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Moneda</span><CurrencyToggle bordered value={form.currency} onChange={(currency) => set({ currency })} /></div>
        <Label text={specific ? 'Presupuesto total' : 'Presupuesto del mes'}>
          <MoneyInput required className={field} value={form.amount} onChange={(amount) => set({ amount })} aria-label="Presupuesto" />
        </Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Quién la lleva">
          <Select className={field} value={responsibleId} onChange={(event) => set({ responsibleId: event.target.value })} aria-label="Quién la lleva">
            <option value="">Sin responsable</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Select>
        </Label>
        <Label text="Quién paga">
          <Select className={field} value={form.payer} onChange={(event) => set({ payer: event.target.value })} aria-label="Quién paga">
            {AD_PAYERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Label>
        <Label text={<>Objetivo {optional}</>}>
          <Select className={field} value={form.objective} onChange={(event) => set({ objective: event.target.value })} aria-label="Objetivo">
            <option value="">Sin definir</option>
            {AD_OBJECTIVES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Label>
        {budget && (
          <Label text="Estado">
            <Select className={field} value={form.status} onChange={(event) => set({ status: event.target.value })} aria-label="Estado de la pauta">
              {AD_BUDGET_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
          </Label>
        )}
      </div>
      <Label text={<>Nota {optional}</>}>
        <textarea className={field} rows={2} maxLength={1000} value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Ej.: el cliente quiere seguidores; priorizar publicaciones de ventas." />
      </Label>
    </Form>
  );
}

/** Lo que marca Meta hoy. `closing` es el gasto final de un ciclo que ya terminó; `reading`, una lectura que se corrige. */
export function AdSpendDialog({ budget, closing, reading, onClose }) {
  const record = useRecordAdSpend();
  const correct = useUpdateAdReading();
  const saving = record.isPending || correct.isPending;
  const cycle = reading?.cycle || closing?.cycle || budget.cycle;
  const evaluation = reading?.evaluation || closing?.evaluation || budget.evaluation;
  const [form, setForm] = useState(reading
    ? { spent: String(reading.spent), readOn: reading.readOn, final: reading.isFinal, note: reading.note || '' }
    : { spent: evaluation.hasReading ? String(evaluation.spentCents / 100) : '', readOn: closing ? cycle.end : today(), final: Boolean(closing), note: '' });
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = async (event) => {
    event.preventDefault();
    const found = adSpendProblem(form);
    if (found) { setProblem(found); return; }
    try {
      if (reading) await correct.mutateAsync({ id: budget.id, readingId: reading.id, input: form });
      else await record.mutateAsync({ id: budget.id, input: { ...form, ...(closing ? { cycleKey: cycle.key } : {}) } });
      toast.success(reading ? 'Lectura corregida' : form.final ? 'Gasto final registrado: el ciclo quedó cerrado' : 'Gasto actualizado');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  const title = reading ? 'Corregir lectura' : closing ? `Gasto final de ${String(cycle.label).toLowerCase()}` : 'Actualizar gasto';
  return (
    <Form open title={title} dataAttr="data-ad-spend-dialog" onClose={onClose} onSubmit={submit} saving={saving} error={problem} submitLabel={reading ? 'Guardar corrección' : closing ? 'Cerrar el ciclo' : 'Guardar gasto'}
      description={`${adBudgetName(budget)} · del ${shortDay(cycle.start)} al ${shortDay(cycle.end)}. Escribe lo que Meta marca para esas fechas, acumulado.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text={`Gastado en el ciclo (${budget.currency})`}><MoneyInput required className={field} value={form.spent} onChange={(spent) => set({ spent })} aria-label="Gastado en el ciclo" /></Label>
        <Label text="Hasta el día"><BrainDatePicker required className={field} value={form.readOn} onChange={(readOn) => set({ readOn })} ariaLabel="Fecha de la lectura" /></Label>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Disponible en este ciclo: {formatAdMoney(evaluation.availableCents, budget.currency)}.</p>
      {budget.meta?.linked && !reading && <p data-ad-spend-meta-hint className="text-xs text-zinc-500 dark:text-zinc-400">Esta pauta se lee de Meta cada dos horas. Escribe aquí solo para corregirla: lo que escribas hoy manda sobre Meta hasta mañana.</p>}
      {!closing && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" className="h-4 w-4" checked={form.final} onChange={(event) => set({ final: event.target.checked })} />
          Es el gasto final de este ciclo
        </label>
      )}
      <Label text={<>Nota {optional}</>}><textarea className={field} rows={2} maxLength={500} value={form.note} onChange={(event) => set({ note: event.target.value })} /></Label>
    </Form>
  );
}

/** El presupuesto de un ciclo en particular, también de uno ya cerrado. */
export function AdCycleDialog({ budget, entry, onClose }) {
  const update = useUpdateAdCycle();
  const [amount, setAmount] = useState(String(entry.amount ?? ''));
  const [problem, setProblem] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const found = adCycleAmountProblem({ amount });
    if (found) { setProblem(found); return; }
    try {
      await update.mutateAsync({ id: budget.id, cycleKey: entry.cycleKey, input: { amount } });
      toast.success('Presupuesto del ciclo corregido');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  return (
    <Form open title={`Presupuesto de ${String(entry.cycle.label).toLowerCase()}`} dataAttr="data-ad-cycle-dialog" onClose={onClose} onSubmit={submit} saving={update.isPending} error={problem} submitLabel="Guardar presupuesto"
      description={`${adBudgetName(budget)}. Solo cambia este ciclo; de ahí se recalcula el saldo que pasa al siguiente.`}>
      <Label text={`Presupuesto (${budget.currency})`}><MoneyInput required className={field} value={amount} onChange={(value) => { setProblem(''); setAmount(value); }} aria-label="Presupuesto del ciclo" /></Label>
    </Form>
  );
}

/** El saldo que pasa a este ciclo, cuando la cuenta automática no aplica. */
export function AdCarryOverDialog({ budget, onClose }) {
  const adjust = useAdjustAdCarryOver();
  const clear = useClearAdCarryOver();
  const [form, setForm] = useState({ carryOver: String((budget.evaluation.carryCents || 0) / 100), reason: '' });
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = async (event) => {
    event.preventDefault();
    const found = adCarryOverProblem(form);
    if (found) { setProblem(found); return; }
    try {
      await adjust.mutateAsync({ id: budget.id, input: { ...form, cycleKey: budget.cycle.key } });
      toast.success('Saldo ajustado');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  const backToAutomatic = async () => {
    try {
      await clear.mutateAsync({ id: budget.id, cycleKey: budget.cycle.key });
      toast.success('El saldo volvió a la cuenta automática');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  return (
    <Form open title="Ajustar saldo anterior" dataAttr="data-ad-carry-dialog" onClose={onClose} onSubmit={submit} saving={adjust.isPending || clear.isPending} error={problem} submitLabel="Guardar saldo"
      secondary={budget.evaluation.carryManual && <button type="button" data-ad-carry-clear onClick={backToAutomatic} className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep dark:text-brand-cyan">Volver a la cuenta automática</button>}
      description={`${adBudgetName(budget)}. Lo que no se gastó antes y se suma a este ciclo; si se gastó de más, escríbelo en negativo.`}>
      <Label text={`Saldo que pasa a este ciclo (${budget.currency})`}><MoneyInput allowNegative required className={field} value={form.carryOver} onChange={(carryOver) => set({ carryOver })} aria-label="Saldo que pasa a este ciclo" /></Label>
      <Label text="Motivo"><textarea required className={field} rows={2} maxLength={300} value={form.reason} onChange={(event) => set({ reason: event.target.value })} placeholder="Ej.: saldo de octubre según Meta" /></Label>
    </Form>
  );
}

const blankCampaign = { name: '', link: '', objective: '', status: 'ACTIVA', startDate: '', endDate: '', planned: '', notes: '' };

export function AdCampaignDialog({ budget, campaign, onClose }) {
  const save = useSaveAdCampaign();
  const remove = useDeleteAdCampaign();
  const confirm = useConfirmDialog();
  const [form, setForm] = useState(() => (campaign ? { ...blankCampaign, ...campaign, link: campaign.link || '', objective: campaign.objective || '', startDate: campaign.startDate || '', endDate: campaign.endDate || '', planned: campaign.planned ?? '', notes: campaign.notes || '' } : blankCampaign));
  const [problem, setProblem] = useState('');
  const set = (patch) => { setProblem(''); setForm((current) => ({ ...current, ...patch })); };
  const submit = async (event) => {
    event.preventDefault();
    const found = adCampaignProblem(form);
    if (found) { setProblem(found); return; }
    try {
      await save.mutateAsync({ budgetId: budget.id, campaignId: campaign?.id, input: form });
      toast.success(campaign ? 'Campaña actualizada' : 'Campaña añadida');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  const removeCampaign = async () => {
    const accepted = await confirm({ title: 'Eliminar campaña', description: `Se borra «${campaign.name}». El gasto registrado de la pauta no cambia.`, confirmLabel: 'Eliminar' });
    if (!accepted) return;
    try {
      await remove.mutateAsync({ budgetId: budget.id, campaignId: campaign.id });
      toast.success('Campaña eliminada');
      onClose();
    } catch (error) {
      setProblem(error.message);
    }
  };
  return (
    <Form open title={campaign ? 'Editar campaña' : 'Nueva campaña'} dataAttr="data-ad-campaign-dialog" onClose={onClose} onSubmit={submit} saving={save.isPending || remove.isPending} error={problem} submitLabel={campaign ? 'Guardar cambios' : 'Añadir campaña'}
      secondary={campaign && <button type="button" data-ad-campaign-delete onClick={removeCampaign} className={dangerLink}>Eliminar campaña</button>}
      description={`Dentro del presupuesto de ${adBudgetName(budget)}. El gasto se cierra el ${shortDay(budget.cycle.end)}, aunque el anuncio termine antes.`}>
      <Label text="Campaña o anuncio"><input required className={field} maxLength={200} value={form.name} onChange={(event) => set({ name: event.target.value })} placeholder="Ej.: Convocatorias de noviembre" /></Label>
      <Label text={<>Enlace de la publicación {optional}</>}><input className={field} inputMode="url" value={form.link} onChange={(event) => set({ link: event.target.value })} placeholder="https://www.instagram.com/p/…" /></Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Estado">
          <Select className={field} value={form.status} onChange={(event) => set({ status: event.target.value })} aria-label="Estado de la campaña">
            {AD_CAMPAIGN_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </Label>
        <Label text={<>Objetivo {optional}</>}>
          <Select className={field} value={form.objective} onChange={(event) => set({ objective: event.target.value })} aria-label="Objetivo de la campaña">
            <option value="">Sin definir</option>
            {AD_OBJECTIVES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Label>
        <Label text={<>Inicio {optional}</>}><BrainDatePicker className={field} value={form.startDate} onChange={(startDate) => set({ startDate })} ariaLabel="Inicio de la campaña" /></Label>
        <Label text={<>Fin {optional}</>}><BrainDatePicker className={field} value={form.endDate} onChange={(endDate) => set({ endDate })} ariaLabel="Fin de la campaña" /></Label>
      </div>
      <Label text={<>Presupuesto asignado {optional}</>}><MoneyInput className={field} value={form.planned} onChange={(planned) => set({ planned })} aria-label="Presupuesto de la campaña" /></Label>
      <Label text={<>Nota {optional}</>}><textarea className={field} rows={2} maxLength={1000} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></Label>
    </Form>
  );
}
