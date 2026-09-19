import Select from '@/components/ui/Select';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import ChatFilePreview from '@/components/chat/ChatFilePreview';
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
    Download,
    Edit,
    Eye,
    FileSpreadsheet,
    FileText,
    Image,
    Layers,
    Loader2,
    Paperclip,
    Plus,
    Search,
    StopCircle,
    Trash2,
    TrendingDown,
    TrendingUp,
    Upload,
    Wallet
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { hasFinancialPermission } from '@/utils/financialPermissions';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';

const PAGE_SIZE = 25;

const CATEGORIES = [
    ['MEMBRESIA', 'Membresía'],
    ['SERVICIO', 'Servicio'],
    ['PAUTA', 'Pauta'],
    ['NOMINA', 'Nómina'],
    ['LOGISTICA', 'Logística'],
    ['ADMINISTRATIVO', 'Administrativo'],
    ['TAX', 'Impuestos y tasas'],
    ['FINANCIAL', 'Financiero y banco'],
    ['OPERATIVO', 'Operativo'],
    ['DONACION', 'Donaciones'],
    ['SIEMBRA', 'Siembra'],
    ['PRESTAMO', 'Préstamo']
];

const categoryLabel = (value) => CATEGORIES.find(([category]) => category === value)?.[1] || value;

// Breakdown lines are compared in cents, like the backend, so 0.1 + 0.2 still matches 0.3.
const toCents = (value) => Math.round((Number(value) || 0) * 100);
const MAX_ALLOCATION_LINES = 20;
const emptyAllocationLine = (category = 'OPERATIVO') => ({ amount: '', category, description: '' });
const allocationLinesFrom = (record) => (record?.allocations || []).map((line) => ({ amount: String(line.amount), category: line.category, description: line.description || '' }));
const allocationPayload = (lines) => lines.map((line) => ({ amount: Number(line.amount), category: line.category, description: line.description.trim() }));

// Supporting documents: PDF, JPG or PNG, fetched only through the authenticated API. They are never deleted.
const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
const documentExtensionOk = (name) => /\.(pdf|jpe?g|png)$/i.test(String(name || ''));
const formatBytes = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const documentIcon = (mimeType) => (String(mimeType).startsWith('image/') ? Image : FileText);
const activeDocuments = (record) => (record?.documents || []).filter((item) => !item.voidedAt);

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

