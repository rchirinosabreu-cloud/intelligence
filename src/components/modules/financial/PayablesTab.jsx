import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, ChevronUp, Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import { financialCategoryLabel } from '@/lib/financialCategories';
import { isPayableClosed, payableStatusLabel, thirdPartyKindLabel } from '@/lib/accountsPayable';
import { payableDocumentsApi, uploadRecordDocument } from '@/lib/financialDocumentsClient';
import RecordDocumentsInline from './RecordDocumentsInline';
import PayableDialog from './PayableDialog';
import PayablePaymentDialog from './PayablePaymentDialog';
import { ThirdPartiesDialog, ThirdPartyDialog } from './ThirdParties';
import { FinancialSectionHeader, FinancialSummaryCard } from './FinancialSectionParts';

// «Por pagar» (Rodny, 20 de octubre de 2026): el espejo de Cartera. Cada tercero es una tarjeta que se
// despliega; cada cuenta dice qué llegó, cuándo vence y cuánto falta; pagarla crea el egreso en
// Movimientos ligado al pago. Los pagos de cada cuenta van plegados, como en Nómina.

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const authed = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const apiUrl = (path) => `${getApiBaseUrl()}/api/financials${path}`;
const day = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

function ReasonDialog({ open, title, description, confirmLabel, saving, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}><DialogContent className="sm:max-w-md dark:bg-zinc-900">
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span><textarea required className={field} rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <DialogFooter><button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose}>Cancelar</button><button type="button" disabled={saving || !reason.trim()} onClick={() => onConfirm(reason.trim())} className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : confirmLabel}</button></DialogFooter>
  </DialogContent></Dialog>;
}

