import React, { useState, useEffect, useRef, memo } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search, Mail, Video, Calendar, Layout, Plus, StickyNote, Clock, ChevronDown, ListTodo, MoreHorizontal, ArrowRight, Activity, Users, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import SourceManagementModal from './SourceManagementModal';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

// --- Sub-Components for State Isolation ---

const ActionCard = memo(({ item, type }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const isBasecamp = type === 'BASECAMP';
    const isGmail = type === 'GMAIL';
    const isIntelligence = type === 'INTELLIGENCE';

    const severityColor = item.severity === 'critical' ? 'bg-red-50 border-red-100 text-red-600' :
                         item.severity === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                         'bg-zinc-100 border-zinc-200 text-zinc-500';

    return (
        <motion.div
            layout
            className={cn(
                "p-5 rounded-3xl border transition-all cursor-pointer group bg-card text-card-foreground",
                isExpanded ? "ring-2 ring-primary/20 shadow-lg" : "hover:border-primary/20 shadow-sm border-border"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            {/* Header Content */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {isGmail && <Mail className="w-3 h-3 text-red-400" />}
                        {isBasecamp && <Layout className="w-3 h-3 text-emerald-400" />}
                        <p className={cn("text-xs font-bold truncate", isExpanded ? "text-primary" : "text-foreground")}>
                            {isGmail ? item.from : item.subject || item.title}
                        </p>
                    </div>
                    {!isExpanded && <p className="text-[10px] text-muted-foreground line-clamp-1 font-medium">{isGmail ? item.subject : item.summary || item.content}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase", severityColor)}>
                        {item.priority || item.type || 'INFO'}
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </div>
            </div>

            {/* Expansion Content (Vertical Stacked to avoid choking) */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 pt-4 border-t border-border flex flex-col gap-6"
                    >
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Resumen Ejecutivo</span>
                                </div>
                                <p className="text-sm text-foreground leading-relaxed font-medium">
                                    {item.intent || item.metadata?.intent ? <span className="text-primary font-bold">[{item.intent || item.metadata?.intent}] </span> : null}
                                    {item.summary || item.content}
                                </p>
                            </div>

                            {/* Action Items - Full width, vertical list */}
                            <div className="bg-accent/30 rounded-2xl p-5 border border-border">
                                <div className="flex items-center gap-2 mb-4">
                                    <ListTodo className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Action Items Checklist</span>
                                </div>
                                <div className="space-y-3">
                                    {(item.actionItems || item.metadata?.actionItems || []).length > 0 ? (item.actionItems || item.metadata?.actionItems).map((step, idx) => (
                                        <div key={idx} className="flex items-center gap-3">
                                            <div className="w-4.5 h-4.5 rounded-md border border-input flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 transition-colors">
                                                <Check className="w-3 h-3 text-transparent hover:text-emerald-500" />
                                            </div>
                                            <span className="text-xs text-foreground/80 font-medium">{step}</span>
                                        </div>
                                    )) : <p className="text-[10px] text-muted-foreground italic">No se detectaron pasos accionables.</p>}
                                </div>
                            </div>

                            {/* Action Links */}
                            {(item.actionLink || item.metadata?.actionLink) && (
                                <div className="pt-2">
                                    <a
                                        href={item.actionLink || item.metadata?.actionLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-center gap-2 w-full py-4 bg-foreground text-background rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] hover:opacity-90 transition-all shadow-md shadow-foreground/5"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Ejecutar en Plataforma <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});

const BrainCore = () => {
    // --- State Management ---
    const [mainTab, setMainTab] = useState('COMMAND'); // COMMAND, OPERATIONS, CLIENTS
    const [input, setInput] = useState('');
    const [feed, setFeed] = useState([]);
    const [stats, setStats] = useState({ count: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clients, setClients] = useState([]);
    const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const [workspaceInsights, setWorkspaceInsights] = useState(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);
    const [integrations, setIntegrations] = useState([]);
    const [clientSummary, setClientSummary] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    // --- Data Fetching ---
    const fetchInsights = async () => {
        setIsLoadingInsights(true);
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/workspace/insights`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setWorkspaceInsights(await res.json());
        } catch (e) { console.error(e); }
        finally { setIsLoadingInsights(false); }
    };

    const fetchClientSummary = async (clientId) => {
        if (!clientId) {
            setClientSummary(null);
            return;
        }
        setIsLoadingSummary(true);
        setClientSummary(null);
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/client-summary/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setClientSummary(await res.json());
        } catch (e) { console.error(e); }
        finally { setIsLoadingSummary(false); }
    };

    const fetchInitialData = async () => {
        setIsLoadingFeed(true);
        try {
            const [feedRes, clientsRes, integrationsRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/db/clients`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/integrations/integrations`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (feedRes.ok) {
                const data = await feedRes.json();
                setFeed(data.feed || []);
                setStats(data.stats || { count: 0 });
            }
            if (clientsRes.ok) setClients(await clientsRes.json());
            if (integrationsRes.ok) setIntegrations(await integrationsRes.json());

            fetchInsights();
        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setIsLoadingFeed(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    // --- Handlers ---
    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim() || isSearching) return;
        setIsSearching(true);
        try {
            const clientParam = selectedClientId ? `&clientId=${selectedClientId}` : '';
            const res = await fetch(`${baseUrl}/api/brain-core/ask?q=${encodeURIComponent(searchQuery)}${clientParam}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setSearchResult(await res.json());
        } catch (e) {
            toast.error("Error consultando al cerebro.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSaveQuickNote = async () => {
        if (!quickNote.trim() || isProcessing) return;
        const tempNote = quickNote;
        setQuickNote('');
        toast.success("Anclando nota...");
        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: tempNote, clientId: selectedClientId })
            });
            if (response.ok) fetchInitialData();
            else setQuickNote(tempNote);
        } catch (error) { setQuickNote(tempNote); }
    };

    // --- Layout Views ---

    const CommandCenterView = () => {
        const threats = feed.filter(item => item.type === 'AMENAZA' || item.severity === 'critical');

        return (
            <div className="flex flex-col gap-12 max-w-5xl mx-auto w-full py-8">
                {/* Search Area */}
                <div className="space-y-10">
                    <div className="text-center">
                        <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Centro de Comando</h1>
                        <p className="text-sm text-muted-foreground font-medium">Motor de inteligencia predictiva activado.</p>
                    </div>

                    <form onSubmit={handleSearch} className="relative bg-card border border-border rounded-[2.5rem] shadow-xl shadow-foreground/5 flex items-center p-2 focus-within:ring-4 ring-primary/10 transition-all">
                        <div className="p-4 text-muted-foreground/50">
                            <Search className="w-6 h-6" />
                        </div>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="¿Qué riesgos detectas en la operación de hoy?"
                            className="flex-1 bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/40 px-2 py-4 text-lg font-medium"
                        />
                        <button
                            type="submit"
                            disabled={!searchQuery.trim() || isSearching}
                            className="px-8 py-4 bg-foreground text-background rounded-full text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-30 flex items-center gap-2"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Consultar IA"}
                        </button>
                    </form>
                </div>

                {/* Threat Zone */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-red-900/80">Alertas Críticas y Amenazas</h3>
                    </div>

                    {threats.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {threats.map(threat => (
                                <ActionCard key={threat.id} item={threat} type="INTELLIGENCE" />
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 text-center bg-card/50 rounded-[2.5rem] border border-dashed border-border">
                            <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-4" />
                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Sin amenazas críticas detectadas</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Todo fluye según los lineamientos operativos.</p>
                        </div>
                    )}
                </div>

                {/* Intelligence Feed Highlights */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                            <History className="w-5 h-5" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Flujo de Inteligencia Reciente</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {feed.filter(i => i.type !== 'AMENAZA' && i.severity !== 'critical').slice(0, 6).map(item => (
                            <ActionCard key={item.id} item={item} type="INTELLIGENCE" />
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const OperationsFlowView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full max-w-7xl mx-auto w-full py-8 overflow-hidden">
            {/* Gmail Column */}
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-6 px-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                            <Mail className="w-5 h-5" />
                        </div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Bandeja Gmail / Meet</h3>
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{workspaceInsights?.emails?.length || 0} Relevantes</div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                    {workspaceInsights?.emails?.map(mail => (
                        <ActionCard key={mail.id} item={mail} type="GMAIL" />
                    ))}
                    {!isLoadingInsights && (workspaceInsights?.emails || []).length === 0 && (
                        <p className="text-xs text-muted-foreground font-medium italic py-20 text-center">Bandeja limpia de ruido operativo.</p>
                    )}
                </div>
            </div>

            {/* Basecamp Column */}
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-6 px-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                            <Layout className="w-5 h-5" />
                        </div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Gestión Basecamp</h3>
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{workspaceInsights?.basecampEmails?.length || 0} Activas</div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                    {workspaceInsights?.basecampEmails?.map(task => (
                        <ActionCard key={task.id} item={task} type="BASECAMP" />
                    ))}
                    {!isLoadingInsights && (workspaceInsights?.basecampEmails || []).length === 0 && (
                        <p className="text-xs text-muted-foreground font-medium italic py-20 text-center">Sin tareas de Basecamp pendientes.</p>
                    )}
                </div>
            </div>
        </div>
    );

    const ClientHubView = () => (
        <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full py-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Hub de Clientes</h1>
                        <p className="text-xs text-muted-foreground font-medium">Auditoría estratégica y salud de cuentas.</p>
                    </div>
                </div>
                <select
                    value={selectedClientId || ''}
                    onChange={(e) => {
                        const val = e.target.value || null;
                        setSelectedClientId(val);
                        fetchClientSummary(val);
                    }}
                    className="bg-card border border-border rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest focus:ring-2 ring-primary/20 outline-none transition-all"
                >
                    <option value="">Seleccionar Cliente...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {isLoadingSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    {[1,2,3].map(i => <div key={i} className="h-80 bg-card rounded-[2.5rem] border border-border animate-pulse" />)}
                </div>
            ) : clientSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Tareas Críticas */}
                    <div className="p-8 bg-card rounded-[2.5rem] border border-border shadow-sm group">
                        <div className="flex items-center justify-between mb-8">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Tareas Críticas
                            </h4>
                        </div>
                        <div className="space-y-3">
                            {clientSummary.criticalTasks?.length > 0 ? clientSummary.criticalTasks.map((t, i) => (
                                <div key={i} className="flex items-center gap-3 p-4 bg-accent/20 rounded-2xl border border-border hover:border-red-200 transition-colors">
                                    <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                    <p className="text-xs font-bold truncate">{t}</p>
                                </div>
                            )) : <p className="text-xs text-muted-foreground italic py-10 text-center">Sin tareas críticas.</p>}
                        </div>
                    </div>

                    {/* Próximas Entregas */}
                    <div className="p-8 bg-card rounded-[2.5rem] border border-border shadow-sm group">
                        <div className="flex items-center justify-between mb-8">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500" /> Próximas Entregas
                            </h4>
                        </div>
                        <div className="space-y-4">
                            {clientSummary.highPriority?.length > 0 ? clientSummary.highPriority.map((p, i) => (
                                <div key={i} className="p-4 bg-accent/20 rounded-2xl border border-border hover:border-amber-200 transition-colors">
                                    <p className="text-xs font-bold mb-1">{p.task}</p>
                                    <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground uppercase tracking-tighter">
                                        <Calendar className="w-3 h-3 text-amber-500" /> {p.deadline}
                                    </div>
                                </div>
                            )) : <p className="text-xs text-muted-foreground italic py-10 text-center">Sin entregas inmediatas.</p>}
                        </div>
                    </div>

                    {/* IA Insights */}
                    <div className="p-8 bg-card rounded-[2.5rem] border-2 border-primary/10 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                            <Brain className="w-20 h-20 text-primary" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground flex items-center gap-2 mb-8">
                            IA Executive Insight
                        </h4>
                        <div className="space-y-6">
                            <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 text-xs font-medium leading-relaxed italic">
                                "{clientSummary.aiInsight}"
                            </div>
                            <div className="space-y-3">
                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Alertas de Contexto</span>
                                {clientSummary.blockers?.map((b, i) => (
                                    <div key={i} className="flex items-start gap-2 p-3 bg-red-50/50 rounded-xl text-[10px] font-medium text-red-700">
                                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                        {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-32 text-center bg-card rounded-[3rem] border-2 border-dashed border-border">
                    <Database className="w-16 h-16 text-muted-foreground/20 mx-auto mb-6" />
                    <h2 className="text-xl font-black text-muted-foreground mb-2">Selecciona un cliente para auditar</h2>
                    <p className="text-sm text-muted-foreground/60 max-w-sm mx-auto">Visualiza de forma consolidada la salud operativa y los insights de cada cuenta.</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-background transition-colors overflow-hidden font-sans">
            <SourceManagementModal
                isOpen={isManageSourcesOpen}
                onClose={() => setIsManageSourcesOpen(false)}
                onRefresh={fetchInitialData}
            />

            {/* --- Optimized Header --- */}
            <div className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-50">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 bg-foreground text-background px-4 py-2 rounded-2xl shadow-lg shadow-foreground/10">
                        <Brain className="w-5 h-5 text-primary" />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">Brain Core v2.5</span>
                    </div>

                    <nav className="flex items-center gap-1 bg-accent/30 p-1 rounded-2xl border border-border">
                        {[
                            { id: 'COMMAND', icon: Activity, label: 'Centro de Comando' },
                            { id: 'OPERATIONS', icon: RefreshCw, label: 'Operaciones' },
                            { id: 'CLIENTS', icon: Users, label: 'Hub de Clientes' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setMainTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    mainTab === tab.id
                                        ? "bg-card text-primary shadow-sm ring-1 ring-border"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 text-muted-foreground/60">
                         <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">MEMORIA: {stats.count}</span>
                        </div>
                        <button onClick={() => setIsManageSourcesOpen(true)} className="p-2 hover:bg-accent rounded-xl transition-all group">
                            <Settings2 className="w-4 h-4 group-hover:text-primary transition-colors" />
                        </button>
                    </div>
                    <div className="h-8 w-px bg-border mx-2" />
                    <div className="w-10 h-10 rounded-full bg-accent border border-border flex items-center justify-center cursor-pointer hover:ring-2 ring-primary/20 transition-all">
                        <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* --- Left Content Area (Tabs Dynamic Content) --- */}
                <main className="flex-1 overflow-y-auto custom-scrollbar px-10 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={mainTab}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            {mainTab === 'COMMAND' && <CommandCenterView />}
                            {mainTab === 'OPERATIONS' && <OperationsFlowView />}
                            {mainTab === 'CLIENTS' && <ClientHubView />}
                        </motion.div>
                    </AnimatePresence>

                    {/* Search Result Overlay for COMMAND tab */}
                    <AnimatePresence>
                        {(searchResult && mainTab === 'COMMAND') && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="fixed bottom-32 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border-2 border-primary/20 p-8 rounded-[2.5rem] shadow-2xl z-[60]"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest">
                                        <Sparkles className="w-4 h-4" /> Respuesta IA
                                    </div>
                                    <button onClick={() => setSearchResult(null)} className="p-1.5 hover:bg-accent rounded-lg">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-base text-foreground leading-relaxed font-medium italic italic-color">
                                    "{searchResult.content}"
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* --- Right Dynamic Sidebar --- */}
                <aside className="w-96 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
                    {/* Quick Notes Area */}
                    <div className="p-8 border-b border-border">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                <StickyNote className="w-4 h-4" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest">Nota Rápida al Cerebro</h3>
                        </div>
                        <div className="bg-accent/40 rounded-2xl border border-border p-5 focus-within:ring-2 ring-primary/20 transition-all">
                            <textarea
                                value={quickNote}
                                onChange={(e) => setQuickNote(e.target.value)}
                                placeholder="Capturar insight ahora..."
                                className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-32 placeholder:text-muted-foreground/40 font-medium"
                            />
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                                <span className="text-[8px] font-black text-muted-foreground uppercase">{quickNote.length} CHARS</span>
                                <button
                                    onClick={handleSaveQuickNote}
                                    disabled={!quickNote.trim()}
                                    className="p-2.5 bg-foreground text-background rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Active Activity Stream (Refined) */}
                    <div className="p-8 flex-1">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Clock className="w-4 h-4 text-primary/60" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest">Actividad Kanban</h3>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {(workspaceInsights?.basecampEmails || []).slice(0, 4).map(task => (
                                <div key={task.id} className="relative pl-6 border-l-2 border-border group hover:border-primary transition-all">
                                    <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-border group-hover:bg-primary transition-colors" />
                                    <p className="text-[11px] font-black uppercase text-primary/60 mb-1 tracking-tighter">{task.intent || 'Operación'}</p>
                                    <p className="text-xs font-bold text-foreground line-clamp-1">{task.subject}</p>
                                </div>
                            ))}
                            {!isLoadingInsights && (workspaceInsights?.basecampEmails || []).length === 0 && (
                                <p className="text-xs text-muted-foreground font-medium italic">Sin actividad operativa reciente.</p>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-8 bg-accent/10 border-t border-border mt-auto">
                        <button
                            onClick={() => {
                                toast.success("Refrescando flujo de datos...");
                                fetchInitialData();
                            }}
                            className="w-full py-5 bg-card border border-border text-foreground rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-sm hover:shadow-md hover:border-primary/20 transition-all flex items-center justify-center gap-3 group"
                        >
                            <RefreshCw className="w-4 h-4 text-primary group-hover:rotate-180 transition-transform duration-1000" />
                            Auditar Sincronización
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default BrainCore;
