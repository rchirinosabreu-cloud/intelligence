import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Wallet, ShieldCheck, AlertCircle,
    Users, ChevronDown, ChevronUp, Loader2, Sparkles, Calendar, PieChart as PieIcon, ListCollapse, ListCollapse as ExpandIcon,
    UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';

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
    const [activeTab, setActiveTab] = useState('flow');
    const [expandedClients, setExpandedClients] = useState({});
    const [importPreview, setImportPreview] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const [importError, setImportError] = useState('');
    const [importSuccess, setImportSuccess] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isCommittingImport, setIsCommittingImport] = useState(false);
    const canAccessFinancials = currentUser?.role === 'ADMIN' || currentUser?.hasFinancialAccess === true;

    // Fetch analytical aggregation from protected backend endpoint
    const { data, isLoading, error } = useQuery({
        queryKey: ['financials-dashboard-data', selectedYear, selectedQuarter],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const url = `${baseUrl}/api/financials/dashboard?year=${selectedYear}${selectedQuarter !== 'ALL' ? `&quarter=${selectedQuarter}` : ''}`;
            const res = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!(currentUser && canAccessFinancials) // Dynamic safeguard to prevent 401s
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
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Ingresos Totales</span>
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {formatCurrency(kpis.totalIncome)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            +12.4%
                        </span>
                        <span className="text-[10px] text-zinc-400">vs trimestre anterior</span>
                    </div>
                </Card>

                {/* KPI Card 2: Egresos del Mes */}
                <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Egresos Totales</span>
                        <div className="p-2 bg-red-500/10 rounded-xl">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {formatCurrency(kpis.totalExpense)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                            +4.8%
                        </span>
                        <span className="text-[10px] text-zinc-400">incremento operativo</span>
                    </div>
                </Card>

                {/* KPI Card 3: Flujo Neto (Highest Visual Prominence) */}
                <Card className="p-6 bg-gradient-to-br from-violet-600/10 to-indigo-600/5 dark:from-violet-950/30 dark:to-indigo-950/20 border-violet-500/20 dark:border-violet-500/10 rounded-2xl shadow-md relative overflow-hidden group ring-1 ring-violet-500/10">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase tracking-widest">Balance de Caja Neto</span>
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
                        <span className="text-[10px] text-violet-600/80 dark:text-violet-400/80">margen real calculated</span>
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
            <div className="flex items-center border-b border-zinc-200 dark:border-white/5 pb-px">
                <button
                    onClick={() => setActiveTab('flow')}
                    className={cn(
                        "py-3 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all mr-2",
                        activeTab === 'flow' ? "text-violet-600 border-violet-600 dark:text-white dark:border-white" : "text-zinc-400 border-transparent hover:text-zinc-600"
                    )}
                >
                    Análisis de Flujo
                </button>
                <button
                    onClick={() => setActiveTab('receivables')}
                    className={cn(
                        "py-3 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all mr-2",
                        activeTab === 'receivables' ? "text-violet-600 border-violet-600 dark:text-white dark:border-white" : "text-zinc-400 border-transparent hover:text-zinc-600"
                    )}
                >
                    Cartera Morosa
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    className={cn(
                        "py-3 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all mr-2",
                        activeTab === 'payroll' ? "text-violet-600 border-violet-600 dark:text-white dark:border-white" : "text-zinc-400 border-transparent hover:text-zinc-600"
                    )}
                >
                    Nómina Operativa
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    className={cn(
                        "py-3 px-6 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all",
                        activeTab === 'import' ? "text-violet-600 border-violet-600 dark:text-white dark:border-white" : "text-zinc-400 border-transparent hover:text-zinc-600"
                    )}
                >
                    Auditoría 2026
                </button>
            </div>

            {/* --- SECTION 3: TAB SCENARIO VIEWS --- */}
            <div className="space-y-6">
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
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Detalle auditado de cartera</h2>
                                <p className="text-[10px] text-zinc-500 mt-1">
                                    El KPI principal usa el total oficial del Excel; este detalle muestra las celdas detectadas para conciliación.
                                </p>
                            </div>
                        </div>

                        {data?.sourceSummary?.totals && (
                            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total oficial</p>
                                        <p className="mt-1 font-black text-zinc-900 dark:text-white">{formatCurrency(data.sourceSummary.totals.receivable || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Celdas detectadas</p>
                                        <p className="mt-1 font-black text-amber-600">{formatCurrency(data.sourceSummary.totals.calculatedReceivable || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Por conciliar</p>
                                        <p className="mt-1 font-black text-violet-600">
                                            {formatCurrency((data.sourceSummary.totals.calculatedReceivable || 0) - (data.sourceSummary.totals.receivable || 0))}
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {data?.accountsReceivable?.length > 0 ? (
                            <div className="space-y-3">
                                {data.accountsReceivable.map((client) => {
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
                                                            {client.debts?.length} periodos adeudados
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
                                                            <div key={debt.id} className="p-3 bg-zinc-50 dark:bg-white/5 rounded-xl border border-zinc-100 dark:border-white/5 flex flex-col justify-between">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="text-[10px] font-bold text-zinc-400">
                                                                        Periodo: {new Date(debt.period).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' }).toUpperCase()}
                                                                    </span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded font-black uppercase">
                                                                        {debt.status}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm font-black text-zinc-900 dark:text-white">
                                                                    {formatCurrency(debt.amount)}
                                                                </p>
                                                                {debt.dueDate && (
                                                                    <p className="text-[9px] text-zinc-500 mt-1">
                                                                        Vence: {new Date(debt.dueDate).toLocaleDateString('es-CO')}
                                                                    </p>
                                                                )}
                                                                {debt.notes && (
                                                                    <p className="text-[9px] italic text-zinc-500 bg-white dark:bg-zinc-900/50 p-1.5 rounded border border-zinc-100 dark:border-white/5 mt-2">
                                                                        Nota: {debt.notes}
                                                                    </p>
                                                                )}
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
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Nómina Consolidada con Novedades</h2>
                                <p className="text-[10px] text-zinc-500 mt-1">
                                    Resumen de costo de personal real para el periodo, aplicando salarios base, seguridad social y ajustes extraordinarios.
                                </p>
                            </div>
                            <div className="px-3 py-1.5 bg-violet-600/10 text-violet-600 rounded-xl text-[10px] font-bold">
                                Costo Total Nómina: {formatCurrency(data?.payroll?.totalPayrollCost || 0)}
                            </div>
                        </div>

                        {data?.payroll?.collaborators?.length > 0 ? (
                            <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/5 rounded-2xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/50 text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                                                <th className="p-4">Colaborador</th>
                                                <th className="p-4">Contrato (Base)</th>
                                                <th className="p-4">Seguridad Social</th>
                                                <th className="p-4">Modificadores/Ajustes</th>
                                                <th className="p-4 text-right">Total Neto Pagado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                                            {data.payroll.collaborators.map((collab) => (
                                                <tr key={collab.collaboratorId || collab.userId || collab.contractId || collab.name} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 text-xs">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-600 font-bold text-[11px]">
                                                                {collab.name.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-zinc-900 dark:text-white">{collab.name}</p>
                                                                <p className="text-[10px] text-zinc-500">{collab.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 font-medium">{formatCurrency(collab.baseSalary)}</td>
                                                    <td className="p-4 text-zinc-500">{formatCurrency(collab.socialSecurity)}</td>
                                                    <td className="p-4">
                                                        <div className="space-y-1">
                                                            <span className={cn(
                                                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                                collab.adjustmentsTotal >= 0 ? "text-emerald-600 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
                                                            )}>
                                                                {collab.adjustmentsTotal >= 0 ? '+' : ''}{formatCurrency(collab.adjustmentsTotal)}
                                                            </span>
                                                            {collab.adjustments?.length > 0 && (
                                                                <div className="text-[9px] text-zinc-400 line-clamp-1 italic max-w-xs">
                                                                    ({collab.adjustments.map(a => `${a.type}: ${a.description || ''}`).join(', ')})
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right font-black text-zinc-900 dark:text-white">
                                                        {formatCurrency(collab.totalPaid)}
                                                    </td>
                                                </tr>
                                            ))}
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

                {activeTab === 'import' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
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
        </div>
    );
};

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
