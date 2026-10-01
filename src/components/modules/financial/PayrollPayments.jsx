import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Select from '@/components/ui/Select';
import MoneyInput from '@/components/ui/MoneyInput';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileText, Loader2, MoreHorizontal, Paperclip, Plus, Trash2, X } from '@/components/ui/icons';
import ChatFilePreview from '@/components/chat/ChatFilePreview';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { activePayrollPayments, initialSplitParts, payrollDocumentProblem, reversedPayrollPayments, splitBalance } from '@/lib/payrollPayments';
import { cn } from '@/lib/utils';

// Pagos de una liquidación de nómina (Rodny, 30 de septiembre de 2026: «ese pago se hizo el 15
// y el 30 y antes se le hicieron adelantos … necesito poder editar el pago para partirlo y subir
// las referencias»). Cada pago tiene su fecha, su cuenta, su referencia y sus comprobantes; se
// desglosa, se revierte o se le corrige la referencia. El dinero nunca se edita a mano.

const FIELD = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const api = (path) => `${getApiBaseUrl()}/api/financials${path}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const messageOf = (error, fallback) => error?.response?.data?.message || fallback;

const uploadPaymentDocument = async (recordId, file) => {
    const body = new FormData();
    body.append('file', file, file.name);
    await axios.post(api(`/records/${recordId}/documents`), body, { headers: authHeaders() });
};

function AccountSelect({ accounts, value, onChange, label, required = true }) {
    return (
        <Select required={required} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={FIELD}>
            <option value="">Seleccionar...</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </Select>
    );
}

/** Registrar un pago: todo lo que falta o una parte, o aplicar un adelanto ya registrado. */
export function PayrollPaymentDialog({ transaction, collaboratorName, accounts = [], formatCurrency, onClose, onSaved }) {
    const outstanding = Number(transaction?.outstanding ?? transaction?.netAmount ?? 0);
    const [mode, setMode] = useState('new');
    const [form, setForm] = useState(() => ({ amount: String(outstanding || ''), paidAt: today(), accountId: '', reference: '', notes: '' }));
    const [file, setFile] = useState(null);
    const [candidates, setCandidates] = useState(null);
    const [recordId, setRecordId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const fileInput = useRef(null);

    useEffect(() => {
        if (mode !== 'existing' || candidates !== null || !transaction?.id) return undefined;
        let active = true;
        axios.get(api(`/payroll-transactions/${transaction.id}/payment-candidates`), { headers: authHeaders() })
            .then(({ data }) => { if (active) setCandidates(Array.isArray(data?.records) ? data.records : []); })
            .catch((requestError) => {
                console.error('Error loading payroll payment candidates:', requestError.response?.data || requestError);
                if (active) { setCandidates([]); setError(messageOf(requestError, 'No fue posible cargar los egresos registrados.')); }
            });
        return () => { active = false; };
    }, [mode, candidates, transaction?.id]);

    const pickFile = (selected) => {
        const problem = payrollDocumentProblem(selected);
        if (problem) { setError(problem); setFile(null); return; }
        setError('');
        setFile(selected || null);
    };

    const submit = async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            const body = mode === 'existing'
                ? { financialRecordId: recordId, reference: form.reference, notes: form.notes }
                : { amount: form.amount, paidAt: form.paidAt, accountId: form.accountId, reference: form.reference, notes: form.notes };
            const { data } = await axios.post(api(`/payroll-transactions/${transaction.id}/pay`), body, { headers: authHeaders() });
            let message = data?.message || 'Pago de nómina registrado.';
            // El pago ya quedó guardado: si el comprobante falla se dice, pero no se deshace el pago.
            if (file && data?.financialRecord?.id) {
                try {
                    await uploadPaymentDocument(data.financialRecord.id, file);
                } catch (uploadError) {
                    console.error('Error uploading payroll payment document:', uploadError.response?.data || uploadError);
                    message = `${message} El comprobante no se subió: ${messageOf(uploadError, 'inténtalo desde el pago.')}`;
                }
            }
            await onSaved(message);
        } catch (requestError) {
            console.error('Error paying payroll transaction:', requestError.response?.data || requestError);
            setError(messageOf(requestError, 'No fue posible registrar el pago de nómina.'));
        } finally {
            setSaving(false);
        }
    };

    const selectedCandidate = (candidates || []).find((record) => record.id === recordId);
    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Registrar pago de nómina</DialogTitle>
                    <DialogDescription>{collaboratorName}. Puedes pagar todo lo que falta o una parte: un adelanto, la quincena del 15, la del 30.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm dark:bg-white/5">
                        <span className="text-zinc-500">Valor neto</span>
                        <strong className="text-right text-zinc-900 dark:text-white">{formatCurrency(transaction?.netAmount || 0)}</strong>
                        <span className="text-zinc-500">Falta por pagar</span>
                        <strong className="text-right text-zinc-900 dark:text-white" data-payroll-outstanding>{formatCurrency(outstanding)}</strong>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="radiogroup" aria-label="Tipo de pago">
                        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="payroll-mode" checked={mode === 'new'} onChange={() => { setMode('new'); setError(''); }} />Registrar un pago nuevo</label>
                        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="payroll-mode" checked={mode === 'existing'} onChange={() => { setMode('existing'); setError(''); }} />Aplicar un egreso ya registrado</label>
                    </div>
                    {mode === 'new' ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Valor</span>
                                    <MoneyInput required min="0.01" aria-label="Valor del pago" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} className={FIELD} />
                                </label>
                                <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Fecha</span>
                                    <BrainDatePicker ariaLabel="Fecha del pago de nómina" required value={form.paidAt} onChange={(paidAt) => setForm((current) => ({ ...current, paidAt }))} className="rounded-lg py-2.5" />
                                </label>
                            </div>
                            <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Cuenta</span>
                                <AccountSelect accounts={accounts} label="Cuenta del pago de nómina" value={form.accountId} onChange={(accountId) => setForm((current) => ({ ...current, accountId }))} />
                            </label>
                        </>
                    ) : (
                        <div className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                            <span className="block">Egreso de nómina que ya está en Movimientos</span>
                            {candidates === null
                                ? <p className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando egresos de nómina...</p>
                                : candidates.length === 0
                                    ? <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-zinc-500 dark:border-white/15">No hay egresos de nómina registrados a mano que quepan en lo que falta. Si el adelanto está con otra categoría, cámbiala a Nómina en Movimientos.</p>
                                    : (
                                        <Select required aria-label="Egreso ya registrado" value={recordId} onChange={(event) => setRecordId(event.target.value)} className={FIELD}>
                                            <option value="">Seleccionar...</option>
                                            {candidates.map((record) => <option key={record.id} value={record.id}>{`${formatDate(record.date)} · ${formatCurrency(record.amount)} · ${record.description}`}</option>)}
                                        </Select>
                                    )}
                            {selectedCandidate && <p className="text-xs text-zinc-500">Se aplica entero, con su fecha y su cuenta. No se crea otro egreso.</p>}
                        </div>
                    )}
                    <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Referencia</span>
                        <input value={form.reference} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Transferencia, comprobante..." className={FIELD} />
                    </label>
                    <div className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                        <span className="block">Comprobante <span className="text-zinc-400">(opcional)</span></span>
                        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => pickFile(event.target.files?.[0])} />
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-white/10"><Paperclip className="h-4 w-4" />{file ? 'Cambiar archivo' : 'Subir comprobante'}</button>
                            {file && <span className="min-w-0 truncate text-xs text-zinc-500">{file.name}</span>}
                        </div>
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
                    <DialogFooter>
                        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button>
                        <button type="submit" disabled={saving || (mode === 'existing' && !recordId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar pago
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// «Desglosar» (Rodny, 30 de septiembre de 2026: «no pongas partir sino desglosar, o sea esta es la
// misma lógica de los desgloses internos … y obviamente el poder añadir los documentos de
// respaldo»). Se ve y se cuadra como el desglose interno de un movimiento: ítems que suman
// exactamente el pago. La diferencia es que cada ítem salió de la cuenta en su propia fecha, así
// que cada uno queda como su propio egreso, con su referencia y su documento de respaldo.
function DesgloseDialog({ payment, accounts, formatCurrency, onClose, onSaved }) {
    const [parts, setParts] = useState(() => initialSplitParts(payment, today()).map((part) => ({ ...part, file: null })));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const fileInputs = useRef({});
    const balance = splitBalance(parts, payment.amount);
    const setPart = (index, patch) => setParts((current) => current.map((part, position) => (position === index ? { ...part, ...patch } : part)));
    const pickFile = (index, file) => {
        const problem = payrollDocumentProblem(file);
        if (problem) { setError(problem); return; }
        setError('');
        setPart(index, { file: file || null });
    };

    const submit = async (event) => {
        event.preventDefault();
        if (saving || !balance.ready) return;
        setSaving(true);
        setError('');
        try {
            const body = { parts: parts.map(({ file: _file, ...part }) => part) };
            const { data } = await axios.post(api(`/payroll-payments/${payment.id}/split`), body, { headers: authHeaders() });
            let message = data?.message || 'Pago desglosado.';
            // El desglose ya quedó guardado: un documento que no sube se dice, no lo deshace.
            const failed = [];
            for (const [index, part] of parts.entries()) {
                const recordId = data?.payments?.[index]?.financialRecordId;
                if (!part.file || !recordId) continue;
                try {
                    await uploadPaymentDocument(recordId, part.file);
                } catch (uploadError) {
                    console.error('Error uploading payroll desglose document:', uploadError.response?.data || uploadError);
                    failed.push(part.file.name);
                }
            }
            if (failed.length) message = `${message} No se subió: ${failed.join(', ')}. Súbelo desde el ítem.`;
            await onSaved(message);
        } catch (requestError) {
            console.error('Error splitting payroll payment:', requestError.response?.data || requestError);
            setError(messageOf(requestError, 'No fue posible desglosar el pago.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Desglosar pago de {formatCurrency(payment.amount)}</DialogTitle>
                    <DialogDescription>Reparte el pago en lo que de verdad se pagó —adelantos, quincenas—, cada ítem con su fecha, su cuenta, su referencia y su documento de respaldo. La suma debe coincidir exactamente con el pago.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    {parts.map((part, index) => (
                        <div key={index} data-split-part className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-white/10">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] sm:items-end">
                                <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block">Valor</span>
                                    <MoneyInput required min="0.01" aria-label={`Valor del ítem ${index + 1}`} value={part.amount} onChange={(amount) => setPart(index, { amount })} className={FIELD} />
                                </label>
                                <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block">Fecha</span>
                                    <BrainDatePicker ariaLabel={`Fecha del ítem ${index + 1}`} required value={part.paidAt} onChange={(paidAt) => setPart(index, { paidAt })} className="rounded-lg py-2.5" />
                                </label>
                                <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block">Cuenta</span>
                                    <AccountSelect accounts={accounts} label={`Cuenta del ítem ${index + 1}`} value={part.accountId} onChange={(accountId) => setPart(index, { accountId })} />
                                </label>
                                <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300"><span className="block">Referencia</span>
                                    <input value={part.reference} maxLength={200} aria-label={`Referencia del ítem ${index + 1}`} onChange={(event) => setPart(index, { reference: event.target.value })} placeholder="Adelanto, quincena..." className={FIELD} />
                                </label>
                                <button type="button" disabled={parts.length <= 2} onClick={() => setParts((current) => current.filter((_, position) => position !== index))}
                                    aria-label={`Quitar el ítem ${index + 1}`} className="grid h-11 w-11 place-items-center rounded-lg text-destructive brain-destructive-text hover:bg-destructive/10 disabled:opacity-30">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-split-document={index}
                                    ref={(node) => { fileInputs.current[index] = node; }}
                                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) pickFile(index, file); }} />
                                <button type="button" onClick={() => fileInputs.current[index]?.click()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10">
                                    <Paperclip className="h-3.5 w-3.5" />{part.file ? 'Cambiar documento' : 'Documento de respaldo'}
                                </button>
                                {part.file && (
                                    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-zinc-500">
                                        <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{part.file.name}</span>
                                        <button type="button" aria-label={`Quitar ${part.file.name}`} onClick={() => setPart(index, { file: null })} className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" disabled={parts.length >= 12} onClick={() => setParts((current) => [...current, { amount: '', paidAt: today(), accountId: payment.accountId || '', reference: '', file: null }])}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"><Plus className="h-4 w-4" />Añadir ítem</button>
                        <p data-split-balance className={cn('text-sm font-medium', balance.diffCents === 0 ? 'text-zinc-600 dark:text-zinc-300' : 'text-destructive brain-destructive-text')}>
                            {balance.diffCents > 0
                                ? `Faltan ${formatCurrency(balance.diffCents / 100)} por repartir`
                                : balance.diffCents < 0
                                    ? `Sobran ${formatCurrency(-balance.diffCents / 100)}`
                                    : balance.ready ? 'El desglose cuadra con el pago.' : 'Cada ítem necesita valor, fecha y cuenta.'}
                        </p>
                    </div>
                    {payment.documents?.length > 0 && <p className="text-xs text-zinc-500">Los documentos que ya tenía el pago se conservan en su movimiento original, que queda anulado. Súbelos al ítem que corresponda.</p>}
                    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
                    <DialogFooter>
                        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button>
                        <button type="submit" disabled={saving || !balance.ready} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Aplicar desglose
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ReverseDialog({ payment, formatCurrency, onClose, onSaved }) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        if (saving || !reason.trim()) return;
        setSaving(true);
        setError('');
        try {
            const { data } = await axios.post(api(`/payroll-payments/${payment.id}/reverse`), { reason }, { headers: authHeaders() });
            await onSaved(data?.message || 'Pago revertido.');
        } catch (requestError) {
            console.error('Error reversing payroll payment:', requestError.response?.data || requestError);
            setError(messageOf(requestError, 'No fue posible revertir el pago.'));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Revertir pago de {formatCurrency(payment.amount)}</DialogTitle>
                    <DialogDescription>El pago queda en el historial, tachado con su motivo, y deja de sumar. Si lo creó la plataforma, su egreso se anula; si era un egreso registrado a mano, se conserva y queda libre.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Motivo</span>
                        <textarea required rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD} placeholder="Se registró con la cuenta equivocada..." />
                    </label>
                    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
                    <DialogFooter>
                        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button>
                        <button type="submit" disabled={saving || !reason.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Revertir pago
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditDialog({ payment, onClose, onSaved }) {
    const [form, setForm] = useState({ reference: payment.reference || '', notes: payment.notes || '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError('');
        try {
            const { data } = await axios.patch(api(`/payroll-payments/${payment.id}`), form, { headers: authHeaders() });
            await onSaved(data?.message || 'Pago actualizado.');
        } catch (requestError) {
            console.error('Error updating payroll payment:', requestError.response?.data || requestError);
            setError(messageOf(requestError, 'No fue posible actualizar el pago.'));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Referencia del pago</DialogTitle>
                    <DialogDescription>Cambia la referencia y la nota. El valor, la fecha y la cuenta no se tocan: para eso está «Desglosar».</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Referencia</span>
                        <input value={form.reference} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} className={FIELD} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">Nota</span>
                        <textarea rows={3} maxLength={1000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={FIELD} />
                    </label>
                    {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
                    <DialogFooter>
                        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button>
                        <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/** Los pagos de una liquidación, debajo de su fila en Nómina Operativa. */
export function PayrollPaymentList({ transaction, accounts = [], formatCurrency, canApprove, canWrite, onChanged, onError, inlineActions = false }) {
    const [dialog, setDialog] = useState(null);
    const [showReversed, setShowReversed] = useState(false);
    const [uploadingFor, setUploadingFor] = useState('');
    const [preview, setPreview] = useState(null);
    const fileInputs = useRef({});
    const active = activePayrollPayments(transaction);
    const reversed = reversedPayrollPayments(transaction);
    if (!active.length && !reversed.length) return null;

    const closePreview = () => setPreview((current) => { if (current?.url) URL.revokeObjectURL(current.url); return null; });
    const openDocument = async (payment, document, download = false) => {
        try {
            const response = await axios.get(api(`/records/${payment.financialRecordId}/documents/${document.id}/file`), { headers: authHeaders(), responseType: 'blob' });
            const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: document.mimeType });
            const url = URL.createObjectURL(blob);
            if (download) {
                const anchor = window.document.createElement('a');
                anchor.href = url;
                anchor.download = document.name;
                window.document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                return;
            }
            // El visor recibe los bytes de un PDF: la política de la página no le deja leer un `blob:`.
            const data = document.mimeType === 'application/pdf' ? await blob.arrayBuffer() : undefined;
            closePreview();
            setPreview({ file: { id: document.id, name: document.name, mimeType: document.mimeType, size: Number(document.size) }, url, data, payment, document });
        } catch (requestError) {
            console.error('Error opening payroll payment document:', requestError.response?.data || requestError);
            onError?.(messageOf(requestError, 'No fue posible abrir el comprobante.'));
        }
    };

    const uploadFor = async (payment, file) => {
        const problem = payrollDocumentProblem(file);
        if (problem) { onError?.(problem); return; }
        setUploadingFor(payment.id);
        try {
            await uploadPaymentDocument(payment.financialRecordId, file);
            await onChanged('Comprobante guardado.');
        } catch (requestError) {
            console.error('Error uploading payroll payment document:', requestError.response?.data || requestError);
            onError?.(messageOf(requestError, 'No fue posible subir el comprobante.'));
        } finally {
            setUploadingFor('');
        }
    };

    const saved = async (message) => {
        setDialog(null);
        await onChanged(message);
    };

    return (
        <div className="space-y-2" data-payroll-payments>
            <ul className="space-y-1.5">
                {active.map((payment) => (
                    <li key={payment.id} data-payroll-payment className="flex min-w-0 items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-zinc-900">
                      {/* Dos líneas: los datos del pago arriba y sus documentos abajo, para que
                          un nombre de archivo largo no aplaste la referencia. */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="w-24 shrink-0 font-medium text-zinc-900 dark:text-white">{formatCurrency(payment.amount)}</span>
                            <span className="shrink-0 text-zinc-500">{formatDate(payment.paidAt)}</span>
                            <span className="min-w-0 max-w-[12rem] truncate text-zinc-500">{payment.accountName || 'Sin cuenta'}</span>
                            <span className="min-w-[8rem] flex-1 truncate text-zinc-600 dark:text-zinc-300">{payment.reference || <span className="text-zinc-400">Sin referencia</span>}</span>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {(payment.documents || []).map((document) => (
                                <button key={document.id} type="button" onClick={() => openDocument(payment, document)} title={`Ver ${document.name}`}
                                    className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
                                    <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{document.name}</span>
                                </button>
                            ))}
                            {canWrite && payment.financialRecordId && (
                                <>
                                    <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                        ref={(node) => { fileInputs.current[payment.id] = node; }}
                                        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadFor(payment, file); }} />
                                    <button type="button" disabled={uploadingFor === payment.id} onClick={() => fileInputs.current[payment.id]?.click()}
                                        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
                                        {uploadingFor === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}Subir comprobante
                                    </button>
                                </>
                            )}
                        </div>
                        {/* Desde Movimientos las acciones van a la vista, no escondidas en «⋯»:
                            la persona llegó justo a hacer una de ellas. */}
                        {inlineActions && (canWrite || canApprove) && (
                            <div className="flex flex-wrap gap-2 pt-2" data-payroll-inline-actions>
                                {canApprove && payment.canSplit && <button type="button" onClick={() => setDialog({ kind: 'split', payment })} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Desglosar pago</button>}
                                {canWrite && <button type="button" onClick={() => setDialog({ kind: 'edit', payment })} className="inline-flex min-h-10 items-center rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Editar referencia</button>}
                                {canApprove && <button type="button" onClick={() => setDialog({ kind: 'reverse', payment })} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-destructive brain-destructive-text hover:bg-destructive/10">Revertir</button>}
                            </div>
                        )}
                      </div>
                        {!inlineActions && (canWrite || canApprove) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" aria-label={`Acciones del pago de ${formatCurrency(payment.amount)}`} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><MoreHorizontal className="h-4 w-4" /></button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {canWrite && <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', payment })}>Editar referencia</DropdownMenuItem>}
                                    {canApprove && payment.canSplit && <DropdownMenuItem onSelect={() => setDialog({ kind: 'split', payment })}>Desglosar pago</DropdownMenuItem>}
                                    {canApprove && <DropdownMenuItem onSelect={() => setDialog({ kind: 'reverse', payment })} className="text-destructive brain-destructive-text focus:text-destructive">Revertir</DropdownMenuItem>}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </li>
                ))}
            </ul>
            {reversed.length > 0 && (
                <div className="text-[11px]">
                    <button type="button" onClick={() => setShowReversed((current) => !current)} className="min-h-8 font-medium text-zinc-500 underline underline-offset-2">
                        {showReversed ? 'Ocultar' : 'Ver'} {reversed.length} {reversed.length === 1 ? 'pago revertido o desglosado' : 'pagos revertidos o desglosados'}
                    </button>
                    {showReversed && (
                        <ul className="mt-1 space-y-1">
                            {reversed.map((payment) => (
                                <li key={payment.id} className="flex flex-wrap gap-x-3 text-zinc-400">
                                    <span className="line-through">{formatCurrency(payment.amount)}</span>
                                    <span>{formatDate(payment.paidAt)}</span>
                                    <span>{payment.reversalReason}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {dialog?.kind === 'split' && <DesgloseDialog payment={dialog.payment} accounts={accounts} formatCurrency={formatCurrency} onClose={() => setDialog(null)} onSaved={saved} />}
            {dialog?.kind === 'reverse' && <ReverseDialog payment={dialog.payment} formatCurrency={formatCurrency} onClose={() => setDialog(null)} onSaved={saved} />}
            {dialog?.kind === 'edit' && <EditDialog payment={dialog.payment} onClose={() => setDialog(null)} onSaved={saved} />}
            {preview && (
                <ChatFilePreview file={preview.file} url={preview.url} data={preview.data} onClose={closePreview}
                    onDownload={() => openDocument(preview.payment, preview.document, true)} />
            )}
        </div>
    );
}

// Las acciones de un pago de nómina desde Movimientos (Rodny, 1 de octubre de 2026: «me voy a
// nómina y no veo esa opción... no debería entonces mejor poder desglosar desde movimiento
// mismo?»). Nómina abre en el mes actual y el pago suele ser de la liquidación anterior, así
// que el lápiz del movimiento abre aquí lo mismo que la fila de Nómina: desglosar, subir
// comprobantes, cambiar la referencia o revertir. Cualquier cambio cierra el panel y refresca
// el libro, porque el movimiento que se ve aquí puede dejar de existir (desglosado o revertido).
export function PayrollPaymentPanel({ payment, accounts = [], formatCurrency, canApprove, canWrite, onClose, onChanged, onError }) {
    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Pago de nómina</DialogTitle>
                    <DialogDescription>Lo generó la nómina, así que su valor no se edita a mano. Aquí lo desglosas en los pagos que de verdad se hicieron, le subes los comprobantes, cambias la referencia o lo reviertes.</DialogDescription>
                </DialogHeader>
                <PayrollPaymentList transaction={{ payments: [payment] }} accounts={accounts} formatCurrency={formatCurrency}
                    canApprove={canApprove} canWrite={canWrite} inlineActions
                    onChanged={async (message) => { onClose(); await onChanged(message); }} onError={onError} />
            </DialogContent>
        </Dialog>
    );
}