const FinancialLedger = ({ selectedYear, filters = { scenario: 'ACTUAL', month: '', type: '', q: '' }, searchPending = false, formatCurrency }) => {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [form, setForm] = useState(() => emptyForm(selectedYear));
    const [isSaving, setIsSaving] = useState(false);
    const [recordToVoid, setRecordToVoid] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);
    // The breakdown lives inside the movement form: lines are applied here and persisted with the record.
    const [formAllocations, setFormAllocations] = useState([]);
    const [isAllocationOpen, setIsAllocationOpen] = useState(false);
    const [allocationLines, setAllocationLines] = useState([]);
    const [formDocuments, setFormDocuments] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isUploadingDocument, setIsUploadingDocument] = useState(false);
    const [documentToVoid, setDocumentToVoid] = useState(null);
    const [documentVoidReason, setDocumentVoidReason] = useState('');
    const [isVoidingDocument, setIsVoidingDocument] = useState(false);
    const [documentPreview, setDocumentPreview] = useState(null);
    const documentInputRef = useRef(null);
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
    const canApprove = hasFinancialPermission(currentUser, 'approve');
    const canAdmin = hasFinancialPermission(currentUser, 'admin');
    const canWrite = hasFinancialPermission(currentUser, 'write');

    useEffect(() => { setPage(1); }, [selectedYear, filters]);

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ year: String(selectedYear), scenario: filters.scenario, page: String(page), pageSize: String(PAGE_SIZE), scope: 'active', status: 'POSTED' });
        if (filters.month) params.set('month', filters.month);
        if (filters.type) params.set('type', filters.type);
        if (filters.q) params.set('q', filters.q);
        return params.toString();
    }, [filters, selectedYear, page]);

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['financial-records', selectedYear, filters, page],
        queryFn: async () => {
            try {
                const baseUrl = getApiBaseUrl();
                const response = await axios.get(`${baseUrl}/api/financials/records?${queryString}`, {
                    headers: authHeaders()
                });
                return response.data;
            } catch (requestError) {
                console.error('Error loading financial records:', requestError.response?.data || requestError.message);
                throw requestError;
            }
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
    const totalRecords = Number(data?.total) || 0;
    const pageCount = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    useEffect(() => {
        if (data && !isFetching && !error) setPage((current) => Math.min(current, pageCount));
    }, [data, isFetching, error, pageCount]);
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
        setFormAllocations([]);
        setFormDocuments([]);
        setPendingFiles([]);
        setIsEditorOpen(true);
    };

    const openEdit = (record) => {
        setEditingRecord(record);
        setForm(toForm(record, selectedYear));
        setFormAllocations(allocationLinesFrom(record));
        setFormDocuments([...(record.documents || [])]);
        setPendingFiles([]);
        setIsEditorOpen(true);
    };

    const refreshFinancialData = () => invalidateFinancialQueries(queryClient);

    const uploadDocument = async (recordId, file) => {
        const body = new FormData();
        body.append('file', file, file.name);
        const response = await axios.post(`${getApiBaseUrl()}/api/financials/records/${recordId}/documents`, body, { headers: authHeaders() });
        return response.data.document;
    };

    // The bytes come through the authenticated API as a blob; the viewer and the download reuse that same local copy.
    const fetchDocumentBlob = async (recordId, item) => {
        const url = `${getApiBaseUrl()}/api/financials/records/${recordId}/documents/${item.id}/file`;
        const response = await axios.get(url, { headers: authHeaders(), responseType: 'blob' });
        return response.data instanceof Blob ? response.data : new Blob([response.data], { type: item.mimeType });
    };

    const downloadBlobUrl = (objectUrl, name) => {
        const anchor = window.document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = name;
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const closeDocumentPreview = () => {
        setDocumentPreview((current) => {
            if (current) URL.revokeObjectURL(current.url);
            return null;
        });
    };

    const openDocument = async (recordId, item, download = false) => {
        try {
            const blob = await fetchDocumentBlob(recordId, item);
            const objectUrl = URL.createObjectURL(blob);
            if (download) {
                downloadBlobUrl(objectUrl, item.name);
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
                return;
            }
            // PDFs go to the viewer as bytes: the page's Content-Security-Policy does not let it fetch a blob: URL.
            const data = item.mimeType === 'application/pdf' ? await blob.arrayBuffer() : undefined;
            closeDocumentPreview();
            setDocumentPreview({ file: { id: item.id, name: item.name, mimeType: item.mimeType, size: Number(item.size) }, url: objectUrl, data });
        } catch (requestError) {
            console.error('Error opening financial document:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible abrir el documento.');
        }
    };

    const handleDocumentsSelected = async (files) => {
        const accepted = [];
        for (const file of files) {
            if (!documentExtensionOk(file.name)) toast.error(`${file.name}: solo se admiten PDF, JPG o PNG.`);
            else if (file.size > DOCUMENT_MAX_BYTES) toast.error(`${file.name}: supera el máximo de 25 MB.`);
            else if (file.size === 0) toast.error(`${file.name}: el archivo está vacío.`);
            else accepted.push(file);
        }
        if (!accepted.length) return;
        if (!editingRecord) {
            setPendingFiles((current) => [...current, ...accepted]);
            return;
        }
        setIsUploadingDocument(true);
        try {
            for (const file of accepted) {
                const uploaded = await uploadDocument(editingRecord.id, file);
                setFormDocuments((current) => (current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]));
            }
            await refreshFinancialData();
            toast.success(accepted.length === 1 ? 'Documento guardado' : `${accepted.length} documentos guardados`);
        } catch (requestError) {
            console.error('Error uploading financial document:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible guardar el documento.');
        } finally {
            setIsUploadingDocument(false);
        }
    };

    const confirmVoidDocument = async () => {
        if (!documentToVoid || !editingRecord || !documentVoidReason.trim()) return;
        setIsVoidingDocument(true);
        try {
            const response = await axios.post(`${getApiBaseUrl()}/api/financials/records/${editingRecord.id}/documents/${documentToVoid.id}/void`, {
                reason: documentVoidReason.trim()
            }, { headers: authHeaders() });
            const voided = response.data.document;
            setFormDocuments((current) => current.map((item) => (item.id === voided.id ? voided : item)));
            await refreshFinancialData();
            setDocumentToVoid(null);
            setDocumentVoidReason('');
            toast.success('Documento anulado. El archivo se conserva en la bitácora.');
        } catch (requestError) {
            console.error('Error voiding financial document:', requestError.response?.data || requestError);
            toast.error(requestError.response?.data?.message || 'No fue posible anular el documento.');
        } finally {
            setIsVoidingDocument(false);
        }
    };

    const formAllocationCents = formAllocations.reduce((sum, line) => sum + toCents(line.amount), 0);
    const formAllocationMismatch = formAllocations.length > 0 && formAllocationCents !== toCents(form.amount);
    const allocationsChanged = JSON.stringify(allocationPayload(formAllocations)) !== JSON.stringify(allocationPayload(allocationLinesFrom(editingRecord)));

    const saveRecord = async (event) => {
        event.preventDefault();
        if (formAllocationMismatch) {
            toast.error('Los ítems del desglose no suman el valor del movimiento. Ajusta el desglose antes de guardar.');
            return;
        }
        setIsSaving(true);
        let savedRecord = editingRecord;
        try {
            const baseUrl = getApiBaseUrl();
            const payload = {
                ...form,
                amount: Number(form.amount),
                clientId: form.clientId || null,
                accountId: form.accountId || null
            };
            const response = editingRecord
                ? await axios.patch(`${baseUrl}/api/financials/records/${editingRecord.id}`, payload, { headers: authHeaders() })
                : await axios.post(`${baseUrl}/api/financials/records`, payload, { headers: authHeaders() });
            savedRecord = response.data?.record || editingRecord;
            if (allocationsChanged && savedRecord?.id) {
                await axios.put(`${baseUrl}/api/financials/records/${savedRecord.id}/allocations`, {
                    allocations: allocationPayload(formAllocations)
                }, { headers: authHeaders() });
            }
            for (const file of pendingFiles) {
                const uploaded = await uploadDocument(savedRecord.id, file);
                setFormDocuments((current) => [...current, uploaded]);
                setPendingFiles((current) => current.filter((candidate) => candidate !== file));
            }
            await refreshFinancialData();
            setIsEditorOpen(false);
            toast.success(editingRecord ? 'Movimiento actualizado' : 'Movimiento registrado');
        } catch (requestError) {
            console.error('Error saving financial record:', requestError.response?.data || requestError);
            const message = requestError.response?.data?.message;
            if (savedRecord && savedRecord !== editingRecord) {
                // The movement exists; only its breakdown or a document failed. Keep editing that record instead of creating a duplicate.
                await refreshFinancialData();
                setEditingRecord(savedRecord);
                toast.error(`El movimiento se guardó, pero no todo lo demás: ${message || 'inténtalo de nuevo.'}`);
            } else {
                toast.error(message || 'No fue posible guardar el movimiento.');
            }
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

    const openAllocation = () => {
        setAllocationLines(formAllocations.length ? formAllocations : [emptyAllocationLine(form.category), emptyAllocationLine(form.category)]);
        setIsAllocationOpen(true);
    };

    const setAllocationLine = (index, field, value) => setAllocationLines((current) => current.map((line, position) => (position === index ? { ...line, [field]: value } : line)));
    const removeAllocationLine = (index) => setAllocationLines((current) => current.filter((_, position) => position !== index));
    const addAllocationLine = () => setAllocationLines((current) => (current.length >= MAX_ALLOCATION_LINES ? current : [...current, emptyAllocationLine(form.category)]));

    const allocationTotalCents = allocationLines.reduce((sum, line) => sum + toCents(line.amount), 0);
    const allocationTargetCents = toCents(form.amount);
    const allocationRemainingCents = allocationTargetCents - allocationTotalCents;
    const allocationComplete = allocationLines.length >= 2
        && allocationRemainingCents === 0
        && allocationLines.every((line) => toCents(line.amount) > 0 && line.description.trim());

    const applyAllocations = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!allocationComplete) return;
        setFormAllocations(allocationLines.map((line) => ({ ...line, description: line.description.trim() })));
        setIsAllocationOpen(false);
    };

    const clearAllocations = () => {
        setFormAllocations([]);
        setIsAllocationOpen(false);
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
                            <div className="text-right"><p className="text-xs text-zinc-500">Saldo total de la cuenta</p><p className="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(Number(account.balance))}</p></div>
                        </div>
                    ))}
                </div>
            )}

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
                    <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Ingresos de esta página</p><p className="font-semibold text-zinc-900 dark:text-white">{isLoading || searchPending || error ? '—' : formatCurrency(totals.income)}</p></div>
                </div>
                <div className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
                    <TrendingDown className="h-5 w-5 text-rose-500" />
                    <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Egresos de esta página</p><p className="font-semibold text-zinc-900 dark:text-white">{isLoading || searchPending || error ? '—' : formatCurrency(totals.expense)}</p></div>
                </div>
                <div className="flex items-center gap-3 border-b border-zinc-200 py-3 dark:border-white/10">
                    <FileSpreadsheet className="h-5 w-5 text-violet-500" />
                    <div><p className="text-xs text-zinc-500 dark:text-zinc-400">Registros con estos filtros</p><p className="font-semibold text-zinc-900 dark:text-white">{isLoading || searchPending || error ? '—' : totalRecords}</p></div>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
                {isLoading || searchPending ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando movimientos...</div>
                ) : error ? (
                    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-destructive"><p className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" /> No fue posible cargar el libro.</p><button type="button" onClick={() => refetch()} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-zinc-700 dark:border-white/10 dark:text-zinc-200">Reintentar</button></div>
                ) : records.length === 0 ? (
                    <div className="py-16 text-center"><Search className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">No hay movimientos con estos filtros.</p></div>
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
                                        <td className="p-3">
                                            <p className="font-medium text-zinc-900 dark:text-white">{record.description || record.sourceLabel || 'Sin descripción'}</p>
                                            <p className="mt-0.5 text-xs text-zinc-400">{record.client?.name || record.counterparty || record.reference || ''}</p>
                                            {record.allocations?.length > 0 && (
                                                <ul aria-label="Desglose del movimiento" className="mt-2 space-y-1 border-l border-zinc-200 pl-3 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                                                    {record.allocations.map((line) => (
                                                        <li key={line.id || `${line.sortOrder}-${line.description}`} className="flex flex-wrap items-baseline gap-x-2">
                                                            <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatCurrency(Number(line.amount))}</span>
                                                            <span>{line.description}</span>
                                                            <span className="text-zinc-400 dark:text-zinc-500">· {categoryLabel(line.category)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {activeDocuments(record).length > 0 && (
                                                <div aria-label="Documentos de respaldo" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                                    <Paperclip className="h-3.5 w-3.5 text-zinc-400" />
                                                    {activeDocuments(record).map((item) => (
                                                        <button key={item.id} type="button" title={`Abrir ${item.name}`} onClick={() => openDocument(record.id, item)} className="max-w-[220px] truncate text-brand-cyan-deep hover:underline dark:text-brand-cyan">{item.name}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-zinc-600 dark:text-zinc-300">{categoryLabel(record.category)}</td>
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

            {!isLoading && !error && totalRecords > 0 && <nav aria-label="Paginación de movimientos" className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                <p aria-live="polite">Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRecords)} de {totalRecords} movimientos</p>
                <div className="flex items-center gap-2">
                    <button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-11 rounded-lg border border-zinc-200 px-3 disabled:opacity-40 dark:border-white/10">Anterior</button>
                    <span>Página {page} de {pageCount}</span>
                    <button type="button" disabled={page >= pageCount || isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="min-h-11 rounded-lg border border-zinc-200 px-3 disabled:opacity-40 dark:border-white/10">Siguiente</button>
                </div>
            </nav>}

            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>{editingRecord ? 'Editar movimiento' : 'Registrar movimiento'}</DialogTitle><DialogDescription>Este registro alimentará los indicadores del escenario seleccionado.</DialogDescription></DialogHeader>
                    <form onSubmit={saveRecord} className="space-y-5">
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
                            {[['INCOME', 'Ingreso'], ['EXPENSE', 'Egreso']].map(([value, label]) => <button key={value} type="button" onClick={() => setField('type', value)} className={cn('rounded-md px-3 py-2 text-sm font-medium transition', form.type === value ? 'bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300' : 'text-zinc-500')}>{label}</button>)}
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Descripción<input required className={inputClass} value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Ej. Mensualidad de agosto" /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Valor<input required min="0.01" step="0.01" type="number" className={inputClass} value={form.amount} onChange={(event) => setField('amount', event.target.value)} /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha<div className="relative"><Calendar className="pointer-events-none absolute left-3 top-3 z-10 h-4 w-4 text-zinc-400" /><BrainDatePicker ariaLabel="Fecha del movimiento" value={form.date} onChange={(value) => setField('date', value)} className={`${inputClass} pl-9`} /></div></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Categoría<Select className={inputClass} value={form.category} onChange={(event) => setField('category', event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Escenario<Select className={inputClass} value={form.scenario} onChange={(event) => setField('scenario', event.target.value)}>{SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cuenta de caja o banco<Select required={form.scenario === 'ACTUAL' && editingRecord?.origin !== 'IMPORT'} className={inputClass} value={form.accountId} onChange={(event) => setField('accountId', event.target.value)}><option value="">{form.scenario === 'ACTUAL' ? 'Seleccionar cuenta...' : 'Sin cuenta definida'}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cliente<Select className={inputClass} value={form.clientId} onChange={(event) => setField('clientId', event.target.value)}><option value="">Sin cliente relacionado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Contraparte<input className={inputClass} value={form.counterparty} onChange={(event) => setField('counterparty', event.target.value)} placeholder="Proveedor o persona" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Referencia<input className={inputClass} value={form.reference} onChange={(event) => setField('reference', event.target.value)} placeholder="Factura, transferencia..." /></label>
                        </div>
                        <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm">
                                    <p className="font-medium text-zinc-900 dark:text-white">Documentos de respaldo</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Facturas o soportes en PDF, JPG o PNG, hasta 25 MB cada uno. Se conservan siempre: un documento subido por error se anula, no se borra.</p>
                                </div>
                                <input ref={documentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple className="sr-only" aria-label="Seleccionar documentos de respaldo" onChange={(event) => { handleDocumentsSelected([...event.target.files]); event.target.value = ''; }} />
                                <button type="button" onClick={() => documentInputRef.current?.click()} disabled={isUploadingDocument} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">{isUploadingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{isUploadingDocument ? 'Subiendo…' : 'Añadir documento'}</button>
                            </div>
                            {(formDocuments.length > 0 || pendingFiles.length > 0) && (
                                <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-white/5">
                                    {formDocuments.map((item) => {
                                        const Icon = documentIcon(item.mimeType);
                                        return (
                                            <li key={item.id} className="flex items-center gap-2 py-1.5">
                                                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                                                <span className={cn('min-w-0 flex-1 truncate', item.voidedAt ? 'text-zinc-400 line-through' : 'text-zinc-800 dark:text-zinc-100')} title={item.voidedAt ? `Anulado: ${item.voidReason}` : item.name}>{item.name}</span>
                                                <span className="shrink-0 text-xs text-zinc-400">{formatBytes(Number(item.size))}</span>
                                                {item.voidedAt
                                                    ? <span className="shrink-0 text-xs text-zinc-400">Anulado</span>
                                                    : (
                                                        <span className="flex shrink-0 gap-1">
                                                            <button type="button" title="Ver documento" aria-label={`Ver ${item.name}`} onClick={() => openDocument(editingRecord.id, item)} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Eye className="h-4 w-4" /></button>
                                                            <button type="button" title="Descargar documento" aria-label={`Descargar ${item.name}`} onClick={() => openDocument(editingRecord.id, item, true)} className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><Download className="h-4 w-4" /></button>
                                                            <button type="button" title="Anular documento" aria-label={`Anular ${item.name}`} onClick={() => { setDocumentToVoid(item); setDocumentVoidReason(''); }} className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"><StopCircle className="h-4 w-4" /></button>
                                                        </span>
                                                    )}
                                            </li>
                                        );
                                    })}
                                    {pendingFiles.map((file, index) => (
                                        <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 py-1.5">
                                            <Paperclip className="h-4 w-4 shrink-0 text-zinc-400" />
                                            <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{file.name}</span>
                                            <span className="shrink-0 text-xs text-zinc-400">{formatBytes(file.size)} · se sube al guardar</span>
                                            <button type="button" title="Quitar de la lista" aria-label={`Quitar ${file.name} de la lista`} onClick={() => setPendingFiles((current) => current.filter((candidate) => candidate !== file))} className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Notas<textarea rows={3} className={`${inputClass} resize-y`} value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
                        {editingRecord?.origin !== 'SYSTEM' && (
                            <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-sm">
                                        <p className="font-medium text-zinc-900 dark:text-white">Desglose interno</p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{formAllocations.length ? `${formAllocations.length} ítems que explican qué pagó este movimiento.` : 'Opcional: reparte el valor entre varios conceptos. El movimiento sigue siendo uno solo.'}</p>
                                    </div>
                                    <button type="button" onClick={openAllocation} disabled={toCents(form.amount) <= 0} title={toCents(form.amount) <= 0 ? 'Indica primero el valor del movimiento' : undefined} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"><Layers className="h-4 w-4" />{formAllocations.length ? 'Editar desglose' : 'Desglosar movimiento'}</button>
                                </div>
                                {formAllocations.length > 0 && (
                                    <ul className="mt-2 space-y-1 border-l border-zinc-200 pl-3 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                                        {formAllocations.map((line, index) => (
                                            <li key={index} className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium text-zinc-700 dark:text-zinc-200">{formatCurrency(Number(line.amount))}</span><span>{line.description}</span><span className="text-zinc-400 dark:text-zinc-500">· {categoryLabel(line.category)}</span></li>
                                        ))}
                                    </ul>
                                )}
                                {formAllocationMismatch && <p role="alert" className="mt-2 text-xs font-medium text-destructive">Los ítems suman {formatCurrency(formAllocationCents / 100)} y el valor es {formatCurrency(toCents(form.amount) / 100)}. Ajusta el desglose antes de guardar.</p>}
                            </div>
                        )}
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
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Tipo<Select className={inputClass} value={accountForm.type} onChange={(event) => setAccountForm((current) => ({ ...current, type: event.target.value }))}><option value="BANK">Banco</option><option value="CASH">Caja</option><option value="OTHER">Otra</option></Select></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Saldo inicial<input required type="number" step="0.01" className={inputClass} value={accountForm.openingBalance} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: event.target.value }))} /></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha del saldo inicial<BrainDatePicker ariaLabel="Fecha del saldo inicial" value={accountForm.openingBalanceDate} onChange={(value) => setAccountForm((current) => ({ ...current, openingBalanceDate: value }))} className={inputClass} /></label>
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

            <Dialog open={isAllocationOpen} onOpenChange={setIsAllocationOpen}>
                <DialogContent overlayClassName="z-[80]" className="z-[81] max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>Desglosar movimiento</DialogTitle>
                        <DialogDescription>El movimiento sigue siendo uno solo. Reparte su valor entre los conceptos que pagó; la suma debe coincidir exactamente. Solo los indicadores por categoría leen este desglose.</DialogDescription>
                    </DialogHeader>
                    {isAllocationOpen && (
                        <form onSubmit={applyAllocations} className="space-y-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-white/10">
                                <p className="min-w-0 flex-1 break-words font-medium text-zinc-900 dark:text-white">{form.description || 'Movimiento sin descripción'}</p>
                                <p className={cn('font-semibold', form.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600')}>{form.type === 'INCOME' ? '+' : '-'} {formatCurrency(allocationTargetCents / 100)}</p>
                            </div>
                            <div className="space-y-3">
                                {allocationLines.map((line, index) => (
                                    <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,2fr)_auto] sm:items-end">
                                        <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className={index ? 'sr-only' : ''}>Valor</span><input required min="0.01" step="0.01" type="number" aria-label={`Valor del ítem ${index + 1}`} className={inputClass} value={line.amount} onChange={(event) => setAllocationLine(index, 'amount', event.target.value)} /></label>
                                        <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className={index ? 'sr-only' : ''}>Categoría</span><Select aria-label={`Categoría del ítem ${index + 1}`} className={inputClass} value={line.category} onChange={(event) => setAllocationLine(index, 'category', event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
                                        <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className={index ? 'sr-only' : ''}>Concepto</span><input required aria-label={`Concepto del ítem ${index + 1}`} className={inputClass} value={line.description} onChange={(event) => setAllocationLine(index, 'description', event.target.value)} placeholder="Ej. Claude Code" /></label>
                                        <button type="button" aria-label={`Quitar ítem ${index + 1}`} disabled={allocationLines.length <= 2} onClick={() => removeAllocationLine(index)} className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-destructive hover:bg-destructive/10 disabled:opacity-40 dark:border-white/10"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                <button type="button" onClick={addAllocationLine} disabled={allocationLines.length >= MAX_ALLOCATION_LINES} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"><Plus className="h-4 w-4" />Añadir ítem</button>
                                <p aria-live="polite" className={cn('font-medium', allocationRemainingCents === 0 && allocationLines.length >= 2 ? 'text-emerald-600' : 'text-amber-600 dark:text-amber-400')}>
                                    {allocationRemainingCents === 0
                                        ? `Repartido ${formatCurrency(allocationTotalCents / 100)} de ${formatCurrency(allocationTargetCents / 100)}`
                                        : allocationRemainingCents > 0
                                            ? `Faltan ${formatCurrency(allocationRemainingCents / 100)} por repartir`
                                            : `Sobran ${formatCurrency(-allocationRemainingCents / 100)}`}
                                </p>
                            </div>
                            <DialogFooter className="gap-2 sm:justify-between">
                                {formAllocations.length > 0
                                    ? <button type="button" onClick={clearAllocations} className="rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">Quitar desglose</button>
                                    : <span />}
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setIsAllocationOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Cancelar</button>
                                    <button type="submit" disabled={!allocationComplete} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">Aplicar desglose</button>
                                </div>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {documentPreview && (
                <ChatFilePreview
                    file={documentPreview.file}
                    url={documentPreview.url}
                    data={documentPreview.data}
                    onClose={closeDocumentPreview}
                    onDownload={() => downloadBlobUrl(documentPreview.url, documentPreview.file.name)}
                />
            )}

            <Dialog open={!!documentToVoid} onOpenChange={(open) => !open && !isVoidingDocument && setDocumentToVoid(null)}>
                <DialogContent overlayClassName="z-[80]" className="z-[81] sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader><DialogTitle>Anular documento</DialogTitle><DialogDescription>El documento dejará de mostrarse como respaldo, pero el archivo se conserva y el motivo queda en la auditoría.</DialogDescription></DialogHeader>
                    {documentToVoid && <p className="truncate text-sm font-medium text-zinc-900 dark:text-white" title={documentToVoid.name}>{documentToVoid.name}</p>}
                    <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Motivo<textarea autoFocus rows={3} className={inputClass} value={documentVoidReason} onChange={(event) => setDocumentVoidReason(event.target.value)} placeholder="Ej. Se subió la factura de otro movimiento" /></label>
                    <DialogFooter><button type="button" onClick={() => setDocumentToVoid(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-white/10">Cancelar</button><button type="button" disabled={!documentVoidReason.trim() || isVoidingDocument} onClick={confirmVoidDocument} className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50">{isVoidingDocument && <Loader2 className="h-4 w-4 animate-spin" />}Anular documento</button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!recordToVoid} onOpenChange={(open) => !open && setRecordToVoid(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900"><DialogHeader><DialogTitle>Anular movimiento</DialogTitle><DialogDescription>El movimiento dejará de afectar los indicadores, pero permanecerá en la bitácora.</DialogDescription></DialogHeader><label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Motivo<textarea autoFocus rows={3} className={inputClass} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Explica brevemente la corrección" /></label><DialogFooter><button type="button" onClick={() => setRecordToVoid(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-white/10">Cancelar</button><button type="button" disabled={!voidReason.trim() || isVoiding} onClick={confirmVoid} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{isVoiding && <Loader2 className="h-4 w-4 animate-spin" />}Anular movimiento</button></DialogFooter></DialogContent>
            </Dialog>
        </section>
    );
};

export default FinancialLedger;
