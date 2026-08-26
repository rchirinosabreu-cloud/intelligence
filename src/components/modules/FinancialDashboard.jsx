import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { Card } from '@/components/ui/Card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Wallet, ShieldCheck, AlertCircle,
    Users, ChevronDown, ChevronUp, Loader2, Sparkles, Calendar, PieChart as PieIcon, ListCollapse, ListCollapse as ExpandIcon,
    UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, Link2
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';
import FinancialLedger from './financial/FinancialLedger';
import BankReconciliationPanel from './financial/BankReconciliationPanel';

const CATEGORY_COLORS = {
    'MEMBRESIA': '#8b5cf6',      // Violet
    'PAUTA': '#06b6d4',          // Cyan
    'NOMINA': '#ec4899',         // Pink
    'LOGISTICA': '#f97316',      // Orange
    'ADMINISTRATIVO': '#6366f1',  // Indigo
    'TAX': '#ef4444',            // Red
    'FINANCIAL': '#10b981',      // Emerald
    'OPERATIVO': '#71717a'       // Zinc
};

const CATEGORY_LABELS = {
    'MEMBRESIA': 'Membresías',
    'PAUTA': 'Pauta',
    'NOMINA': 'Nómina',
    'LOGISTICA': 'Logística',
    'ADMINISTRATIVO': 'Administrativo',
    'TAX': 'Impuestos/Tasas',
    'FINANCIAL': 'Financiero/Banco',
    'OPERATIVO': 'Operativo Varios'
};

