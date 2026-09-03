import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    AlertCircle,
    Calendar,
    Edit,
    FileSpreadsheet,
    Loader2,
    Plus,
    Search,
    StopCircle,
    TrendingDown,
    TrendingUp,
    Wallet
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const CATEGORIES = [
    ['MEMBRESIA', 'Membresía'],
    ['SERVICIO', 'Servicio'],
    ['PAUTA', 'Pauta'],
    ['NOMINA', 'Nómina'],
    ['LOGISTICA', 'Logística'],
    ['ADMINISTRATIVO', 'Administrativo'],
    ['TAX', 'Impuestos y tasas'],
    ['FINANCIAL', 'Financiero y banco'],
    ['OPERATIVO', 'Operativo']
];

const SCENARIOS = [
    ['ACTUAL', 'Ejecutado'],
    ['FORECAST', 'Proyección'],
    ['BUDGET', 'Presupuesto']
];

const emptyForm = (year) => ({
    type: 'EXPENSE',
    amount: '',
    date: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    category: 'OPERATIVO',
    scenario: 'ACTUAL',
    description: '',
    clientId: '',
    counterparty: '',
    reference: '',
    notes: '',
    accountId: ''
});

const emptyAccountForm = (year) => ({
    name: '',
    type: 'BANK',
    currency: 'COP',
    openingBalance: '0',
    openingBalanceDate: `${year}-01-01`
});

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('authToken')}`
});

const inputClass = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

const scenarioTone = {
    ACTUAL: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    FORECAST: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
    BUDGET: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
};

const toForm = (record, year) => record ? {
    type: record.type,
    amount: String(record.amount),
    date: String(record.date).slice(0, 10),
    category: record.category,
    scenario: record.scenario,
    description: record.description || '',
    clientId: record.clientId || '',
    counterparty: record.counterparty || '',
    reference: record.reference || '',
    notes: record.notes || '',
    accountId: record.accountId || ''
} : emptyForm(year);

const FinancialLedger = ({ selectedYear, formatCurrency }) => {
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState({ scenario: 'ACTUAL', month: '', type: '' });
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form, setForm] = useState(() => emptyForm(selectedYear));
    const [isSaving, setIsSaving] = useState(false);
    const [recordToVoid, setRecordToVoid] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);
    const [isAccountEditorOpen, setIsAccountEditorOpen] = useState(false);
    const [accountForm, setAccountForm] = useState(() => emptyAccountForm(selectedYear));
    const [isSavingAccount, setIsSavingAccount] = useState(false);
    const [isClosePeriodOpen, setIsClosePeriodOpen] = useState(false);
    const [closePeriodNotes, setClosePeriodNotes] = useState('');
    const [isClosingPeriod, setIsClosingPeriod] = useState(false);
    const [isReopenPeriodOpen, setIsReopenPeriodOpen] = useState(false);
    const [reopenPeriodReason, setReopenPeriodReason] = useState('');
    const [isReopeningPeriod, setIsReopeningPeriod] = useState(false);
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const canApprove = currentUser.role === 'ADMIN' || ['APPROVER', 'ADMIN'].includes(currentUser.financialRole);
    const canAdmin = currentUser.role === 'ADMIN' || currentUser.financialRole === 'ADMIN';
    const canWrite = currentUser.role === 'ADMIN' || ['EDITOR', 'APPROVER', 'ADMIN'].includes(currentUser.financialRole) || currentUser.hasFinancialAccess === true;

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ year: String(selectedYear), scenario: filters.scenario });
        if (filters.month) params.set('month', filters.month);
        if (filters.type) params.set('type', filters.type);
        return params.toString();
    }, [filters, selectedYear]);

    const { data, isLoading, error } = useQuery({
        queryKey: ['financial-records', selectedYear, filters],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/api/financials/records?${queryString}`, {
                headers: authHeaders()
            });
            return response.data;
        }
    });

    const { data: clients = [] } = useQuery({
        queryKey: ['financial-record-clients'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/api/clients`, { headers: authHeaders() });
            return Array.isArray(response.data) ? response.data : [];
        }
    });

    const { data: accountData } = useQuery({
        queryKey: ['financial-accounts'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/api/financials/accounts`, { headers: authHeaders() });
            return response.data;
        }
    });

    const accounts = accountData?.accounts || [];
    const { data: periodData } = useQuery({
        queryKey: ['financial-periods', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/api/financials/periods?year=${selectedYear}`, { headers: authHeaders() });
            return response.data;
        }
    });
    const selectedPeriod = (periodData?.periods || []).find((period) => period.month === Number(filters.month));

    const records = useMemo(() => data?.items || [], [data?.items]);
    const totals = useMemo(() => records.reduce((acc, record) => {
        const amount = Number(record.amount) || 0;
        if (record.type === 'INCOME') acc.income += amount;
        if (record.type === 'EXPENSE') acc.expense += amount;
        return acc;
    }, { income: 0, expense: 0 }), [records]);

    const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

    const openCreate = () => {
        setEditingRecord(null);
        setForm(emptyForm(selectedYear));
        setIsEditorOpen(true);
    };

    const openEdit = (record) => {
        setEditingRecord(record);
        setForm(toForm(record, selectedYear));
        setIsEditorOpen(true);
    };

    const refreshFinancialData = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['financial-records'] }),
            queryClient.invalidateQueries({ queryKey: ['financial-accounts'] }),
            queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] })
        ]);
    };

    const saveRecord = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const baseUrl = getApiBaseUrl();
            const payload = {
                ...form,
                amount: Number(form.amount),
                clientId: form.clientId || null,
                accountId: form.accountId || null
            };
            if (editingRecord) {
                await axios.patch(`${baseUrl}/api/financials/records/${editingRecord.id}`, payload, {
                    headers: authHeaders()
                });
            } else {
                await axios.post(`${baseUrl}/api/financials/records`, payload, {
                    headers: authHeaders()
                });
            }
            await refreshFinancialData();
            setIsEditorOpen(false);
            toast.success(editingRecord ? 'Movimiento actualizado' : 'Movimiento registrado');
        } catch (requestError) {
            console.error('Error saving financial record:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible guardar el movimiento.');
        } finally {
            setIsSaving(false);
        }
    };

    const saveAccount = async (event) => {
        event.preventDefault();
        setIsSavingAccount(true);
        try {
            const baseUrl = getApiBaseUrl();
            const response = await axios.post(`${baseUrl}/api/financials/accounts`, {
                ...accountForm,
                openingBalance: Number(accountForm.openingBalance)
            }, { headers: authHeaders() });
            await queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
            setField('accountId', response.data.account.id);
            setIsAccountEditorOpen(false);
            toast.success('Cuenta financiera creada');
        } catch (requestError) {
            console.error('Error creating financial account:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible crear la cuenta.');
        } finally {
            setIsSavingAccount(false);
        }
    };

    const closeSelectedPeriod = async () => {
        if (!filters.month) return;
        setIsClosingPeriod(true);
        try {
            const baseUrl = getApiBaseUrl();
            await axios.post(`${baseUrl}/api/financials/periods/close`, {
                year: selectedYear,
                month: Number(filters.month),
                notes: closePeriodNotes
            }, { headers: authHeaders() });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financial-periods'] }),
                queryClient.invalidateQueries({ queryKey: ['financial-records'] })
            ]);
            setIsClosePeriodOpen(false);
            setClosePeriodNotes('');
            toast.success('Periodo cerrado');
        } catch (requestError) {
            console.error('Error closing financial period:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible cerrar el periodo. Revisa los movimientos sin conciliar.');
        } finally {
            setIsClosingPeriod(false);
        }
    };

    const reopenSelectedPeriod = async () => {
        if (!filters.month || !reopenPeriodReason.trim()) return;
        setIsReopeningPeriod(true);
        try {
            const baseUrl = getApiBaseUrl();
            await axios.post(`${baseUrl}/api/financials/periods/reopen`, {
                year: selectedYear,
                month: Number(filters.month),
                reason: reopenPeriodReason.trim()
            }, { headers: authHeaders() });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financial-periods'] }),
                queryClient.invalidateQueries({ queryKey: ['financial-records'] })
            ]);
            setIsReopenPeriodOpen(false);
            setReopenPeriodReason('');
            toast.success('Periodo reabierto');
        } catch (requestError) {
            console.error('Error reopening financial period:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible reabrir el periodo.');
        } finally {
            setIsReopeningPeriod(false);
        }
    };

    const confirmVoid = async () => {
        if (!recordToVoid || !voidReason.trim()) return;
        setIsVoiding(true);
        try {
            const baseUrl = getApiBaseUrl();
            await axios.post(`${baseUrl}/api/financials/records/${recordToVoid.id}/void`, {
                reason: voidReason.trim()
            }, { headers: authHeaders() });
            await refreshFinancialData();
            setRecordToVoid(null);
            setVoidReason('');
            toast.success('Movimiento anulado');
        } catch (requestError) {
            console.error('Error voiding financial record:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible anular el movimiento.');
        } finally {
            setIsVoiding(false);
        }
    };

    return (
        <section className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Movimientos financieros</h2>
                    <p className="mt-1 text-xs text-zinc-500">Registro operativo de ingresos y egresos. Los movimientos anulados permanecen en la bitácora.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canApprove && (
                        <button
                            type="button"
                            onClick={() => { setAccountForm(emptyAccountForm(selectedYear)); setIsAccountEditorOpen(true); }}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
                        >
                            <Wallet className="h-4 w-4" />
                            Nueva cuenta
                        </button>
                    )}
                    {canWrite && <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 text-sm font-semibold text-white transition hover:bg-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#009EB9]/30"
                    >
                        <Plus className="h-4 w-4" />
                        Registrar movimiento
                    </button>}
                </div>
            </div>

            {accounts.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {accounts.map((account) => (
                        <div key={account.id} className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-white/10">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><Wallet className="h-4 w-4" /></span>
                                <div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{account.name}</p><p className="text-xs text-zinc-500">{account.type === 'BANK' ? 'Banco' : account.type === 'CASH' ? 'Caja' : 'Otra cuenta'}</p></div>
                            </div>
                            <div className="text-right"><p className="text-xs text-zinc-500">Saldo actual</p><p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(Number(account.balance))}</p></div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 border-y border-zinc-200 py-4 dark:border-white/10 sm:grid-cols-3">
                <label className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                    Escenario
                    <select className={inputClass} value={filters.scenario} onChange={(event) => setFilters((current) => ({ ...current, scenario: event.target.value }))}>
                        {SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                    Mes
                    <select className={inputClass} value={filters.month} onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}>
                        <option value="">Todo el año</option>
                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, index) => (
                            <option key={month} value={index + 1}>{month}</option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                    Tipo
                    <select className={inputClass} value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
                        <option value="">Ingresos y egresos</option>
                        <option value="INCOME">Ingresos</option>
                        <option value="EXPENSE">Egresos</option>
                    </select>
                </label>
            </div>

            {filters.month && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p className="text-zinc-500">Periodo seleccionado: <span className={cn('font-medium', selectedPeriod?.status === 'CLOSED' ? 'text-rose-600' : 'text-emerald-600')}>{selectedPeriod?.status === 'CLOSED' ? 'Cerrado' : 'Abierto'}</span></p>
                    {canApprove && selectedPeriod?.status !== 'CLOSED' && <button type="button" onClick={() => setIsClosePeriodOpen(true)} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Cerrar mes</button>}
                    {canAdmin && selectedPeriod?.status === 'CLOSED' && <button type="button" onClick={() => { setReopenPeriodReason(''); setIsReopenPeriodOpen(true); }} className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-400/20 dark:text-amber-300 dark:hover:bg-amber-400/10">Reabrir mes</button>}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    <div><p className="text-xs text-zinc-500">Ingresos visibles</p><p className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(totals.income)}</p></div>
                </div>
                <div className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
                    <TrendingDown className="h-5 w-5 text-rose-500" />
                    <div><p className="text-xs text-zinc-500">Egresos visibles</p><p className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(totals.expense)}</p></div>
                </div>
                <div className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
                    <FileSpreadsheet className="h-5 w-5 text-violet-500" />
                    <div><p className="text-xs text-zinc-500">Registros</p><p className="font-semibold text-zinc-900 dark:text-white">{data?.total || 0}</p></div>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando movimientos...</div>
                ) : error ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive"><AlertCircle className="h-4 w-4 text-destructive" /> No fue posible cargar el libro.</div>
                ) : records.length === 0 ? (
                    <div className="py-16 text-center"><Search className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">No hay movimientos con estos filtros</p></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[980px] w-full text-left text-sm">
                            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-white/10 dark:bg-zinc-950/50">
                                <tr><th className="p-3 font-medium">Fecha</th><th className="p-3 font-medium">Descripción</th><th className="p-3 font-medium">Categoría</th><th className="p-3 font-medium">Cuenta</th><th className="p-3 font-medium">Escenario</th><th className="p-3 font-medium">Origen</th><th className="p-3 text-right font-medium">Valor</th><th className="p-3 text-right font-medium">Acciones</th></tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                {records.map((record) => (
                                    <tr key={record.id} className="hover:bg-zinc-50/70 dark:hover:bg-white/[0.03]">
                                        <td className="whitespace-nowrap p-3 text-zinc-600 dark:text-zinc-300">{new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(record.date))}</td>
                                        <td className="p-3"><p className="font-medium text-zinc-900 dark:text-white">{record.description || record.sourceLabel || 'Sin descripción'}</p><p className="mt-0.5 text-xs text-zinc-400">{record.client?.name || record.counterparty || record.reference || ''}</p></td>
                                        <td className="p-3 text-zinc-600 dark:text-zinc-300">{CATEGORIES.find(([value]) => value === record.category)?.[1] || record.category}</td>
                                        <td className="p-3 text-zinc-600 dark:text-zinc-300">{record.account?.name || 'Sin conciliar'}</td>
                                        <td className="p-3"><span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', scenarioTone[record.scenario])}>{SCENARIOS.find(([value]) => value === record.scenario)?.[1] || record.scenario}</span></td>
                                        <td className="p-3 text-xs text-zinc-500">{record.origin === 'IMPORT' ? 'Importado' : 'Manual'}</td>
                                        <td className={cn('p-3 text-right font-semibold', record.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600')}>{record.type === 'INCOME' ? '+' : '-'} {formatCurrency(Number(record.amount))}</td>
                                        <td className="p-3">{canWrite && <div className="flex justify-end gap-1"><button type="button" title="Editar movimiento" onClick={() => openEdit(record)} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-violet-600 dark:hover:bg-white/10"><Edit className="h-4 w-4" /></button><button type="button" title="Anular movimiento" onClick={() => { setRecordToVoid(record); setVoidReason(''); }} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><StopCircle className="h-4 w-4" /></button></div>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>{editingRecord ? 'Editar movimiento' : 'Registrar movimiento'}</DialogTitle><DialogDescription>Este registro alimentará los indicadores del escenario seleccionado.</DialogDescription></DialogHeader>
                    <form onSubmit={saveRecord} className="space-y-5">
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
                            {[['INCOME', 'Ingreso'], ['EXPENSE', 'Egreso']].map(([value, label]) => <button key={value} type="button" onClick={() => setField('type', value)} className={cn('rounded-md px-3 py-2 text-sm font-medium transition', form.type === value ? 'bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300' : 'text-zinc-500')}>{label}</button>)}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Valor<input required min="0.01" step="0.01" type="number" className={inputClass} value={form.amount} onChange={(event) => setField('amount', event.target.value)} /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha<div className="relative"><Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" /><DatePicker {...brainDatePickerProps} selected={form.date ? new Date(`${form.date}T12:00:00`) : null} onChange={(date) => setField('date', date ? format(date, 'yyyy-MM-dd') : '')} className={`${inputClass} pl-9`} dateFormat="dd/MM/yyyy" /></div></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Categoría<select className={inputClass} value={form.category} onChange={(event) => setField('category', event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Escenario<select className={inputClass} value={form.scenario} onChange={(event) => setField('scenario', event.target.value)}>{SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cuenta de caja o banco<select required={form.scenario === 'ACTUAL'} className={inputClass} value={form.accountId} onChange={(event) => setField('accountId', event.target.value)}><option value="">{form.scenario === 'ACTUAL' ? 'Seleccionar cuenta...' : 'Sin cuenta definida'}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Descripción<input required className={inputClass} value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Ej. Mensualidad de agosto" /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cliente<select className={inputClass} value={form.clientId} onChange={(event) => setField('clientId', event.target.value)}><option value="">Sin cliente relacionado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Contraparte<input className={inputClass} value={form.counterparty} onChange={(event) => setField('counterparty', event.target.value)} placeholder="Proveedor o persona" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Referencia<input className={inputClass} value={form.reference} onChange={(event) => setField('reference', event.target.value)} placeholder="Factura, transferencia..." /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Notas<input className={inputClass} value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
                        </div>
                        <DialogFooter><button type="button" onClick={() => setIsEditorOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Cancelar</button><button type="submit" disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-60">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}{editingRecord ? 'Guardar cambios' : 'Registrar movimiento'}</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isAccountEditorOpen} onOpenChange={setIsAccountEditorOpen}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>Nueva cuenta</DialogTitle><DialogDescription>Registra una cuenta bancaria o caja para controlar el saldo real.</DialogDescription></DialogHeader>
                    <form onSubmit={saveAccount} className="space-y-4">
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Nombre<input required className={inputClass} value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Bancolombia principal" /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Tipo<select className={inputClass} value={accountForm.type} onChange={(event) => setAccountForm((current) => ({ ...current, type: event.target.value }))}><option value="BANK">Banco</option><option value="CASH">Caja</option><option value="OTHER">Otra</option></select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Saldo inicial<input required type="number" step="0.01" className={inputClass} value={accountForm.openingBalance} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: event.target.value }))} /></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha del saldo inicial<DatePicker {...brainDatePickerProps} selected={accountForm.openingBalanceDate ? new Date(`${accountForm.openingBalanceDate}T12:00:00`) : null} onChange={(date) => setAccountForm((current) => ({ ...current, openingBalanceDate: date ? format(date, 'yyyy-MM-dd') : '' }))} className={inputClass} dateFormat="dd/MM/yyyy" /></label>
                        <DialogFooter><button type="button" onClick={() => setIsAccountEditorOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-white/10">Cancelar</button><button type="submit" disabled={isSavingAccount} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isSavingAccount && <Loader2 className="h-4 w-4 animate-spin" />}Crear cuenta</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isClosePeriodOpen} onOpenChange={setIsClosePeriodOpen}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>Cerrar mes</DialogTitle><DialogDescription>Después del cierre no se podrán editar, anular ni registrar movimientos en este periodo. Todos los ejecutados deben tener una cuenta conciliada.</DialogDescription></DialogHeader>
                    <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Nota de cierre<textarea rows={3} value={closePeriodNotes} onChange={(event) => setClosePeriodNotes(event.target.value)} placeholder="Ej. Extracto y cartera conciliados" className={inputClass} /></label>
                    <DialogFooter><button type="button" onClick={() => setIsClosePeriodOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="button" onClick={closeSelectedPeriod} disabled={isClosingPeriod} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isClosingPeriod && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar cierre</button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isReopenPeriodOpen} onOpenChange={setIsReopenPeriodOpen}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>Reabrir mes</DialogTitle><DialogDescription>Esta accion vuelve a permitir cambios en el periodo. El motivo y el usuario quedaran registrados en la auditoria.</DialogDescription></DialogHeader>
                    <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Motivo<textarea autoFocus rows={3} value={reopenPeriodReason} onChange={(event) => setReopenPeriodReason(event.target.value)} placeholder="Ej. Corregir un movimiento conciliado" className={inputClass} /></label>
                    <DialogFooter><button type="button" onClick={() => setIsReopenPeriodOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="button" onClick={reopenSelectedPeriod} disabled={!reopenPeriodReason.trim() || isReopeningPeriod} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isReopeningPeriod && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar reapertura</button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!recordToVoid} onOpenChange={(open) => !open && setRecordToVoid(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900"><DialogHeader><DialogTitle>Anular movimiento</DialogTitle><DialogDescription>El movimiento dejará de afectar los indicadores, pero permanecerá en la bitácora.</DialogDescription></DialogHeader><label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Motivo<textarea autoFocus rows={3} className={inputClass} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Explica brevemente la corrección" /></label><DialogFooter><button type="button" onClick={() => setRecordToVoid(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-white/10">Cancelar</button><button type="button" disabled={!voidReason.trim() || isVoiding} onClick={confirmVoid} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isVoiding && <Loader2 className="h-4 w-4 animate-spin" />}Anular movimiento</button></DialogFooter></DialogContent>
            </Dialog>
        </section>
    );
};

export default FinancialLedger;
