import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { CheckCircle2, Clock, Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { FORMALIZATION_CONDITIONS_MAX, FORMALIZATION_REASON_MAX, exceptionProblem, missingText } from '@/lib/projectFormalization';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import FormalizationDocuments from './FormalizationDocuments';
import { FinancialSectionHeader, FinancialSummaryCard } from './FinancialSectionParts';

// Formalización de proyectos (punto 3 de la solicitud de Elisa; Rodny, 29 de octubre de 2026). Cada cotización aprobada
// pide el contrato firmado y el anticipo —o la autorización para empezar sin él—; con las dos cosas el proyecto queda
// habilitado y su project manager recibe el aviso. Solo la ven Dirección y Administrativa y contable.
export const FORMALIZATIONS_KEY = ['financial-formalizations'];
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const money = (value, currency = 'COP') => new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: currency === 'USD' ? 2 : 0 }).format(Number(value) || 0);
const day = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const civilDay = (value) => (value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');
// Lo que escribió la persona, sin el punto final: la frase lo pone una sola vez.
const sentence = (text) => String(text || '').trim().replace(/[.\s]+$/, '');
const bogotaToday = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

const ADVANCE_TEXT = { PAGADO: 'Pagado', PARCIAL: 'Pago parcial', PENDIENTE: 'Por pagar', SIN_CUENTA: 'Sin cuenta ligada' };

function Step({ done, title, children }) {
    return (
        <div className="flex gap-3 py-3" data-formalization-step={title}>
            {done
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-positive-fg" aria-label="Listo" />
                : <Clock className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-label="Pendiente" />}
            <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                {children}
            </div>
        </div>
    );
}

function ExceptionDialog({ item, onClose, onSaved }) {
    const [form, setForm] = useState({ reason: '', conditions: '', paymentDate: '' });
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setProblem(''); };
    const save = async () => {
        const invalid = exceptionProblem(form, bogotaToday());
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await axios.post(`${getApiBaseUrl()}/api/financials/formalizations/${item.id}/exception`, form, auth());
            await onSaved('Autorización guardada');
        } catch (error) {
            console.error('[Formalización] Autorización no guardada:', error.response?.data || error.message);
            setProblem(error.response?.data?.error || 'No pudimos guardar la autorización.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-formalization-exception className="sm:max-w-lg dark:bg-zinc-900"
                onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
                <DialogHeader>
                    <DialogTitle>Empezar sin el anticipo</DialogTitle>
                    <DialogDescription>{item.client?.name || item.quotation?.company || item.quotation?.clientName} · {item.quotation?.code}. La deuda sigue en Cuentas por cobrar.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span>
                        <textarea className={cn(field, 'min-h-20')} maxLength={FORMALIZATION_REASON_MAX} value={form.reason} onChange={(event) => set({ reason: event.target.value })} data-exception-field="reason" />
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Condiciones <span className="text-zinc-400">(opcional)</span></span>
                        <textarea className={cn(field, 'min-h-16')} maxLength={FORMALIZATION_CONDITIONS_MAX} value={form.conditions} onChange={(event) => set({ conditions: event.target.value })} data-exception-field="conditions" />
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Fecha de pago acordada</span>
                        <BrainDatePicker className={field} value={form.paymentDate} min={bogotaToday()} onChange={(paymentDate) => set({ paymentDate: paymentDate || '' })} ariaLabel="Fecha de pago acordada" />
                    </label>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-exception-save
                        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        {saving ? 'Guardando…' : 'Autorizar'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AdvanceLink({ item, onSaved }) {
    const [receivableId, setReceivableId] = useState('');
    const [saving, setSaving] = useState(false);
    if (!item.clientReceivables?.length) {
        return <p className="text-xs text-zinc-500 dark:text-zinc-400">La cotización no traía plan de pagos. Crea la cuenta del anticipo en Cuentas por cobrar y vuelve a ligarla aquí.</p>;
    }
    const link = async () => {
        setSaving(true);
        try {
            await axios.put(`${getApiBaseUrl()}/api/financials/formalizations/${item.id}/advance`, { receivableId }, auth());
            await onSaved('Cuenta del anticipo ligada');
        } catch (error) {
            console.error('[Formalización] Anticipo no ligado:', error.response?.data || error.message);
            toast.error(error.response?.data?.error || 'No pudimos ligar la cuenta del anticipo.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-2" data-formalization-advance-link>
            <Select className={cn(field, 'w-auto min-w-64')} value={receivableId} onChange={(event) => setReceivableId(event.target.value)} aria-label="Cuenta por cobrar del anticipo">
                <option value="">Elige la cuenta del anticipo</option>
                {item.clientReceivables.map((receivable) => (
                    <option key={receivable.id} value={receivable.id}>{[receivable.number ? `No. ${String(receivable.number).padStart(4, '0')}` : 'Sin emitir', receivable.label, money(receivable.amount)].filter(Boolean).join(' · ')}</option>
                ))}
            </Select>
            <button type="button" disabled={!receivableId || saving} onClick={link} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Ligar'}
            </button>
        </div>
    );
}

function FormalizationCard({ item, onSaved, onError, onOpenReceivables, onException }) {
    const enabled = item.status === 'HABILITADO';
    const { state } = item;
    const name = item.client?.name || item.quotation?.company || item.quotation?.clientName || 'Cliente';
    return (
        <Card data-formalization={item.id} data-formalization-status={item.status}
            className="rounded-2xl border-zinc-200/50 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-zinc-900 dark:text-white">{name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.quotation?.code} · aprobada el {day(item.quotation?.acceptedAt || item.requestedAt)} · {money(item.quotation?.total, item.quotation?.currency)}
                    </p>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-xs font-semibold',
                    enabled ? 'bg-status-positive/10 text-status-positive-fg' : 'bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300')}>
                    {enabled ? 'Habilitado para iniciar' : 'Por formalizar'}
                </span>
            </div>
            <div className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
                <Step done={state.contract} title="Contrato firmado">
                    {!state.contract && <p className="text-xs text-zinc-500 dark:text-zinc-400">El contrato firmado o un soporte verificable: PDF, JPG o PNG. Después, los otrosí y los anexos.</p>}
                    <FormalizationDocuments formalizationId={item.id} documents={item.documents} onSaved={onSaved} onError={onError} />
                </Step>
                <Step done={state.advanceCovered} title="Anticipo">
                    {item.advance && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-300" data-formalization-advance={state.advance}>
                            {ADVANCE_TEXT[state.advance]} · {money(item.advance.amount)}{item.advance.number ? ` · cuenta de cobro No. ${String(item.advance.number).padStart(4, '0')}` : ' · sin emitir'}
                            {!enabled && state.advance !== 'PAGADO' && (
                                <button type="button" onClick={onOpenReceivables} className="ml-2 min-h-8 font-semibold text-primary">Ir a Cuentas por cobrar</button>
                            )}
                        </p>
                    )}
                    {!item.advance && !enabled && <AdvanceLink item={item} onSaved={onSaved} />}
                    {item.exception && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-300" data-formalization-exception-detail>
                            {item.exception.byName || 'Dirección'} autorizó empezar sin el anticipo el {day(item.exception.at)}: {sentence(item.exception.reason)}.
                            {item.exception.conditions ? ` ${sentence(item.exception.conditions)}.` : ''} Pago acordado para el {civilDay(item.exception.paymentDate)}.
                        </p>
                    )}
                    {!enabled && !item.exception && state.advance !== 'PAGADO' && (
                        <button type="button" onClick={() => onException(item)} data-formalization-exception-open
                            className="min-h-11 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5">
                            Autorizar empezar sin el anticipo
                        </button>
                    )}
                </Step>
                <Step done={enabled} title="Proyecto">
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">
                        {enabled
                            ? `Habilitado el ${day(item.enabledAt)}. ${item.projectManagerNotified ? `Se le avisó a ${item.client?.projectManager || 'Project management'}.` : 'Todavía no hay project manager a quién avisar.'}`
                            : `${missingText(state.missing)} para habilitarlo.`}
                    </p>
                </Step>
            </div>
        </Card>
    );
}

export default function FormalizationsTab({ enabled, onOpenReceivables }) {
    const queryClient = useQueryClient();
    const [exceptionFor, setExceptionFor] = useState(null);
    const { data, isLoading, error } = useQuery({
        queryKey: FORMALIZATIONS_KEY,
        enabled,
        queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/formalizations`, auth())).data
    });
    const items = data?.items || [];
    const pending = items.filter((item) => item.status !== 'HABILITADO');
    const done = items.filter((item) => item.status === 'HABILITADO');
    const saved = async (message) => {
        await queryClient.invalidateQueries({ queryKey: FORMALIZATIONS_KEY });
        invalidateFinancialQueries(queryClient);
        setExceptionFor(null);
        if (message) toast.success(message);
    };
    const failed = (message) => toast.error(message);

    return (
        <div className="space-y-6" data-formalizations>
            <FinancialSectionHeader title="Formalización de proyectos"
                description="Cada cotización aprobada pide el contrato firmado y el anticipo. Con las dos cosas el proyecto queda habilitado y su project manager recibe el aviso." />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <FinancialSummaryCard label="Por formalizar" value={isLoading ? '—' : pending.length} />
                <FinancialSummaryCard label="Habilitados" value={isLoading ? '—' : done.length} />
            </div>
            {error && <p role="alert" className="brain-alert-surface rounded-xl p-4 text-sm">{error.response?.data?.error || 'No pudimos cargar las formalizaciones.'}</p>}
            {isLoading && <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</p>}
            {!isLoading && !error && items.length === 0 && (
                <Card className="rounded-2xl border-zinc-200/50 bg-white p-6 text-sm text-zinc-500 dark:border-white/5 dark:bg-zinc-900 dark:text-zinc-400">
                    Todavía no hay cotizaciones aprobadas por formalizar. Aparecen aquí en cuanto el cliente aprueba o Comercial registra la aprobación.
                </Card>
            )}
            {[{ key: 'pending', title: 'Por formalizar', list: pending }, { key: 'done', title: 'Habilitados', list: done }].filter((section) => section.list.length).map((section) => (
                <section key={section.key} className="space-y-3" data-formalization-section={section.key}>
                    <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{section.title}</h3>
                    {section.list.map((item) => (
                        <FormalizationCard key={item.id} item={item} onSaved={saved} onError={failed} onOpenReceivables={onOpenReceivables} onException={setExceptionFor} />
                    ))}
                </section>
            ))}
            {exceptionFor && <ExceptionDialog item={exceptionFor} onClose={() => setExceptionFor(null)} onSaved={saved} />}
        </div>
    );
}
