import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search, Mail, Video, Calendar, Layout, Plus, StickyNote, Clock, ChevronDown, ListTodo, MoreHorizontal, ArrowRight, Activity, Users, Database, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourceManagementModal from './SourceManagementModal';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

// --- v2.5 Isolated & Optimized Card Component ---

const ActionCard = memo(({ item, type }) => {
    // Local state isolation to fix "Multiple Expansion Bug"
    const [isExpanded, setIsExpanded] = useState(false);

    const isBasecamp = type === 'BASECAMP';
    const isGmail = type === 'GMAIL';
    const isIntelligence = type === 'INTELLIGENCE';
    const isThreat = type === 'THREAT';

    const severityColor = item.severity === 'critical' || isThreat ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400' :
                         item.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' :
                         'bg-muted border-border text-muted-foreground';

    return (
        <motion.div
            layout
            initial={false}
            className={cn(
                "rounded-3xl border transition-all cursor-pointer group bg-card text-card-foreground overflow-hidden",
                isExpanded ? "ring-2 ring-primary/30 shadow-2xl border-primary/20 p-6" : "hover:border-primary/20 shadow-sm border-border p-5",
                isThreat && !isExpanded && "bg-red-500/5 border-red-500/20"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div className="flex items-start justify-between">
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                        {isGmail && <Mail className="w-3.5 h-3.5 text-red-500" />}
                        {isBasecamp && <Layout className="w-3.5 h-3.5 text-emerald-500" />}
                        {isThreat && <ShieldCheck className="w-3.5 h-3.5 text-red-600" />}
                        <p className={cn(
                            "text-xs font-black tracking-tight truncate",
                            isExpanded ? "text-primary" : "text-foreground",
                            isThreat && "text-red-900 dark:text-red-100"
                        )}>
                            {isGmail ? item.from : item.subject || item.title}
                        </p>
                    </div>
                    {!isExpanded && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 font-medium italic">
                            {isGmail ? item.subject : item.summary || item.content}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className={cn("text-[8px] font-black px-2 py-0.5 rounded-full uppercase border tracking-widest", severityColor)}>
                        {item.priority || item.type || 'INFO'}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-6 space-y-8"
                    >
                        {/* Executive Summary Zone */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Resumen de Inteligencia</h5>
                            </div>
                            <div className="p-5 bg-muted/20 rounded-2xl border border-border/50">
                                <p className="text-sm text-foreground leading-relaxed font-medium">
                                    {item.intent && <span className="text-primary font-black uppercase text-[10px] mr-2">[{item.intent}]</span>}
                                    {item.summary || item.content}
                                </p>
                            </div>
                        </div>

                        {/* Action Items Zone - Vertical Stacked for space */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <ListTodo className="w-4 h-4 text-emerald-500" />
                                <h5 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Action Items Checklist</h5>
                            </div>
                            <div className="space-y-3 pl-1">
                                {(item.actionItems || item.metadata?.actionItems || []).length > 0 ? (
                                    (item.actionItems || item.metadata?.actionItems).map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-4 group/item" onClick={(e) => e.stopPropagation()}>
                                            <div className="w-5 h-5 rounded-lg border-2 border-border flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 transition-all bg-background">
                                                <Check className="w-3.5 h-3.5 text-transparent group-hover/item:text-emerald-500/30" />
                                            </div>
                                            <span className="text-xs text-foreground/80 font-medium leading-relaxed mt-0.5">{step}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[10px] text-muted-foreground italic pl-2">La IA no detectó pasos accionables específicos.</p>
                                )}
                            </div>
                        </div>

                        {/* Quick Actions Box */}
                        {(item.actionLink || item.metadata?.actionLink) && (
                            <div className="pt-2">
                                <a
                                    href={item.actionLink || item.metadata?.actionLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-3 w-full py-4.5 bg-foreground text-background dark:bg-primary dark:text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-all shadow-xl shadow-foreground/10 active:scale-[0.98]"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Abrir en Plataforma <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});

const BrainCore = () => {
    const [mainTab, setMainTab] = useState('COMMAND');
    const [feed, setFeed] = useState([]);
    const [stats, setStats] = useState({ count: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clients, setClients] = useState([]);
    const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const [workspaceInsights, setWorkspaceInsights] = useState(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);
    const [clientSummary, setClientSummary] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    const fetchInitialData = useCallback(async () => {
        setIsLoadingFeed(true);
        try {
            const [feedRes, clientsRes, insightsRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/db/clients`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/brain-core/workspace/insights`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (feedRes.ok) {
                const data = await feedRes.json();
                setFeed(data.feed || []);
                setStats(data.stats || { count: 0 });
            }
            if (clientsRes.ok) setClients(await clientsRes.json());
            if (insightsRes.ok) setWorkspaceInsights(await insightsRes.json());

        } catch (error) {
            console.error("BrainCore Sync Error:", error);
        } finally {
            setIsLoadingFeed(false);
        }
    }, [baseUrl, token]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

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
            toast.error("Fallo de conexión con el Cerebro.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSaveQuickNote = async () => {
        if (!quickNote.trim()) return;
        const temp = quickNote;
        setQuickNote('');
        toast.success("Nota anclada.");
        try {
            await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: temp, clientId: selectedClientId })
            });
            fetchInitialData();
        } catch (e) { setQuickNote(temp); }
    };

    const fetchClientSummary = async (clientId) => {
        if (!clientId) return setClientSummary(null);
        setIsLoadingSummary(true);
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/client-summary/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setClientSummary(await res.json());
        } finally { setIsLoadingSummary(false); }
    };

    // --- Tab Views ---

    const CommandCenterTab = () => {
        const threats = feed.filter(i => i.type === 'AMENAZA' || i.severity === 'critical');
        const recent = feed.filter(i => i.type !== 'AMENAZA' && i.severity !== 'critical').slice(0, 6);

        return (
            <div className="max-w-5xl mx-auto w-full py-10 space-y-12">
                {/* Executive Status Banner */}
                <div className="bg-card border border-border p-6 rounded-[2.5rem] flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-emerald-500/10 rounded-2xl">
                            <Activity className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight">Estado de Operaciones</h2>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Sincronización AI: Saludable</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="text-center">
                            <span className="block text-xl font-black">{stats.count}</span>
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter">Memorias</span>
                        </div>
                        <div className="h-10 w-px bg-border" />
                        <div className="text-center">
                            <span className="block text-xl font-black text-red-500">{threats.length}</span>
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter">Riesgos</span>
                        </div>
                    </div>
                </div>

                {/* Central Search */}
                <div className="space-y-8">
                    <div className="text-center">
                        <h1 className="text-4xl font-black tracking-tight">Centro de Comando</h1>
                        <p className="text-sm text-muted-foreground font-medium uppercase tracking-[0.2em] mt-2">v2.5 Executive Control</p>
                    </div>
                    <form onSubmit={handleSearch} className="relative bg-card border-2 border-border/60 rounded-[3rem] shadow-2xl shadow-primary/5 flex items-center p-2 focus-within:border-primary/40 transition-all">
                        <div className="p-4 text-muted-foreground/40"><Search className="w-7 h-7" /></div>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Consultar riesgos operativos..."
                            className="flex-1 bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/30 px-2 py-5 text-xl font-medium"
                        />
                        <button type="submit" disabled={isSearching} className="px-10 py-5 bg-foreground text-background dark:bg-primary dark:text-white rounded-full text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all">
                            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Auditar"}
                        </button>
                    </form>
                </div>

                {/* Threat Zone - Massive and Clean */}
                <div className="space-y-6 pt-4">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-red-500" />
                        <h3 className="text-xs font-black uppercase tracking-widest">Zona de Amenazas Activas</h3>
                    </div>
                    {threats.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {threats.map(t => <ActionCard key={threat.id} item={t} type="THREAT" />)}
                        </div>
                    ) : (
                        <div className="py-24 text-center bg-muted/20 rounded-[3rem] border-2 border-dashed border-border/50">
                            <CheckCircle2 className="w-12 h-12 text-emerald-400/50 mx-auto mb-4" />
                            <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Cero Riesgos Críticos</p>
                        </div>
                    )}
                </div>

                {/* Feed Highlights */}
                <div className="space-y-6 pb-20">
                    <div className="flex items-center gap-3"><History className="w-5 h-5 text-primary/60" /><h3 className="text-xs font-black uppercase tracking-widest">Log Reciente</h3></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {recent.map(r => <ActionCard key={r.id} item={r} type="INTELLIGENCE" />)}
                    </div>
                </div>
            </div>
        );
    };

    const OperationsTab = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 h-full max-w-7xl mx-auto w-full py-10 overflow-hidden">
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-8 px-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-500/10 text-red-500 rounded-xl"><Mail className="w-5 h-5" /></div>
                        <h3 className="text-xs font-black uppercase tracking-widest">Gmail / Meet</h3>
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{workspaceInsights?.emails?.length || 0} Relevantes</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5 pb-20">
                    {workspaceInsights?.emails?.map(m => <ActionCard key={m.id} item={m} type="GMAIL" />)}
                </div>
            </div>
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-8 px-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl"><Layout className="w-5 h-5" /></div>
                        <h3 className="text-xs font-black uppercase tracking-widest">Basecamp</h3>
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{workspaceInsights?.basecampEmails?.length || 0} Activas</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5 pb-20">
                    {workspaceInsights?.basecampEmails?.map(b => <ActionCard key={b.id} item={b} type="BASECAMP" />)}
                </div>
            </div>
        </div>
    );

    const ClientsTab = () => (
        <div className="max-w-6xl mx-auto w-full py-10 space-y-10">
            <div className="flex items-center justify-between bg-card border border-border p-6 rounded-[2.5rem] shadow-sm">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-primary/10 rounded-2xl"><Users className="w-6 h-6 text-primary" /></div>
                    <div>
                        <h2 className="text-xl font-black tracking-tight">Hub de Clientes</h2>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Auditoría estratégica de cuentas</p>
                    </div>
                </div>
                <select
                    value={selectedClientId || ''}
                    onChange={(e) => {
                        const val = e.target.value || null;
                        setSelectedClientId(val);
                        fetchClientSummary(val);
                    }}
                    className="bg-muted border border-border rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-[0.1em] focus:ring-2 ring-primary/20 outline-none transition-all cursor-pointer"
                >
                    <option value="">Seleccionar Cliente...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {isLoadingSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
                    {[1,2,3].map(i => <div key={i} className="h-96 bg-card rounded-[3rem] border border-border animate-pulse" />)}
                </div>
            ) : clientSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="p-10 bg-card rounded-[3rem] border border-border shadow-sm space-y-8">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Tareas Críticas
                        </h4>
                        <div className="space-y-4">
                            {clientSummary.criticalTasks?.map((t, i) => (
                                <div key={i} className="flex items-center gap-4 p-5 bg-muted/20 rounded-2xl border border-border hover:border-red-500/20 transition-all">
                                    <Check className="w-4 h-4 text-red-500 shrink-0" />
                                    <p className="text-xs font-bold truncate">{t}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-10 bg-card rounded-[3rem] border border-border shadow-sm space-y-8">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Próximas Entregas
                        </h4>
                        <div className="space-y-4">
                            {clientSummary.highPriority?.map((p, i) => (
                                <div key={i} className="p-5 bg-muted/20 rounded-2xl border border-border hover:border-amber-500/20 transition-all">
                                    <p className="text-xs font-bold mb-1.5">{p.task}</p>
                                    <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground uppercase tracking-widest"><Calendar className="w-3.5 h-3.5 text-amber-500" /> {p.deadline}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-10 bg-card rounded-[3rem] border-2 border-primary/10 shadow-lg relative overflow-hidden space-y-8">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.03]"><Brain className="w-32 h-32 text-primary" /></div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">IA Executive Insight</h4>
                        <div className="space-y-8 relative z-10">
                            <div className="p-6 bg-primary/5 rounded-[2rem] border border-primary/10 text-xs font-medium leading-relaxed italic text-foreground/90">"{clientSummary.aiInsight}"</div>
                            <div className="space-y-4">
                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block px-1">Alertas de Contexto</span>
                                {clientSummary.blockers?.map((b, i) => (
                                    <div key={i} className="flex items-start gap-3 p-4 bg-red-500/5 rounded-2xl text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/10">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-40 text-center bg-card rounded-[4rem] border-2 border-dashed border-border">
                    <Database className="w-20 h-20 text-muted-foreground/10 mx-auto mb-8" />
                    <h2 className="text-2xl font-black text-muted-foreground mb-3">Audit Hub</h2>
                    <p className="text-sm text-muted-foreground/50 max-w-sm mx-auto font-medium">Selecciona una cuenta para visualizar la salud operativa y las métricas estratégicas consolidadas por la IA.</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-background transition-colors overflow-hidden font-sans text-foreground">
            <SourceManagementModal isOpen={isManageSourcesOpen} onClose={() => setIsManageSourcesOpen(false)} onRefresh={fetchInitialData} />

            {/* --- Unified v2.5 Header --- */}
            <div className="h-18 border-b border-border bg-card/60 backdrop-blur-xl flex items-center justify-between px-10 shrink-0 z-50">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-4 bg-foreground text-background dark:bg-muted dark:text-foreground px-5 py-2.5 rounded-[1.25rem] shadow-xl shadow-foreground/5">
                        <Brain className="w-6 h-6 text-primary" />
                        <span className="text-xs font-black uppercase tracking-[0.25em]">Brain Core v2.5</span>
                    </div>
                    <nav className="flex items-center gap-1.5 bg-muted/40 p-1.5 rounded-[1.5rem] border border-border/50">
                        {[
                            { id: 'COMMAND', icon: Activity, label: 'Comando' },
                            { id: 'OPERATIONS', icon: RefreshCw, label: 'Operaciones' },
                            { id: 'CLIENTS', icon: Users, label: 'Clientes' }
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setMainTab(tab.id)} className={cn(
                                "flex items-center gap-2.5 px-6 py-3 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300",
                                mainTab === tab.id ? "bg-card text-primary shadow-lg ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}>
                                <tab.icon className="w-4 h-4" /> {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/10">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Sincronizado</span>
                    </div>
                    <button onClick={() => setIsManageSourcesOpen(true)} className="p-3 hover:bg-muted rounded-2xl transition-all group">
                        <Settings2 className="w-5 h-5 group-hover:text-primary transition-colors" />
                    </button>
                    <div className="w-11 h-11 rounded-[1rem] bg-muted border border-border flex items-center justify-center cursor-pointer hover:ring-4 ring-primary/10 transition-all overflow-hidden shadow-inner">
                        <User className="w-6 h-6 text-muted-foreground" />
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 overflow-y-auto custom-scrollbar px-10 relative bg-background/50">
                    <AnimatePresence mode="wait">
                        <motion.div key={mainTab} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3 }} className="h-full">
                            {mainTab === 'COMMAND' && <CommandCenterTab />}
                            {mainTab === 'OPERATIONS' && <OperationsTab />}
                            {mainTab === 'CLIENTS' && <ClientsTab />}
                        </motion.div>
                    </AnimatePresence>

                    {/* Floating Search Result Overlay */}
                    <AnimatePresence>
                        {(searchResult && mainTab === 'COMMAND') && (
                            <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed bottom-12 left-1/2 -translate-x-1/2 w-full max-w-3xl bg-card/80 backdrop-blur-3xl border-2 border-primary/20 p-10 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.15)] z-[60]">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="flex items-center gap-3 text-primary font-black uppercase text-xs tracking-[0.2em]"><Sparkles className="w-5 h-5" /> Respuesta del Cerebro</div>
                                    <button onClick={() => setSearchResult(null)} className="p-2 hover:bg-muted rounded-xl transition-colors"><X className="w-5 h-5" /></button>
                                </div>
                                <p className="text-lg text-foreground leading-relaxed font-medium italic opacity-90">"{searchResult.content}"</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* --- Action Sidebar --- */}
                <aside className="w-100 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto custom-scrollbar shadow-2xl shadow-foreground/[0.02]">
                    <div className="p-10 border-b border-border space-y-8">
                        <div className="flex items-center gap-3"><div className="p-2.5 bg-primary/10 text-primary rounded-xl"><StickyNote className="w-5 h-5" /></div><h3 className="text-[10px] font-black uppercase tracking-widest">Anclar Insight</h3></div>
                        <div className="bg-muted/40 rounded-[2rem] border-2 border-border/50 p-6 focus-within:border-primary/30 transition-all">
                            <textarea value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="¿Qué aprendimos hoy?" className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-40 placeholder:text-muted-foreground/30 font-medium leading-relaxed" />
                            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/30">
                                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">{quickNote.length} Chars</span>
                                <button onClick={handleSaveQuickNote} disabled={!quickNote.trim()} className="p-3.5 bg-foreground text-background dark:bg-primary dark:text-white rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-20"><Plus className="w-5 h-5" /></button>
                            </div>
                        </div>
                    </div>

                    <div className="p-10 flex-1 space-y-10">
                        <div className="flex items-center gap-3"><Clock className="w-5 h-5 text-primary/40" /><h3 className="text-[10px] font-black uppercase tracking-widest">Actividad Reciente</h3></div>
                        <div className="space-y-8">
                            {(workspaceInsights?.basecampEmails || []).slice(0, 4).map(task => (
                                <div key={task.id} className="relative pl-8 border-l-2 border-border hover:border-primary transition-all group cursor-pointer" onClick={() => { setMainTab('OPERATIONS'); }}>
                                    <div className="absolute left-[-6px] top-0 w-2.5 h-2.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
                                    <p className="text-[10px] font-black uppercase text-primary/60 mb-2 tracking-tighter">{task.intent || 'Operación'}</p>
                                    <p className="text-xs font-black text-foreground line-clamp-1 group-hover:text-primary transition-colors">{task.subject}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-10 bg-muted/10 border-t border-border mt-auto">
                        <button onClick={() => { toast.success("Refrescando sistema..."); fetchInitialData(); }} className="w-full py-6 bg-card border-2 border-border text-foreground rounded-[2.5rem] text-[10px] font-black uppercase tracking-[0.25em] shadow-lg hover:border-primary/30 transition-all flex items-center justify-center gap-3 group">
                            <RefreshCw className="w-5 h-5 text-primary group-hover:rotate-180 transition-transform duration-1000" /> Auditar Sincronización
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default BrainCore;