export default function PayablesTab({ filterQuery, formatCurrency, accounts = [], canWrite, enabled }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState({});
  const [expandedPayments, setExpandedPayments] = useState({});
  const [dialog, setDialog] = useState(null); // { kind: 'payable' | 'pay' | 'void' | 'reverse' | 'third-parties' | 'third-party', ... }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: ledger, isLoading, error: ledgerError, refetch } = useQuery({
    queryKey: ['financial-payables-ledger', filterQuery],
    queryFn: async () => (await axios.get(apiUrl(`/payables-ledger?${filterQuery}`), authed())).data,
    enabled
  });
  const { data: thirdPartiesData, isLoading: loadingThirdParties } = useQuery({
    queryKey: ['financial-third-parties'],
    queryFn: async () => (await axios.get(apiUrl('/third-parties'), { ...authed(), params: { includeInactive: true } })).data,
    enabled
  });
  const thirdParties = thirdPartiesData?.thirdParties || [];

  const close = () => { setDialog(null); setError(''); };
  const run = async (request, { success, keepOpen = false } = {}) => {
    setSaving(true); setError('');
    try {
      const { data } = await request();
      await invalidateFinancialQueries(queryClient);
      toast.success(data?.message || success);
      if (!keepOpen) close();
      return data;
    } catch (requestError) {
      console.error('[Por pagar] Operación fallida:', requestError.response?.data || requestError);
      setError(errorMessage(requestError, 'No fue posible completar la operación.'));
      return null;
    } finally { setSaving(false); }
  };

  const saveThirdParty = (form) => run(() => (form.id ? axios.patch(apiUrl(`/third-parties/${form.id}`), form, authed()) : axios.post(apiUrl('/third-parties'), form, authed())), { success: 'Tercero guardado.' })
    .then((data) => { if (data?.thirdParty && dialog?.returnTo === 'payable') setDialog({ kind: 'payable', defaultThirdPartyId: data.thirdParty.id }); });
  const savePayable = (form) => run(() => (dialog?.payable ? axios.patch(apiUrl(`/payables/${dialog.payable.id}`), form, authed()) : axios.post(apiUrl('/payables'), form, authed())), { success: 'Cuenta por pagar registrada.' });
  const pay = async (form) => {
    const { file, ...payload } = form;
    const data = await run(() => axios.post(apiUrl(`/payables/${dialog.payable.id}/payments`), payload, authed()), { success: 'Pago registrado.' });
    if (data?.financialRecord?.id && file) {
      try { await uploadRecordDocument(data.financialRecord.id, file); await invalidateFinancialQueries(queryClient); toast.success('Comprobante guardado.'); }
      catch (uploadError) { console.error('[Por pagar] Comprobante no subido:', uploadError.response?.data || uploadError); toast.error(errorMessage(uploadError, 'El pago quedó, pero el comprobante no se pudo subir.')); }
    }
  };
  const voidPayable = (reason) => run(() => axios.post(apiUrl(`/payables/${dialog.payable.id}/void`), { reason }, authed()), { success: 'Cuenta anulada.' });
  const reversePayment = (reason) => run(() => axios.post(apiUrl(`/payable-payments/${dialog.payment.id}/reverse`), { reason }, authed()), { success: 'Pago revertido.' });
  const documentsChanged = async (message) => { await invalidateFinancialQueries(queryClient); toast.success(message); };

  const totals = ledger?.totals || { outstanding: 0, overdue: 0, paidInPeriod: 0, openCount: 0, overdueCount: 0 };

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300" data-payables-tab>
      <FinancialSectionHeader title="Proveedores y gastos"
        description="Lo que Brain Studio les debe a proveedores, equipo, arrendador y socios: herramientas, apps, dotaciones, arriendo. Pagar una cuenta crea el egreso en Movimientos. La nómina se liquida en su vista, al lado.">
        <button type="button" data-third-parties-open onClick={() => setDialog({ kind: 'third-parties' })} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Terceros</button>
        {canWrite && <button type="button" data-payable-new onClick={() => setDialog({ kind: 'payable' })} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Nueva cuenta por pagar</button>}
      </FinancialSectionHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <FinancialSummaryCard label="Por pagar" value={<span data-payables-outstanding>{formatCurrency(totals.outstanding)}</span>}
          hint={`${totals.openCount} cuenta${totals.openCount === 1 ? '' : 's'} abierta${totals.openCount === 1 ? '' : 's'}`} />
        <FinancialSummaryCard label="Vencido" value={formatCurrency(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'neutral'}
          hint={`${totals.overdueCount} cuenta${totals.overdueCount === 1 ? '' : 's'} vencida${totals.overdueCount === 1 ? '' : 's'}`} />
        <FinancialSummaryCard label="Pagado en el periodo" value={formatCurrency(totals.paidInPeriod)} hint="Según los filtros de arriba" />
      </div>

      {ledgerError ? <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">No fue posible cargar las cuentas por pagar.<button type="button" onClick={() => refetch()} className="ml-3 min-h-11 underline">Reintentar</button></div>
        : isLoading ? <div className="rounded-2xl border border-zinc-200/50 bg-white p-10 text-center dark:border-white/5 dark:bg-zinc-900"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" /><p className="text-sm font-semibold text-zinc-900 dark:text-white">Cargando cuentas por pagar…</p></div>
          : !ledger?.items?.length ? <div className="rounded-2xl border border-zinc-200/50 bg-white p-10 text-center dark:border-white/5 dark:bg-zinc-900"><h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Sin cuentas por pagar</h4><p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">Nada abierto, y nada cerrado en el periodo elegido. Registra la primera con «Nueva cuenta por pagar».</p></div>
            : <div className="space-y-3">
              {ledger.items.map((group) => {
                const open = !!expanded[group.thirdParty.id];
                return (
                  <Card key={group.thirdParty.id} data-payable-group className="rounded-2xl border-zinc-200/50 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-zinc-900">
                    <button type="button" aria-expanded={open} onClick={() => setExpanded((prev) => ({ ...prev, [group.thirdParty.id]: !prev[group.thirdParty.id] }))} className="group flex min-h-11 w-full items-center justify-between gap-3 text-left">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-coral/10 text-sm font-semibold text-brand-coral-deep dark:text-brand-coral">{group.thirdParty.name.substring(0, 2).toUpperCase()}</div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-zinc-900 transition-colors group-hover:text-primary dark:text-white">{group.thirdParty.name}</h4>
                          <p className="text-xs text-zinc-500">{thirdPartyKindLabel(group.thirdParty.kind)} · {group.payables.length} cuenta{group.payables.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(group.outstanding)}</p>
                          <span className={cn('text-xs', group.overdue > 0 ? 'text-destructive' : 'text-zinc-600 dark:text-zinc-300')}>{group.overdue > 0 ? `Vencido: ${formatCurrency(group.overdue)}` : group.outstanding > 0 ? 'Por vencer' : 'Sin saldo pendiente'}</span>
                        </div>
                        {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                      </div>
                    </button>
                    {open && (
                      <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 dark:border-white/5">
                        {group.payables.map((payable) => {
                          const closed = isPayableClosed(payable.status);
                          const paymentsOpen = !!expandedPayments[payable.id];
                          const activePayments = payable.payments.filter((payment) => !payment.reversedAt);
                          return (
                            <div key={payable.id} data-payable-row data-payable-status={payable.status} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-zinc-900 dark:text-white">{payable.concept}{payable.documentNumber && <span className="ml-2 text-xs font-normal text-zinc-500">· {payable.documentNumber}</span>}</p>
                                  <p className="mt-0.5 text-xs text-zinc-500">{financialCategoryLabel(payable.category)} · llegó el {day(payable.receivedAt)}{payable.dueDate ? ` · vence el ${day(payable.dueDate)}` : ''}</p>
                                  {payable.notes && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{payable.notes}</p>}
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(payable.amount)}</p>
                                  {!closed && payable.paidAmount > 0 && <p className="text-xs text-zinc-500">Pagado {formatCurrency(payable.paidAmount)} · falta {formatCurrency(payable.outstanding)}</p>}
                                  <span data-payable-due={payable.dueState.key} className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    payable.status === 'PAGADA' && 'bg-status-positive/10 text-status-positive',
                                    payable.status === 'ANULADA' && 'bg-zinc-100 text-zinc-500 dark:bg-white/10',
                                    payable.status === 'PARCIAL' && 'bg-primary/10 text-primary',
                                    payable.status === 'POR_PAGAR' && (payable.dueState.key === 'VENCIDA' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'))}>
                                    {closed ? payableStatusLabel(payable.status) : payable.dueState.label}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <RecordDocumentsInline recordId={payable.id} documents={payable.documents} api={payableDocumentsApi} canWrite={canWrite && payable.status !== 'ANULADA'} onChanged={documentsChanged} onError={(message) => toast.error(message)} />
                                {payable.payments.length > 0 && (
                                  <button type="button" data-payable-payments-toggle aria-expanded={paymentsOpen} onClick={() => setExpandedPayments((prev) => ({ ...prev, [payable.id]: !prev[payable.id] }))} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                    {paymentsOpen ? 'Ocultar pagos' : activePayments.length > 0 ? `Ver ${activePayments.length} pago${activePayments.length === 1 ? '' : 's'}` : 'Ver pagos'}{paymentsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </button>
                                )}
                                {canWrite && !closed && <button type="button" data-payable-pay onClick={() => setDialog({ kind: 'pay', payable: { ...payable, thirdParty: group.thirdParty } })} className="ml-auto min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Registrar pago</button>}
                                {canWrite && !closed && <button type="button" onClick={() => setDialog({ kind: 'payable', payable })} className="min-h-9 rounded-lg px-2 text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-300">Corregir</button>}
                                {canWrite && payable.status === 'POR_PAGAR' && activePayments.length === 0 && <button type="button" onClick={() => setDialog({ kind: 'void', payable })} className="min-h-9 rounded-lg px-2 text-xs font-medium text-destructive brain-destructive-text hover:underline">Anular</button>}
                              </div>
                              {paymentsOpen && (
                                <ul className="mt-2 space-y-1.5" data-payable-payments>
                                  {payable.payments.map((payment) => (
                                    <li key={payment.id} data-payable-payment className={cn('rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.02]', payment.reversedAt && 'opacity-60')}>
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <span className={cn('w-24 shrink-0 font-medium text-zinc-900 dark:text-white', payment.reversedAt && 'line-through')}>{formatCurrency(payment.amount)}</span>
                                        <span className="text-zinc-500">{day(payment.paidAt)}</span>
                                        <span className="truncate text-zinc-500">{payment.accountName || 'Sin cuenta'}</span>
                                        <span className="min-w-[6rem] flex-1 truncate text-zinc-600 dark:text-zinc-300">{payment.reference || <span className="text-zinc-400">Sin referencia</span>}</span>
                                        {payment.reversedAt ? <span className="text-destructive">Revertido: {payment.reversalReason}</span>
                                          : canWrite && <button type="button" onClick={() => setDialog({ kind: 'reverse', payment })} className="text-destructive brain-destructive-text hover:underline">Revertir</button>}
                                      </div>
                                      {!payment.reversedAt && <RecordDocumentsInline className="mt-1" recordId={payment.financialRecordId} documents={payment.documents} canWrite={canWrite} onChanged={documentsChanged} onError={(message) => toast.error(message)} />}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>}

      {dialog?.kind === 'third-parties' && <ThirdPartiesDialog open thirdParties={thirdParties} loading={loadingThirdParties} canWrite={canWrite} onClose={close}
        onCreate={() => setDialog({ kind: 'third-party', thirdParty: null, returnTo: 'third-parties' })} onEdit={(thirdParty) => setDialog({ kind: 'third-party', thirdParty, returnTo: 'third-parties' })} />}
      {dialog?.kind === 'third-party' && <ThirdPartyDialog open thirdParty={dialog.thirdParty} saving={saving} error={error}
        onClose={() => (dialog.returnTo === 'third-parties' ? setDialog({ kind: 'third-parties' }) : dialog.returnTo === 'payable' ? setDialog({ kind: 'payable' }) : close())}
        onSubmit={(form) => saveThirdParty(form).then(() => { if (dialog.returnTo === 'third-parties') setDialog({ kind: 'third-parties' }); })} />}
      {dialog?.kind === 'payable' && <PayableDialog key={dialog.payable?.id || dialog.defaultThirdPartyId || 'new'} open payable={dialog.payable || null} thirdParties={thirdParties} defaultThirdPartyId={dialog.defaultThirdPartyId || ''} saving={saving} error={error} onClose={close} onSubmit={savePayable}
        onNewThirdParty={() => setDialog({ kind: 'third-party', thirdParty: null, returnTo: 'payable' })} />}
      {dialog?.kind === 'pay' && <PayablePaymentDialog payable={dialog.payable} accounts={accounts} saving={saving} error={error} onClose={close} onSubmit={pay} />}
      {dialog?.kind === 'void' && <ReasonDialog open title="Anular cuenta por pagar" description={`${dialog.payable.concept} · ${formatCurrency(dialog.payable.amount)}. La cuenta queda anulada con su motivo; no se borra.`} confirmLabel="Anular" saving={saving} onClose={close} onConfirm={voidPayable} />}
      {dialog?.kind === 'reverse' && <ReasonDialog open title="Revertir pago" description={`${formatCurrency(dialog.payment.amount)} del ${day(dialog.payment.paidAt)}. El pago queda como evidencia y su egreso en Movimientos se anula.`} confirmLabel="Revertir" saving={saving} onClose={close} onConfirm={reversePayment} />}
    </div>
  );
}