const FinancialDashboard = () => {
    const { currentUser } = useAuth();
    const queryClient = useQueryClient();

    // 1. React Hook Declarations (Inconditional - at the absolute top)
    const [selectedYear, setSelectedYear] = useState(2026);
    const [selectedQuarter, setSelectedQuarter] = useState('ALL');
    const [selectedScenario, setSelectedScenario] = useState('ACTUAL');
    const [activeTab, setActiveTab] = useState('flow');
    const [expandedClients, setExpandedClients] = useState({});
    const [importPreview, setImportPreview] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isCommittingImport, setIsCommittingImport] = useState(false);
    const [actualThroughMonth, setActualThroughMonth] = useState(new Date().getMonth() + 1);
    const [savingReceivableId, setSavingReceivableId] = useState('');
    const [savingPayrollContractId, setSavingPayrollContractId] = useState('');
    const [savingClientLinkId, setSavingClientLinkId] = useState('');
    const [clientLinkTargets, setClientLinkTargets] = useState({});
    const [paymentDebt, setPaymentDebt] = useState(null);
    const [paymentForm, setPaymentForm] = useState({ amount: '', paidAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), accountId: '', reference: '', notes: '' });
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const [isReceivableEditorOpen, setIsReceivableEditorOpen] = useState(false);
    const [receivableForm, setReceivableForm] = useState({ clientId: '', amount: '', period: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7) + '-01', dueDate: '', comments: '' });
    const [isSavingReceivable, setIsSavingReceivable] = useState(false);
    const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
    const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);
    const [isPayrollGenerationConfirmOpen, setIsPayrollGenerationConfirmOpen] = useState(false);
    const [savingPayrollTransactionId, setSavingPayrollTransactionId] = useState('');
    const [payrollPayment, setPayrollPayment] = useState(null);
    const [payrollPaymentForm, setPayrollPaymentForm] = useState({ paidAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), accountId: '', reference: '' });
    const [isSavingPayrollPayment, setIsSavingPayrollPayment] = useState(false);
    const [isPayrollContractEditorOpen, setIsPayrollContractEditorOpen] = useState(false);
    const [editingPayrollContract, setEditingPayrollContract] = useState(null);
    const [payrollContractForm, setPayrollContractForm] = useState(() => emptyPayrollContractForm(2026));
    const [isSavingPayrollContract, setIsSavingPayrollContract] = useState(false);
    const canAccessFinancials = currentUser?.role === 'ADMIN' || currentUser?.hasFinancialAccess === true || (currentUser?.financialRole && currentUser.financialRole !== 'NONE');
    const canWriteFinancials = currentUser?.role === 'ADMIN' || currentUser?.hasFinancialAccess === true || ['EDITOR', 'APPROVER', 'ADMIN'].includes(currentUser?.financialRole);
    const canApproveFinancials = currentUser?.role === 'ADMIN' || ['APPROVER', 'ADMIN'].includes(currentUser?.financialRole);

    // Fetch analytical aggregation from protected backend endpoint
    const { data, isLoading, error } = useQuery({
        queryKey: ['financials-dashboard-data', selectedYear, selectedQuarter, selectedScenario],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const url = `${baseUrl}/api/financials/dashboard?year=${selectedYear}&scenario=${selectedScenario}${selectedQuarter !== 'ALL' ? `&quarter=${selectedQuarter}` : ''}`;
            const res = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials) // Dynamic safeguard to prevent 401s
    });

    const { data: monthlyLedger, isLoading: isMonthlyLedgerLoading } = useQuery({
        queryKey: ['financials-monthly-ledger', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/monthly-ledger?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && activeTab === 'editor')
    });

    const { data: receivablesLedger, isLoading: isReceivablesLedgerLoading } = useQuery({
        queryKey: ['financials-receivables-ledger', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/receivables-ledger?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && activeTab === 'receivables')
    });

    const { data: financialAccounts } = useQuery({
        queryKey: ['financial-accounts'],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/accounts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && ['receivables', 'payroll'].includes(activeTab))
    });

    const { data: payrollLedger, isLoading: isPayrollLedgerLoading } = useQuery({
        queryKey: ['financials-payroll-ledger', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/payroll-ledger?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && activeTab === 'payroll')
    });

    const { data: clientReconciliation, isLoading: isClientReconciliationLoading } = useQuery({
        queryKey: ['financials-client-reconciliation', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/client-reconciliation?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && ['clients', 'receivables'].includes(activeTab))
    });

    const { data: integrityAudit, isLoading: isIntegrityAuditLoading } = useQuery({
        queryKey: ['financial-integrity', selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/financials/integrity?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials && activeTab === 'import')
    });

    const toggleClientExpand = (clientId) => {
        setExpandedClients(prev => ({
            ...prev,
            [clientId]: !prev[clientId]
        }));
    };

    const handleFinancialImportPreview = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError('');
        setImportSuccess('');

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('year', String(selectedYear));
            formData.append('actualThroughMonth', String(actualThroughMonth));

            const res = await axios.post(`${baseUrl}/api/financials/import/preview`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            setImportPreview(res.data);
            setImportFile(file);
            setActiveTab('import');
        } catch (error) {
            console.error('Error previewing financial import:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible auditar el archivo financiero.');
            setImportFile(null);
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    };

    const handleFinancialImportCommit = async () => {
        if (!importFile) {
            setImportError('Primero debes auditar un archivo financiero.');
            return;
        }

        setIsCommittingImport(true);
        setImportError('');
        setImportSuccess('');

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const formData = new FormData();
            formData.append('file', importFile);
            formData.append('year', String(selectedYear));
            formData.append('actualThroughMonth', String(actualThroughMonth));

            const res = await axios.post(`${baseUrl}/api/financials/import/commit`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            setImportSuccess(`Importación guardada: ${res.data?.counts?.records || 0} registros mensuales, ${res.data?.counts?.receivables || 0} morosos.`);
            await queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] });
        } catch (error) {
            console.error('Error committing financial import:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible guardar la importación financiera.');
        } finally {
            setIsCommittingImport(false);
        }
    };

    const handleReceivableUpdate = async (debt, patch) => {
        if (!debt?.id) return;
        setSavingReceivableId(debt.id);
        setImportError('');
        setImportSuccess('');

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.patch(`${baseUrl}/api/financials/receivables/${debt.id}`, patch, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-receivables-ledger'] })
            ]);
            setImportSuccess('Cartera actualizada.');
        } catch (error) {
            console.error('Error updating financial receivable:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible guardar el cambio de cartera.');
        } finally {
            setSavingReceivableId('');
        }
    };

    const openReceivablePayment = (debt) => {
        setPaymentDebt(debt);
        setPaymentForm({
            amount: String(debt.outstanding || ''),
            paidAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
            accountId: '',
            reference: '',
            notes: ''
        });
    };

    const handleReceivablePayment = async (event) => {
        event.preventDefault();
        if (!paymentDebt?.id) return;

        setIsSavingPayment(true);
        setImportError('');
        setImportSuccess('');
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.post(`${baseUrl}/api/financials/receivables/${paymentDebt.id}/payments`, {
                ...paymentForm,
                amount: Number(paymentForm.amount)
            }, { headers: { Authorization: `Bearer ${token}` } });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-receivables-ledger'] }),
                queryClient.invalidateQueries({ queryKey: ['financial-accounts'] })
            ]);
            setPaymentDebt(null);
            setImportSuccess('Pago de cartera registrado.');
        } catch (error) {
            console.error('Error registering receivable payment:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible registrar el pago de cartera.');
        } finally {
            setIsSavingPayment(false);
        }
    };

    const handleCreateReceivable = async (event) => {
        event.preventDefault();
        setIsSavingReceivable(true);
        setImportError('');
        setImportSuccess('');
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.post(`${baseUrl}/api/financials/receivables`, {
                ...receivableForm,
                amount: Number(receivableForm.amount),
                dueDate: receivableForm.dueDate || null
            }, { headers: { Authorization: `Bearer ${token}` } });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-receivables-ledger'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-client-reconciliation'] })
            ]);
            setIsReceivableEditorOpen(false);
            setImportSuccess('Cuenta por cobrar registrada.');
        } catch (error) {
            console.error('Error creating receivable:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible registrar la cuenta por cobrar.');
        } finally {
            setIsSavingReceivable(false);
        }
    };

    const handlePayrollContractUpdate = async (contract, patch) => {
        const contractId = contract?.id || contract?.contractId;
        if (!contractId) return;

        setSavingPayrollContractId(contractId);
        setImportError('');
        setImportSuccess('');

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.patch(`${baseUrl}/api/financials/payroll-contracts/${contractId}`, patch, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-payroll-ledger'] })
            ]);
            setImportSuccess('Nómina actualizada.');
        } catch (error) {
            console.error('Error updating financial payroll contract:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible guardar el cambio de nómina.');
        } finally {
            setSavingPayrollContractId('');
        }
    };

    const openPayrollContractEditor = (contract = null) => {
        setEditingPayrollContract(contract);
        setPayrollContractForm(contract ? {
            name: contract.name || '',
            position: contract.position || '',
            baseSalary: String(contract.baseSalary || 0),
            socialSecurity: String(contract.socialSecurity || 0),
            monthlyTotal: String(contract.monthlyTotal || 0),
            startDate: contract.startDate ? String(contract.startDate).slice(0, 10) : `${selectedYear}-01-01`,
            endDate: contract.endDate ? String(contract.endDate).slice(0, 10) : ''
        } : emptyPayrollContractForm(selectedYear));
        setIsPayrollContractEditorOpen(true);
    };

    const handleSavePayrollContract = async (event) => {
        event.preventDefault();
        setIsSavingPayrollContract(true);
        setImportError('');
        setImportSuccess('');
        const payload = {
            ...payrollContractForm,
            baseSalary: Number(payrollContractForm.baseSalary),
            socialSecurity: Number(payrollContractForm.socialSecurity),
            monthlyTotal: Number(payrollContractForm.monthlyTotal),
            endDate: payrollContractForm.endDate || null
        };
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            if (editingPayrollContract) {
                await axios.patch(`${baseUrl}/api/financials/payroll-contracts/${editingPayrollContract.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
            } else {
                await axios.post(`${baseUrl}/api/financials/payroll-contracts`, payload, { headers: { Authorization: `Bearer ${token}` } });
            }
            await invalidatePayroll();
            setIsPayrollContractEditorOpen(false);
            setImportSuccess(editingPayrollContract ? 'Contrato actualizado.' : 'Contrato creado.');
        } catch (error) {
            console.error('Error saving payroll contract:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible guardar el contrato.');
        } finally {
            setIsSavingPayrollContract(false);
        }
    };

    const invalidatePayroll = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
            queryClient.invalidateQueries({ queryKey: ['financials-payroll-ledger'] }),
            queryClient.invalidateQueries({ queryKey: ['financial-accounts'] })
        ]);
    };

    const handleGeneratePayroll = async () => {
        setIsGeneratingPayroll(true);
        setImportError('');
        setImportSuccess('');
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.post(`${baseUrl}/api/financials/payroll/periods`, {
                year: selectedYear,
                month: payrollMonth
            }, { headers: { Authorization: `Bearer ${token}` } });
            await invalidatePayroll();
            setIsPayrollGenerationConfirmOpen(false);
            setImportSuccess('Nómina mensual generada en borrador.');
        } catch (error) {
            console.error('Error generating payroll period:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible generar la nómina mensual.');
        } finally {
            setIsGeneratingPayroll(false);
        }
    };

    const handleApprovePayroll = async (transaction) => {
        setSavingPayrollTransactionId(transaction.id);
        setImportError('');
        setImportSuccess('');
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.post(`${baseUrl}/api/financials/payroll-transactions/${transaction.id}/approve`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await invalidatePayroll();
            setImportSuccess('Liquidación aprobada.');
        } catch (error) {
            console.error('Error approving payroll transaction:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible aprobar la liquidación.');
        } finally {
            setSavingPayrollTransactionId('');
        }
    };

    const handlePayPayroll = async (event) => {
        event.preventDefault();
        if (!payrollPayment?.id) return;
        setIsSavingPayrollPayment(true);
        setImportError('');
        setImportSuccess('');
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.post(`${baseUrl}/api/financials/payroll-transactions/${payrollPayment.id}/pay`, payrollPaymentForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await invalidatePayroll();
            setPayrollPayment(null);
            setImportSuccess('Pago de nómina registrado en el libro financiero.');
        } catch (error) {
            console.error('Error paying payroll transaction:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible registrar el pago de nómina.');
        } finally {
            setIsSavingPayrollPayment(false);
        }
    };

    const handleClientLink = async (sourceClientId) => {
        const targetClientId = clientLinkTargets[sourceClientId];
        if (!sourceClientId || !targetClientId || sourceClientId === targetClientId) return;

        setSavingClientLinkId(sourceClientId);
        setImportError('');
        setImportSuccess('');

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            await axios.patch(`${baseUrl}/api/financials/client-links/${encodeURIComponent(sourceClientId)}`, {
                targetClientId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['financials-dashboard-data'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-client-reconciliation'] }),
                queryClient.invalidateQueries({ queryKey: ['financials-receivables-ledger'] })
            ]);
            setClientLinkTargets(prev => {
                const next = { ...prev };
                delete next[sourceClientId];
                return next;
            });
            setImportSuccess('Cliente financiero conciliado.');
        } catch (error) {
            console.error('Error linking financial client:', error.response?.data || error);
            setImportError(error.response?.data?.message || 'No fue posible conciliar el cliente financiero.');
        } finally {
            setSavingClientLinkId('');
        }
    };

    // Processing high-precision calculated KPIs from fetched data
    const kpis = useMemo(() => {
        if (!data) return { totalIncome: 0, totalExpense: 0, netFlow: 0, totalReceivable: 0 };

        if (data.sourceSummary?.totals) {
            return {
                totalIncome: data.sourceSummary.totals.income || 0,
                totalExpense: data.sourceSummary.totals.expense || 0,
                netFlow: data.sourceSummary.totals.netFlow || 0,
                totalReceivable: data.sourceSummary.totals.receivable || 0
            };
        }

        const totalIncome = data.cashFlow?.reduce((sum, item) => sum + item.income, 0) || 0;
        const totalExpense = data.cashFlow?.reduce((sum, item) => sum + item.expense, 0) || 0;
        const netFlow = totalIncome - totalExpense;
        const totalReceivable = data.accountsReceivable?.reduce((sum, client) => sum + client.totalOutstanding, 0) || 0;

        return { totalIncome, totalExpense, netFlow, totalReceivable };
    }, [data]);

    // Format numbers dynamically for premium Colombian Peso display
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(val);
    };

    const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Donut chart formatted distribution data
    const expenseDistributionData = useMemo(() => {
        if (!data?.categoriesDistribution?.EXPENSE) return [];
        return Object.entries(data.categoriesDistribution.EXPENSE)
            .map(([name, value]) => ({
                name: CATEGORY_LABELS[name] || name,
                rawName: name,
                value: value,
                fill: CATEGORY_COLORS[name] || '#71717a'
            }))
            .filter(item => item.value > 0);
    }, [data?.categoriesDistribution]);

    const receivablesByClient = useMemo(() => {
        const grouped = {};
        const items = receivablesLedger?.items || [];

        items.forEach((item) => {
            const clientId = item.clientSlug || item.clientName || item.id;
            if (!grouped[clientId]) {
                grouped[clientId] = {
                    clientId,
                    client: {
                        name: item.clientName,
                        slug: item.clientSlug
                    },
                    totalOutstanding: 0,
                    debts: []
                };
            }

            if (item.status === 'DEBE') {
                grouped[clientId].totalOutstanding += Number(item.amount) || 0;
            }
            grouped[clientId].debts.push(item);
        });

        return Object.values(grouped).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    }, [receivablesLedger?.items]);

    const payrollRows = useMemo(() => {
        if (payrollLedger?.items) {
            return payrollLedger.items.map((item) => ({
                ...item,
                transaction: (item.transactions || []).find((transaction) => transaction.year === selectedYear && transaction.month === payrollMonth) || null
            }));
        }
        return data?.payroll?.collaborators || [];
    }, [data?.payroll?.collaborators, payrollLedger?.items, payrollMonth, selectedYear]);

    const editablePayrollTotal = useMemo(() => (
        payrollRows.reduce((sum, item) => sum + (Number(item.monthlyTotal ?? item.totalPaid) || 0), 0)
    ), [payrollRows]);

    // 2. Route Guard Security Check (After ALL Hook Declarations)
    if (!currentUser || !canAccessFinancials) {
        console.warn(`[Financial Guard] User not authorized. Redirecting...`);
        return <Navigate to="/" replace />;
    }

    if (isLoading) {
        return <SkeletonLoader />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-white/10">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4 animate-bounce" />
                <h3 className="text-lg font-bold">Error al cargar datos financieros</h3>
                <p className="text-sm text-zinc-500 max-w-sm mt-1">
                    Hubo un problema de conexión con el servidor financiero seguro de la agencia. Intente nuevamente.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950/20 space-y-8 animate-in fade-in duration-500">
            {/* Header section with Year/Quarter selection */}
            <PageHeader
                title="Consola de Inteligencia Financiera"
                subtitle="Monitoreo en tiempo real del flujo de caja, control de cartera morosa y costos operativos."
            >
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-white/5 shadow-sm">
                    <select
                        value={selectedScenario}
                        onChange={(e) => setSelectedScenario(e.target.value)}
                        aria-label="Escenario financiero"
                        className="bg-transparent border-none text-xs font-medium px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        <option value="ACTUAL">Ejecutado</option>
                        <option value="FORECAST">Proyección</option>
                        <option value="BUDGET">Presupuesto</option>
                    </select>
                    <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-1" />
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        {[2021, 2022, 2023, 2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-1" />
                    <select
                        value={selectedQuarter}
                        onChange={(e) => setSelectedQuarter(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        <option value="ALL">Todo el Año</option>
                        <option value="1">Trimestre 1 (Ene-Mar)</option>
                        <option value="2">Trimestre 2 (Abr-Jun)</option>
                        <option value="3">Trimestre 3 (Jul-Sep)</option>
                        <option value="4">Trimestre 4 (Oct-Dic)</option>
                    </select>
                </div>
                {canApproveFinancials && <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
                        Mes ejecutado hasta
                        <select value={actualThroughMonth} onChange={(event) => setActualThroughMonth(Number(event.target.value))} className="bg-transparent font-medium text-zinc-900 outline-none dark:text-white">
                            {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                        </select>
                    </label>
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest shadow-sm cursor-pointer transition-colors">
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                        Auditar archivo
                        <input
                            type="file"
                            className="hidden"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFinancialImportPreview}
                            disabled={isImporting}
                        />
                    </label>
                </div>}
            </PageHeader>

            {importError && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-200">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{importError}</p>
                </div>
            )}

            {importSuccess && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <p>{importSuccess}</p>
                </div>
            )}

            {/* --- SECTION 1: 4 HIGH-DENSITY KPI CARDS --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* KPI Card 1: Ingresos del Mes */}
                <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Ingresos registrados</span>
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {formatCurrency(kpis.totalIncome)}
                    </p>
                    <p className="mt-2 text-[10px] text-zinc-400">Según el escenario y periodo seleccionados</p>
                </Card>

                {/* KPI Card 2: Egresos del Mes */}
                <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Egresos registrados</span>
                        <div className="p-2 bg-red-500/10 rounded-xl">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {formatCurrency(kpis.totalExpense)}
                    </p>
                    <p className="mt-2 text-[10px] text-zinc-400">Según el escenario y periodo seleccionados</p>
                </Card>

                {/* KPI Card 3: Flujo Neto (Highest Visual Prominence) */}
                <Card className="p-6 bg-gradient-to-br from-violet-600/10 to-indigo-600/5 dark:from-violet-950/30 dark:to-indigo-950/20 border-violet-500/20 dark:border-violet-500/10 rounded-2xl shadow-md relative overflow-hidden group ring-1 ring-violet-500/10">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Resultado neto registrado</span>
                        <div className="p-2 bg-violet-500/20 rounded-xl">
                            <Wallet className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-violet-900 dark:text-violet-200">
                        {formatCurrency(kpis.netFlow)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            kpis.netFlow >= 0 ? "text-emerald-600 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
                        )}>
                            {kpis.netFlow >= 0 ? "EXCEDENTE" : "DÉFICIT"}
                        </span>
                        <span className="text-[10px] text-violet-600/80 dark:text-violet-400/80">Ingresos menos egresos del periodo</span>
                    </div>
                </Card>

                {/* KPI Card 4: Cartera Pendiente (Alert) */}
                <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Cartera en Mora</span>
                        <div className="p-2 bg-amber-500/10 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {formatCurrency(kpis.totalReceivable)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {data?.accountsReceivable?.length || 0} deudores
                        </span>
                        <span className="text-[10px] text-zinc-400">pendiente por cobrar</span>
                    </div>
                </Card>
            </div>

            {/* --- SECTION 2: TABS / SCENARIO NAVIGATION --- */}
            <div className="flex items-center overflow-x-auto border-b border-zinc-200 pb-px dark:border-white/5">
                <button
                    onClick={() => setActiveTab('records')}
                    className={cn(
                        "py-3 px-6 text-sm font-medium border-b-2 transition-all mr-2",
                        activeTab === 'records' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Movimientos
                </button>
                <button
                    onClick={() => setActiveTab('flow')}
                    className={cn(
                        "mr-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'flow' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Análisis de Flujo
                </button>
                <button
                    onClick={() => setActiveTab('receivables')}
                    className={cn(
                        "mr-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'receivables' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Cartera Morosa
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    className={cn(
                        "mr-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'payroll' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Nómina Operativa
                </button>
                <button
                    onClick={() => setActiveTab('editor')}
                    className={cn(
                        "mr-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'editor' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Conciliación
                </button>
                <button
                    onClick={() => setActiveTab('clients')}
                    className={cn(
                        "mr-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'clients' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Clientes
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    className={cn(
                        "whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-all",
                        activeTab === 'import' ? "text-violet-600 border-violet-600 dark:text-violet-300 dark:border-violet-400" : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                >
                    Auditoría 2026
                </button>
            </div>

            {/* --- SECTION 3: TAB SCENARIO VIEWS --- */}
            <div className="space-y-6">
                {activeTab === 'records' && (
                    <FinancialLedger selectedYear={selectedYear} formatCurrency={formatCurrency} />
                )}
                {/* PESTAÑA 1: ANALISIS DE FLUJO */}
                {activeTab === 'flow' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-right-4 duration-300">
                        {/* Cash flow line chart */}
                        <Card className="lg:col-span-8 p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-sm font-bold">Flujo de Caja Histórico</h3>
                                    <p className="text-[10px] text-zinc-500">Comparativa mensual de ingresos brutos vs egresos consolidados.</p>
                                </div>
                            </div>
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data?.cashFlow || []} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} />
                                        <XAxis
                                            dataKey="month"
                                            fontSize={10}
                                            tickFormatter={(val) => {
                                                const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                                                return monthNames[val - 1] || val;
                                            }}
                                        />
                                        <YAxis
                                            fontSize={10}
                                            tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                borderRadius: '16px',
                                                border: '1px solid #e4e4e7',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                color: '#18181b'
                                            }}
                                            formatter={(value) => formatCurrency(value)}
                                        />
                                        <Legend
                                            verticalAlign="top"
                                            height={36}
                                            iconType="circle"
                                            formatter={(value) => <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">{value === 'income' ? 'Ingresos' : 'Egresos'}</span>}
                                        />
                                        <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 2 }} />
                                        <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={{ r: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        {/* Doughnut Categories Distribution Chart */}
                        <Card className="lg:col-span-4 p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-sm font-bold">Distribución de Gastos</h3>
                                    <p className="text-[10px] text-zinc-500">Clasificación porcentual de egresos.</p>
                                </div>
                                <div className="p-2 bg-violet-600/10 rounded-xl">
                                    <PieIcon className="w-4 h-4 text-violet-600" />
                                </div>
                            </div>
                            {expenseDistributionData.length > 0 ? (
                                <div className="h-[300px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={expenseDistributionData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={85}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {expenseDistributionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#fff',
                                                    borderRadius: '12px',
                                                    border: '1px solid #e4e4e7',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    color: '#18181b'
                                                }}
                                                formatter={(value) => formatCurrency(value)}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Scrollable Legends list inside Card */}
                                    <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none">
                                        <span className="text-[9px] font-black uppercase text-zinc-400">Total Gastos</span>
                                        <span className="text-sm font-black tracking-tight text-zinc-900 dark:text-white">
                                            {formatCurrency(kpis.totalExpense)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[250px] flex items-center justify-center opacity-30 text-center">
                                    <p className="text-[10px] italic">Sin gastos registrados en el periodo</p>
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {/* PESTAÑA 2: CARTERA MOROSA */}
                {activeTab === 'receivables' && (
                    <div className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Cuentas por cobrar</h2>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Controla vencimientos, promesas y pagos sin alterar el saldo histórico.
                                </p>
                            </div>
                            {canWriteFinancials && <button type="button" onClick={() => { setReceivableForm({ clientId: '', amount: '', period: `${selectedYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, dueDate: '', comments: '' }); setIsReceivableEditorOpen(true); }} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">Nueva cuenta por cobrar</button>}
                        </div>

                        {data?.sourceSummary?.totals && (
                            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Saldo vigente</p>
                                        <p className="mt-1 font-black text-zinc-900 dark:text-white">{formatCurrency(data.sourceSummary.totals.receivable || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Referencia importada</p>
                                        <p className="mt-1 font-black text-amber-600">{formatCurrency(data.sourceSummary.totals.calculatedReceivable || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Diferencia histórica</p>
                                        <p className="mt-1 font-black text-violet-600">
                                            {formatCurrency((data.sourceSummary.totals.calculatedReceivable || 0) - (data.sourceSummary.totals.receivable || 0))}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {isReceivablesLedgerLoading ? (
                            <div className="p-10 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl text-center">
                                <Loader2 className="w-5 h-5 animate-spin text-violet-600 mx-auto mb-3" />
                                <p className="text-sm font-bold text-zinc-900 dark:text-white">Cargando cartera...</p>
                            </div>
                        ) : receivablesByClient.length > 0 ? (
                            <div className="space-y-3">
                                {receivablesByClient.map((client) => {
                                    const isExpanded = !!expandedClients[client.clientId];
                                    return (
                                        <Card key={client.clientId} className="p-4 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm">
                                            <div
                                                onClick={() => toggleClientExpand(client.clientId)}
                                                className="flex items-center justify-between cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-sm">
                                                        {client.client.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-zinc-900 dark:text-white group-hover:text-violet-600 transition-colors">
                                                            {client.client.name}
                                                        </h4>
                                                        <p className="text-[10px] text-zinc-500">
                                                            {client.debts?.length} registros de cartera
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-zinc-900 dark:text-white">
                                                            {formatCurrency(client.totalOutstanding)}
                                                        </p>
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded font-bold uppercase tracking-widest">
                                                            EN MORA
                                                        </span>
                                                    </div>
                                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                                                </div>
                                            </div>

                                            {/* Expandable monthly details */}
                                            {isExpanded && (
                                                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-white/5 space-y-3 animate-in fade-in duration-300">
                                                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2">Desglose de Facturas Mensuales (Antigüedad)</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {client.debts?.map((debt) => (
                                                            <div key={debt.id} className="p-3 bg-zinc-50 dark:bg-white/5 rounded-xl border border-zinc-100 dark:border-white/5 flex flex-col justify-between gap-3">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="text-[10px] font-bold text-zinc-400">
                                                                        Periodo: {new Date(debt.period).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' }).toUpperCase()}
                                                                    </span>
                                                                    {savingReceivableId === debt.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />}
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-2 border-y border-zinc-200 py-3 dark:border-white/10">
                                                                    <div><span className="text-[9px] font-medium text-zinc-400">Valor original</span><p className="mt-1 text-xs font-semibold text-zinc-900 dark:text-white">{formatCurrency(debt.amount || 0)}</p></div>
                                                                    <div><span className="text-[9px] font-medium text-zinc-400">Pagado</span><p className="mt-1 text-xs font-semibold text-emerald-600">{formatCurrency(debt.paidAmount || 0)}</p></div>
                                                                    <div><span className="text-[9px] font-medium text-zinc-400">Saldo pendiente</span><p className="mt-1 text-xs font-semibold text-amber-600">{formatCurrency(debt.outstanding || 0)}</p></div>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                                                    <label className="space-y-1">
                                                                        <span className="text-[9px] font-medium text-zinc-400">Estado de seguimiento</span>
                                                                        <select
                                                                            value={debt.status}
                                                                            disabled={savingReceivableId === debt.id}
                                                                            onChange={(event) => handleReceivableUpdate(debt, { status: event.target.value })}
                                                                            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-bold text-zinc-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                                                                        >
                                                                            <option value="DEBE">Debe</option>
                                                                            <option value="PROMESADO">Promesado</option>
                                                                            {debt.outstanding <= 0.005 && <option value="PAGADO">Pagado</option>}
                                                                        </select>
                                                                    </label>
                                                                    {debt.outstanding > 0.005 && <button type="button" onClick={() => openReceivablePayment(debt)} className="self-end rounded-lg bg-[#009EB9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#008CA4]">Registrar pago</button>}
                                                                </div>
                                                                {debt.dueDate && (
                                                                    <p className="text-[9px] text-zinc-500 mt-1">
                                                                        Vence: {new Date(debt.dueDate).toLocaleDateString('es-CO')}
                                                                    </p>
                                                                )}
                                                                <textarea
                                                                    defaultValue={debt.comments || debt.notes || ''}
                                                                    disabled={savingReceivableId === debt.id}
                                                                    onBlur={(event) => {
                                                                        const nextComments = event.target.value;
                                                                        if (nextComments !== (debt.comments || debt.notes || '')) {
                                                                            handleReceivableUpdate(debt, { comments: nextComments });
                                                                        }
                                                                    }}
                                                                    placeholder="Comentario de seguimiento..."
                                                                    className="min-h-[64px] w-full resize-y rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-10 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl text-center flex flex-col items-center justify-center">
                                <ShieldCheck className="w-12 h-12 text-emerald-500 mb-3 animate-pulse" />
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">¡Cartera 100% al día!</h4>
                                <p className="text-[10px] text-zinc-500 max-w-xs mt-1">No hay saldos en mora ni facturas pendientes para este periodo.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* PESTAÑA 3: NOMINA OPERATIVA */}
                {activeTab === 'payroll' && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Nómina mensual</h2>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Genera las liquidaciones, apruébalas y registra el pago desde la cuenta bancaria correspondiente.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <select value={payrollMonth} onChange={(event) => setPayrollMonth(Number(event.target.value))} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                                    {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                                </select>
                                <span className="rounded-lg bg-violet-600/10 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300" title={`Total contractual: ${formatCurrency(editablePayrollTotal || 0)}`}>
                                    {formatCurrency(editablePayrollTotal || 0)}
                                </span>
                                {canWriteFinancials && <button type="button" onClick={() => openPayrollContractEditor()} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Nuevo contrato</button>}
                                {canWriteFinancials && <button type="button" onClick={() => setIsPayrollGenerationConfirmOpen(true)} disabled={isGeneratingPayroll} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                                    {isGeneratingPayroll && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Generar nómina
                                </button>}
                            </div>
                        </div>

                        {isPayrollLedgerLoading ? (
                            <div className="p-10 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl text-center">
                                <Loader2 className="w-5 h-5 animate-spin text-violet-600 mx-auto mb-3" />
                                <p className="text-sm font-bold text-zinc-900 dark:text-white">Cargando nómina...</p>
                            </div>
                        ) : payrollRows.length > 0 ? (
                            <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/50 text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                                                <th className="p-4">Colaborador</th>
                                                <th className="p-4">Contrato (Base)</th>
                                                <th className="p-4">Seguridad Social</th>
                                                <th className="p-4">Estado del mes</th>
                                                <th className="p-4 text-right">Total neto</th>
                                                <th className="p-4 text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {payrollRows.map((collab) => {
                                                const transaction = collab.transaction;
                                                const netAmount = transaction?.netAmount ?? collab.monthlyTotal ?? collab.totalPaid ?? 0;
                                                return (
                                                <tr key={collab.id || collab.collaboratorId || collab.userId || collab.contractId || collab.name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 text-xs">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-600 font-bold text-[11px]">
                                                                {collab.name.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-zinc-900 dark:text-white">{collab.name}</p>
                                                                <p className="text-[10px] text-zinc-500">{collab.position || collab.email || 'Sin cargo'}</p>
                                                                {canWriteFinancials && <button type="button" onClick={() => openPayrollContractEditor(collab)} className="mt-1 text-[10px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">Editar contrato</button>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 font-medium">
                                                        <input
                                                            type="number"
                                                            defaultValue={collab.baseSalary || 0}
                                                            disabled={savingPayrollContractId === (collab.id || collab.contractId)}
                                                            onBlur={(event) => {
                                                                const nextValue = Number(event.target.value || 0);
                                                                if (Number.isFinite(nextValue) && nextValue !== collab.baseSalary) {
                                                                    handlePayrollContractUpdate(collab, { baseSalary: nextValue });
                                                                }
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') event.currentTarget.blur();
                                                            }}
                                                            className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-bold text-zinc-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                                                        />
                                                    </td>
                                                    <td className="p-4 text-zinc-500">
                                                        <input
                                                            type="number"
                                                            defaultValue={collab.socialSecurity || 0}
                                                            disabled={savingPayrollContractId === (collab.id || collab.contractId)}
                                                            onBlur={(event) => {
                                                                const nextValue = Number(event.target.value || 0);
                                                                if (Number.isFinite(nextValue) && nextValue !== collab.socialSecurity) {
                                                                    handlePayrollContractUpdate(collab, { socialSecurity: nextValue });
                                                                }
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') event.currentTarget.blur();
                                                            }}
                                                            className="w-32 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-bold text-zinc-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                                                        />
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={cn(
                                                            "inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold",
                                                            !transaction && "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300",
                                                            transaction?.status === 'DRAFT' && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                                                            transaction?.status === 'APPROVED' && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                                                            transaction?.status === 'PAID' && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                        )}>{!transaction ? 'Sin generar' : transaction.status === 'DRAFT' ? 'Borrador' : transaction.status === 'APPROVED' ? 'Aprobada' : 'Pagada'}</span>
                                                    </td>
                                                    <td className="p-4 text-right font-black text-zinc-900 dark:text-white">
                                                        {formatCurrency(netAmount)}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {transaction?.status === 'DRAFT' && canApproveFinancials && <button type="button" disabled={savingPayrollTransactionId === transaction.id} onClick={() => handleApprovePayroll(transaction)} className="rounded-lg border border-[#009EB9]/30 px-3 py-1.5 text-[11px] font-semibold text-[#009EB9] hover:bg-[#009EB9]/10 disabled:opacity-50 dark:text-cyan-300">Aprobar</button>}
                                                        {transaction?.status === 'APPROVED' && canApproveFinancials && <button type="button" onClick={() => { setPayrollPayment(transaction); setPayrollPaymentForm({ paidAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), accountId: '', reference: '' }); }} className="rounded-lg bg-[#009EB9] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#008CA4]">Registrar pago</button>}
                                                        {transaction?.status === 'PAID' && <span className="text-[11px] font-medium text-zinc-500">{transaction.paidAt ? new Date(transaction.paidAt).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : 'Registrado'}</span>}
                                                        {!transaction && <span className="text-[11px] text-zinc-400">Pendiente</span>}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        ) : (
                            <div className="p-10 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl text-center">
                                <Users className="w-12 h-12 text-zinc-300 mb-3 mx-auto" />
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Sin transacciones registradas</h4>
                                <p className="text-[10px] text-zinc-500 max-w-xs mt-1 mx-auto">No hay nóminas validadas ni pagadas en este periodo.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'editor' && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <BankReconciliationPanel selectedYear={selectedYear} canApprove={canApproveFinancials} />
                        <div className="border-t border-zinc-200 pt-5 dark:border-white/10">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Conciliación mensual</h2>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                    Referencia original importada. Las correcciones se realizan desde Movimientos para conservar la trazabilidad.
                                </p>
                            </div>
                            {monthlyLedger?.importBatchId && (
                                <span className="rounded-full bg-violet-600/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-600">
                                    Fuente DB activa
                                </span>
                            )}
                        </div>

                        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                            {isMonthlyLedgerLoading ? (
                                <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Cargando conciliación...
                                </div>
                            ) : monthlyLedger?.rows?.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[1120px] w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/80 dark:bg-zinc-900/60 text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                                                <th className="sticky left-0 z-10 bg-zinc-50/95 dark:bg-zinc-900 p-4 min-w-[220px]">Rubro</th>
                                                {monthlyLedger.months.map((month) => (
                                                    <th key={month.month} className="p-3 text-right min-w-[110px]">{month.label}</th>
                                                ))}
                                                <th className="p-3 text-right min-w-[130px]">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {monthlyLedger.rows.map((row) => {
                                                const rowTotal = row.values.reduce((sum, cell) => sum + (Number(cell.amount) || 0), 0);
                                                return (
                                                    <tr key={row.key} className="text-xs hover:bg-zinc-50/60 dark:hover:bg-white/5">
                                                        <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 p-4">
                                                            <div className="font-bold text-zinc-900 dark:text-white">{row.label}</div>
                                                            <div className={cn(
                                                                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest",
                                                                row.tone === 'income' && "bg-emerald-500/10 text-emerald-600",
                                                                row.tone === 'expense' && "bg-red-500/10 text-red-500",
                                                                row.tone === 'financing' && "bg-cyan-500/10 text-cyan-600",
                                                                row.tone === 'warning' && "bg-amber-500/10 text-amber-600",
                                                                row.tone === 'net' && "bg-violet-600/10 text-violet-600"
                                                            )}>
                                                                {row.tone}
                                                            </div>
                                                        </td>
                                                        {row.values.map((cell) => (
                                                            <td key={`${row.key}-${cell.month}`} className="p-3 text-right text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                                                                {formatCurrency(Number(cell.amount) || 0)}
                                                            </td>
                                                        ))}
                                                        <td className={cn(
                                                            "p-3 text-right text-xs font-black",
                                                            rowTotal < 0 ? "text-red-500" : row.tone === 'income' ? "text-emerald-600" : "text-zinc-900 dark:text-white"
                                                        )}>
                                                            {formatCurrency(rowTotal)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-16 text-center">
                                    <FileSpreadsheet className="w-10 h-10 mx-auto text-zinc-300 mb-3" />
                                    <p className="text-sm font-bold text-zinc-900 dark:text-white">No hay datos mensuales para conciliar</p>
                                    <p className="text-xs text-zinc-500 mt-1">Importa primero el financiero del año seleccionado.</p>
                                </div>
                            )}
                        </Card>
                        </div>
                    </div>
                )}

                {activeTab === 'clients' && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Conciliación de clientes</h2>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                    Vincula clientes importados desde el Excel con el cliente real de la plataforma para unificar ingresos, cartera y decisiones.
                                </p>
                            </div>
                            {clientReconciliation?.importBatchId && (
                                <span className="rounded-full bg-violet-600/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-600">
                                    Importación activa
                                </span>
                            )}
                        </div>

                        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                            {isClientReconciliationLoading ? (
                                <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-violet-600" />
                                    Cargando conciliación de clientes...
                                </div>
                            ) : clientReconciliation?.clients?.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[1040px] w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/80 dark:bg-zinc-900/60 text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                                                <th className="p-4 min-w-[240px]">Cliente financiero</th>
                                                <th className="p-4 text-right">Ingresos</th>
                                                <th className="p-4 text-right">Cartera</th>
                                                <th className="p-4 text-right">Registros</th>
                                                <th className="p-4 min-w-[280px]">Cliente real</th>
                                                <th className="p-4 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {clientReconciliation.clients.map((row) => {
                                                const sourceId = row.sourceId || row.clientId;
                                                const targetId = clientLinkTargets[sourceId] || '';
                                                const isSaving = savingClientLinkId === sourceId;
                                                return (
                                                    <tr key={sourceId} className="text-xs hover:bg-zinc-50/60 dark:hover:bg-white/5">
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-9 w-9 rounded-xl bg-violet-600/10 text-violet-600 flex items-center justify-center text-[11px] font-black">
                                                                    {(row.client?.name || 'CL').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="font-black text-zinc-900 dark:text-white">{row.client?.name}</p>
                                                                    <p className="text-[10px] text-zinc-400">{row.client?.slug || 'sin-slug'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right font-black text-emerald-600">{formatCurrency(row.income || 0)}</td>
                                                        <td className="p-4 text-right font-black text-amber-600">{formatCurrency(row.receivable || 0)}</td>
                                                        <td className="p-4 text-right text-zinc-500">
                                                            {(row.recordCount || 0) + (row.receivableCount || 0)}
                                                        </td>
                                                        <td className="p-4">
                                                            <select
                                                                value={targetId}
                                                                disabled={isSaving}
                                                                onChange={(event) => setClientLinkTargets(prev => ({
                                                                    ...prev,
                                                                    [sourceId]: event.target.value
                                                                }))}
                                                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                                                            >
                                                                <option value="">Seleccionar cliente...</option>
                                                                {clientReconciliation.targets
                                                                    ?.filter((target) => target.id !== row.clientId)
                                                                    .map((target) => (
                                                                        <option key={target.id} value={target.id}>{target.name}</option>
                                                                    ))}
                                                            </select>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <button
                                                                type="button"
                                                                disabled={!targetId || isSaving}
                                                                onClick={() => handleClientLink(sourceId)}
                                                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                                                                Vincular
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-16 text-center">
                                    <Users className="w-10 h-10 mx-auto text-zinc-300 mb-3" />
                                    <p className="text-sm font-bold text-zinc-900 dark:text-white">No hay clientes financieros por conciliar</p>
                                    <p className="text-xs text-zinc-500 mt-1">Importa primero el financiero del año seleccionado.</p>
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                        <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Preparación para operar sin Excel</h2>
                                    <p className="mt-1 text-xs text-zinc-500">Control automático sobre cuentas, movimientos, cartera, nómina y cierres de {selectedYear}.</p>
                                </div>
                                {isIntegrityAuditLoading ? <Loader2 className="h-5 w-5 animate-spin text-violet-600" /> : <span className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', integrityAudit?.ready ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>{integrityAudit?.ready ? 'Lista para operar' : `${integrityAudit?.issues?.length || 0} puntos por resolver`}</span>}
                            </div>
                            {!isIntegrityAuditLoading && integrityAudit?.issues?.length > 0 && <div className="mt-5 divide-y divide-zinc-100 border-y border-zinc-100 dark:divide-white/5 dark:border-white/5">{integrityAudit.issues.map((item) => <div key={item.code} className="flex items-start gap-3 py-3"><span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', item.severity === 'ERROR' ? 'bg-red-500' : 'bg-amber-500')} /><div><p className="text-sm font-medium text-zinc-900 dark:text-white">{item.message}</p><p className="mt-0.5 text-xs text-zinc-500">{item.count} {item.count === 1 ? 'registro' : 'registros'} · {item.severity === 'ERROR' ? 'Bloquea una conciliación confiable' : 'Requiere revisión'}</p></div></div>)}</div>}
                            {!isIntegrityAuditLoading && integrityAudit?.ready && <div className="mt-5 flex items-center gap-3 border-y border-emerald-100 py-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /> No se detectaron bloqueos de integridad.</div>}
                        </Card>
                        {!importPreview ? (
                            <Card className="p-10 bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-white/10 rounded-2xl text-center">
                                <FileSpreadsheet className="w-12 h-12 text-violet-500 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Auditor financiero 2026</h3>
                                <p className="text-sm text-zinc-500 max-w-xl mx-auto mt-2">
                                    Sube el CSV o Excel de finanzas para convertirlo en registros mensuales, revisar totales y detectar filas que necesitan separarse antes de entrar a la base de datos.
                                </p>
                            </Card>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <Card className="p-5 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Ingresos detectados</p>
                                        <p className="text-xl font-black mt-2 text-emerald-600">{formatCurrency(importPreview.totals?.calculated?.income || 0)}</p>
                                    </Card>
                                    <Card className="p-5 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Egresos detectados</p>
                                        <p className="text-xl font-black mt-2 text-red-500">{formatCurrency(importPreview.totals?.calculated?.expense || 0)}</p>
                                    </Card>
                                    <Card className="p-5 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Deudas grandes</p>
                                        <p className="text-xl font-black mt-2 text-amber-500">{formatCurrency(importPreview.totals?.explicit?.debt || importPreview.totals?.calculated?.debt || 0)}</p>
                                    </Card>
                                    <Card className="p-5 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Registros mensuales</p>
                                        <p className="text-xl font-black mt-2 text-violet-600">{importPreview.entries?.length || 0}</p>
                                    </Card>
                                </div>

                                <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl">
                                    <div className="flex items-start justify-between gap-6">
                                        <div>
                                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Resultado de auditoría</h3>
                                            <p className="text-[11px] text-zinc-500 mt-1">
                                                Archivo: {importPreview.filename || 'Sin nombre'} · Año {importPreview.year}
                                            </p>
                                            {importPreview.workbook?.sheetNames?.length > 0 && (
                                                <p className="text-[11px] text-zinc-500 mt-1">
                                                    Hojas detectadas: {importPreview.workbook.sheetNames.join(', ')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-3">
                                            <div className={cn(
                                                "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest",
                                                importPreview.warnings?.length > 0
                                                    ? "bg-amber-500/10 text-amber-600"
                                                    : "bg-emerald-500/10 text-emerald-600"
                                            )}>
                                                {importPreview.warnings?.length > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                {importPreview.warnings?.length || 0} alertas
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleFinancialImportCommit}
                                                disabled={isCommittingImport || !importFile}
                                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isCommittingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                                                Importar a base de datos
                                            </button>
                                        </div>
                                    </div>

                                    {importPreview.payrollContinuityFlags?.length > 0 && (
                                        <div className="mt-6 space-y-3">
                                            <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Continuidad de nómina por revisar</p>
                                            {importPreview.payrollContinuityFlags.map((flag) => (
                                                <div key={`${flag.rowNumber}-${flag.label}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-950/20">
                                                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{flag.label}</p>
                                                    <p className="text-xs text-amber-700 dark:text-amber-200 mt-1">{flag.reason}</p>
                                                    <p className="text-[10px] text-zinc-500 mt-2">Fila {flag.rowNumber} · Meses: {flag.months.join(', ')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {importPreview.totals?.monthly && (
                                        <div className="mt-6 overflow-x-auto">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Resumen mensual importado</p>
                                                    <p className="text-xs text-zinc-500 mt-1">Esta tabla es el puente entre el Excel y el módulo financiero operativo.</p>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-violet-600/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-600">
                                                    {importPreview.layout === 'CATEGORIZED_MONTHLY' ? 'Formato nuevo' : 'Formato legado'}
                                                </span>
                                            </div>
                                            <table className="min-w-[980px] w-full text-left text-[11px]">
                                                <thead className="text-[9px] uppercase tracking-widest text-zinc-400">
                                                    <tr>
                                                        <th className="py-2 pr-4">Rubro</th>
                                                        {monthLabels.map((month) => (
                                                            <th key={month} className="py-2 px-2 text-right">{month}</th>
                                                        ))}
                                                        <th className="py-2 pl-2 text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                                    {[
                                                        ['Ingresos', importPreview.totals.monthly.explicit.income, 'text-emerald-600'],
                                                        ['Costos administrativos', importPreview.totals.monthly.explicit.expense, 'text-red-500'],
                                                        ['Gastos operativos', importPreview.totals.monthly.explicit.operatingExpense, 'text-orange-500'],
                                                        ['Financiamiento / inversión', importPreview.totals.monthly.explicit.financing, 'text-cyan-600'],
                                                        ['Resultado del ejercicio', importPreview.totals.monthly.explicit.netResult, 'text-violet-600']
                                                    ].map(([label, values, colorClass]) => {
                                                        const safeValues = Array.isArray(values) ? values : Array(12).fill(0);
                                                        const total = safeValues.reduce((sum, value) => sum + value, 0);
                                                        return (
                                                            <tr key={label} className="hover:bg-zinc-50/70 dark:hover:bg-white/5">
                                                                <td className="py-3 pr-4 font-bold text-zinc-800 dark:text-zinc-100">{label}</td>
                                                                {safeValues.map((value, index) => (
                                                                    <td key={`${label}-${index}`} className={cn("py-3 px-2 text-right font-bold", value < 0 ? "text-red-500" : value > 0 ? colorClass : "text-zinc-300")}>
                                                                        {value ? formatCurrency(value) : '-'}
                                                                    </td>
                                                                ))}
                                                                <td className={cn("py-3 pl-2 text-right font-black", total < 0 ? "text-red-500" : total > 0 ? colorClass : "text-zinc-300")}>
                                                                    {total ? formatCurrency(total) : '-'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {importPreview.payrollRoster?.length > 0 && (
                                        <div className="mt-6 overflow-x-auto">
                                            <div className="flex items-center justify-between gap-4 mb-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Nómina detectada</p>
                                                    <p className="text-xs text-zinc-500 mt-1">Base para crear contratos y vigencias del equipo dentro de la plataforma.</p>
                                                </div>
                                                <span className="rounded-full bg-pink-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-pink-600">
                                                    {importPreview.payrollRoster.length} personas
                                                </span>
                                            </div>
                                            <table className="min-w-[760px] w-full text-left text-xs">
                                                <thead className="text-[10px] uppercase tracking-widest text-zinc-400">
                                                    <tr>
                                                        <th className="py-2 pr-4">Persona</th>
                                                        <th className="py-2 pr-4">Cargo</th>
                                                        <th className="py-2 text-right">Devengado</th>
                                                        <th className="py-2 text-right">Seguridad social</th>
                                                        <th className="py-2 text-right">Total mensual</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                                    {importPreview.payrollRoster.map((person) => (
                                                        <tr key={`${person.rowNumber}-${person.name}`} className="hover:bg-zinc-50/70 dark:hover:bg-white/5">
                                                            <td className="py-3 pr-4 font-bold text-zinc-800 dark:text-zinc-100">{person.name}</td>
                                                            <td className="py-3 pr-4 text-zinc-500">{person.role || '-'}</td>
                                                            <td className="py-3 text-right font-bold">{person.baseSalary ? formatCurrency(person.baseSalary) : '-'}</td>
                                                            <td className="py-3 text-right font-bold">{person.socialSecurity ? formatCurrency(person.socialSecurity) : '-'}</td>
                                                            <td className="py-3 text-right font-black text-pink-600">{person.monthlyTotal ? formatCurrency(person.monthlyTotal) : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {importPreview.debts?.length > 0 && (
                                        <div className="mt-6 overflow-x-auto">
                                            <div className="flex items-center justify-between gap-4 mb-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-widest font-black text-zinc-400">Morosos detectados</p>
                                                    <p className="text-xs text-zinc-500 mt-1">
                                                        Total operativo del Excel: {formatCurrency(importPreview.totals?.explicit?.debt || 0)}
                                                        {importPreview.totals?.explicit?.debtComments ? ` · Comentarios: ${formatCurrency(importPreview.totals.explicit.debtComments)}` : ''}
                                                    </p>
                                                </div>
                                                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
                                                    {importPreview.debts.length} registros
                                                </span>
                                            </div>
                                            <table className="w-full text-left text-xs">
                                                <thead className="text-[10px] uppercase tracking-widest text-zinc-400">
                                                    <tr>
                                                        <th className="py-2">Cliente / tercero</th>
                                                        <th className="py-2 text-right">Monto</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                                    {importPreview.debts.map((debt) => (
                                                        <tr key={`${debt.rowNumber}-${debt.sourceLabel}`}>
                                                            <td className="py-3 font-bold text-zinc-800 dark:text-zinc-100">{debt.sourceLabel}</td>
                                                            <td className="py-3 text-right font-black">{formatCurrency(debt.amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </Card>
                            </>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={isPayrollGenerationConfirmOpen} onOpenChange={(open) => !isGeneratingPayroll && setIsPayrollGenerationConfirmOpen(open)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>Generar nómina mensual</DialogTitle>
                        <DialogDescription>
                            Se crearán las liquidaciones de {['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][payrollMonth - 1]} de {selectedYear} a partir de los contratos activos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                        <p>Cada liquidación quedará en estado Borrador para que puedas revisar sus valores antes de aprobarla.</p>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">No registra pagos ni crea egresos en el libro financiero.</p>
                    </div>
                    <DialogFooter>
                        <button type="button" onClick={() => setIsPayrollGenerationConfirmOpen(false)} disabled={isGeneratingPayroll} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">Cancelar</button>
                        <button type="button" onClick={handleGeneratePayroll} disabled={isGeneratingPayroll} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{isGeneratingPayroll && <Loader2 className="h-4 w-4 animate-spin" />}Generar borradores</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isReceivableEditorOpen} onOpenChange={setIsReceivableEditorOpen}>
                <DialogContent className="sm:max-w-lg dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>Nueva cuenta por cobrar</DialogTitle>
                        <DialogDescription>Registra el valor causado; los abonos posteriores actualizarán automáticamente el saldo.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateReceivable} className="space-y-4">
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cliente<select required value={receivableForm.clientId} onChange={(event) => setReceivableForm((current) => ({ ...current, clientId: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white"><option value="">Seleccionar...</option>{(clientReconciliation?.targets || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Valor<input required min="0.01" step="0.01" type="number" value={receivableForm.amount} onChange={(event) => setReceivableForm((current) => ({ ...current, amount: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Periodo<DatePicker {...brainDatePickerProps} selected={receivableForm.period ? new Date(`${receivableForm.period}T12:00:00`) : null} onChange={(date) => setReceivableForm((current) => ({ ...current, period: date ? format(date, 'yyyy-MM-01') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="MMMM yyyy" showMonthYearPicker /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200 sm:col-span-2">Fecha de vencimiento<DatePicker {...brainDatePickerProps} isClearable selected={receivableForm.dueDate ? new Date(`${receivableForm.dueDate}T12:00:00`) : null} onChange={(date) => setReceivableForm((current) => ({ ...current, dueDate: date ? format(date, 'yyyy-MM-dd') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="dd/MM/yyyy" placeholderText="Opcional" /></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Nota<textarea rows={3} value={receivableForm.comments} onChange={(event) => setReceivableForm((current) => ({ ...current, comments: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" placeholder="Factura, compromiso o detalle de seguimiento" /></label>
                        <DialogFooter><button type="button" onClick={() => setIsReceivableEditorOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="submit" disabled={isSavingReceivable} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isSavingReceivable && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!paymentDebt} onOpenChange={(open) => !open && setPaymentDebt(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>Registrar pago</DialogTitle>
                        <DialogDescription>
                            {paymentDebt ? `${paymentDebt.clientName}: saldo ${formatCurrency(paymentDebt.outstanding || 0)}` : 'Registra un abono de cartera.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReceivablePayment} className="space-y-4">
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Valor<input required min="0.01" max={paymentDebt?.outstanding || undefined} step="0.01" type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha<DatePicker {...brainDatePickerProps} required selected={paymentForm.paidAt ? new Date(`${paymentForm.paidAt}T12:00:00`) : null} onChange={(date) => setPaymentForm((current) => ({ ...current, paidAt: date ? format(date, 'yyyy-MM-dd') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="dd/MM/yyyy" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cuenta<select required value={paymentForm.accountId} onChange={(event) => setPaymentForm((current) => ({ ...current, accountId: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white"><option value="">Seleccionar...</option>{(financialAccounts?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Referencia<input value={paymentForm.reference} onChange={(event) => setPaymentForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Transferencia, recibo..." className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Notas<textarea rows={3} value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                        <DialogFooter><button type="button" onClick={() => setPaymentDebt(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="submit" disabled={isSavingPayment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isSavingPayment && <Loader2 className="h-4 w-4 animate-spin" />}Guardar pago</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!payrollPayment} onOpenChange={(open) => !open && setPayrollPayment(null)}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>Registrar pago de nómina</DialogTitle>
                        <DialogDescription>
                            El pago generará un egreso real y quedará vinculado con esta liquidación.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePayPayroll} className="space-y-4">
                        <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm dark:bg-white/5">
                            <span className="text-zinc-500">Valor neto</span>
                            <strong className="float-right text-zinc-900 dark:text-white">{formatCurrency(payrollPayment?.netAmount || 0)}</strong>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Fecha<DatePicker {...brainDatePickerProps} required selected={payrollPaymentForm.paidAt ? new Date(`${payrollPaymentForm.paidAt}T12:00:00`) : null} onChange={(date) => setPayrollPaymentForm((current) => ({ ...current, paidAt: date ? format(date, 'yyyy-MM-dd') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="dd/MM/yyyy" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cuenta<select required value={payrollPaymentForm.accountId} onChange={(event) => setPayrollPaymentForm((current) => ({ ...current, accountId: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white"><option value="">Seleccionar...</option>{(financialAccounts?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                        </div>
                        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Referencia<input value={payrollPaymentForm.reference} onChange={(event) => setPayrollPaymentForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Transferencia, comprobante..." className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                        <DialogFooter><button type="button" onClick={() => setPayrollPayment(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="submit" disabled={isSavingPayrollPayment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isSavingPayrollPayment && <Loader2 className="h-4 w-4 animate-spin" />}Guardar pago</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isPayrollContractEditorOpen} onOpenChange={setIsPayrollContractEditorOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
                    <DialogHeader>
                        <DialogTitle>{editingPayrollContract ? 'Editar contrato' : 'Nuevo contrato'}</DialogTitle>
                        <DialogDescription>La vigencia determina en cuáles meses se incluye al colaborador al generar la nómina.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSavePayrollContract} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Colaborador<input required value={payrollContractForm.name} onChange={(event) => setPayrollContractForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Cargo<input value={payrollContractForm.position} onChange={(event) => setPayrollContractForm((current) => ({ ...current, position: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Inicio<DatePicker {...brainDatePickerProps} selected={payrollContractForm.startDate ? new Date(`${payrollContractForm.startDate}T12:00:00`) : null} onChange={(date) => setPayrollContractForm((current) => ({ ...current, startDate: date ? format(date, 'yyyy-MM-dd') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="dd/MM/yyyy" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Terminación<DatePicker {...brainDatePickerProps} isClearable selected={payrollContractForm.endDate ? new Date(`${payrollContractForm.endDate}T12:00:00`) : null} onChange={(date) => setPayrollContractForm((current) => ({ ...current, endDate: date ? format(date, 'yyyy-MM-dd') : '' }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" dateFormat="dd/MM/yyyy" placeholderText="Contrato activo" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Salario base<input required min="0" step="0.01" type="number" value={payrollContractForm.baseSalary} onChange={(event) => setPayrollContractForm((current) => ({ ...current, baseSalary: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">Seguridad social<input required min="0" step="0.01" type="number" value={payrollContractForm.socialSecurity} onChange={(event) => setPayrollContractForm((current) => ({ ...current, socialSecurity: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                            <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200 sm:col-span-2">Total mensual<input required min="0" step="0.01" type="number" value={payrollContractForm.monthlyTotal} onChange={(event) => setPayrollContractForm((current) => ({ ...current, monthlyTotal: event.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white" /></label>
                        </div>
                        <DialogFooter><button type="button" onClick={() => setIsPayrollContractEditorOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-white/10">Cancelar</button><button type="submit" disabled={isSavingPayrollContract} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#009EB9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{isSavingPayrollContract && <Loader2 className="h-4 w-4 animate-spin" />}Guardar contrato</button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const emptyPayrollContractForm = (year) => ({
    name: '',
    position: '',
    baseSalary: '',
    socialSecurity: '0',
    monthlyTotal: '',
    startDate: `${year}-01-01`,
    endDate: ''
});

// Premium pulsing Skeleton Screen component
const SkeletonLoader = () => {
    return (
        <div className="space-y-8 animate-pulse">
            <div className="flex justify-between items-center mb-10">
                <div className="space-y-3">
                    <div className="h-6 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                    <div className="h-3 w-96 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
                </div>
                <div className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-2xl border border-zinc-300/30" />
                ))}
            </div>

            <div className="h-10 w-96 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 h-80 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
                <div className="lg:col-span-4 h-80 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            </div>
        </div>
    );
};

export default FinancialDashboard;
