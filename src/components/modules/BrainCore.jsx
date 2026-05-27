import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search, Mail, Video, Calendar, Layout, Plus, StickyNote, Clock, ChevronDown, ListTodo, MoreHorizontal, ArrowRight, Activity, Users, Database, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourceManagementModal from './SourceManagementModal';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// --- v2.5 Isolated & Optimized Card Component ---

const ActionCard = memo(({ item, type }) => {
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
                "rounded-2xl border transition-all cursor-pointer group bg-card text-card-foreground overflow-hidden",
                isExpanded ? "ring-1 ring-primary/30 shadow-xl border-primary/20 p-5" : "hover:border-primary/20 shadow-sm border-border p-4",
                isThreat && !isExpanded && "bg-red-500/5 border-red-500/20"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div className="flex items-start justify-between">
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        {isGmail && <Mail className="w-3 h-3 text-red-500" />}
                        {isBasecamp && <Layout className="w-3 h-3 text-emerald-500" />}
                        {isThreat && <ShieldCheck className="w-3 h-3 text-red-600" />}
                        <p className={cn(
                            "text-[11px] font-bold tracking-tight truncate",
                            isExpanded ? "text-primary" : "text-foreground",
                            isThreat && "text-red-900 dark:text-red-100"
                        )}>
                            {isGmail ? item.from : item.subject || item.title}
                        </p>
                    </div>
                    {!isExpanded && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 font-medium">
                            {isGmail ? item.subject : item.summary || item.content}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={cn("text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase border tracking-widest", severityColor)}>
                        {item.priority || item.type || 'INFO'}
                    </span>
                    <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-6"
                    >
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3 h-3 text-primary" />
                                <h5 className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Resumen</h5>
                            </div>
                            <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
                                <p className="text-xs text-foreground leading-relaxed font-medium">
                                    {item.intent && <span className="text-primary font-black uppercase text-[9px] mr-2">[{item.intent}]</span>}
                                    {item.summary || item.content}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <ListTodo className="w-3 h-3 text-emerald-500" />
                                <h5 className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">Checklist</h5>
                            </div>
                            <div className="space-y-2.5 pl-1">
                                {(item.actionItems || item.metadata?.actionItems || []).length > 0 ? (
                                    (item.actionItems || item.metadata?.actionItems).map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-3 group/item" onClick={(e) => e.stopPropagation()}>
                                            <div className="w-4 h-4 rounded border border-border flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 transition-all bg-background">
                                                <Check className="w-3 h-3 text-transparent group-hover/item:text-emerald-500/30" />
                                            </div>
                                            <span className="text-xs text-foreground/80 font-medium leading-tight mt-0.5">{step}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-[9px] text-muted-foreground italic pl-1">Sin pasos accionables.</p>
                                )}
                            </div>
                        </div>

                        {(item.actionLink || item.metadata?.actionLink) && (
                            <div className="pt-1">
                                <a
                                    href={item.actionLink || item.metadata?.actionLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 bg-foreground text-background dark:bg-primary dark:text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] hover:opacity-90 transition-all active:scale-[0.98]"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Abrir Plataforma <ExternalLink className="w-3 h-3" />
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
    const [workspaceInsights, setWorkspaceInsights] = useState(null);
    const [clientSummary, setClientSummary] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

    // Quick Note Modal State
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

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
            toast.error("Error Cerebro.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSaveQuickNote = async () => {
        if (!quickNote.trim() || isSavingNote) return;
        setIsSavingNote(true);
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: quickNote, clientId: selectedClientId })
            });
            if (res.ok) {
                toast.success("Nota anclada.");
                setQuickNote('');
                setIsNoteModalOpen(false);
                fetchInitialData();
            }
        } finally {
            setIsSavingNote(false);
        }
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
        const threats = useMemo(() => feed.filter(i => i.type === 'AMENAZA' || i.severity === 'critical'), [feed]);
        const recent = useMemo(() => feed.filter(i => i.type !== 'AMENAZA' && i.severity !== 'critical').slice(0, 6), [feed]);

        return (
            <div className="max-w-4xl mx-auto w-full py-6 space-y-8">
                {/* Search Area */}
                <div className="space-y-6">
                    <div className="text-center">
                        <h1 className="text-2xl font-black tracking-tight text-foreground">Comando</h1>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Motor Predictivo Activo</p>
                    </div>
                    <form onSubmit={handleSearch} className="relative bg-card border border-border rounded-full shadow-lg flex items-center p-1.5 focus-within:ring-2 ring-primary/10 transition-all max-w-2xl mx-auto">
                        <div className="p-3 text-muted-foreground/40"><Search className="w-5 h-5" /></div>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Consultar riesgos..."
                            className="flex-1 bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/30 px-2 py-3 text-sm font-medium"
                        />
                        <button type="submit" disabled={isSearching} className="px-6 py-3 bg-foreground text-background dark:bg-primary dark:text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Auditar"}
                        </button>
                    </form>
                </div>

                {/* Threat Zone */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <ShieldCheck className="w-4 h-4 text-red-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/80">Amenazas Operativas</h3>
                    </div>
                    {threats.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {threats.map(t => <ActionCard key={t.id} item={t} type="THREAT" />)}
                        </div>
                    ) : (
                        <div className="py-12 text-center bg-muted/20 rounded-3xl border-2 border-dashed border-border/50">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400/50 mx-auto mb-3" />
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sin riesgos detectados</p>
                        </div>
                    )}
                </div>

                {/* Recent Intelligence */}
                <div className="space-y-4 pb-20">
                    <div className="flex items-center gap-2 px-1">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/80">Log de Inteligencia</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {recent.map(r => <ActionCard key={r.id} item={r} type="INTELLIGENCE" />)}
                    </div>
                </div>
            </div>
        );
    };

    const OperationsTab = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full max-w-6xl mx-auto w-full py-6 overflow-hidden">
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-red-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Gmail / Meet</h3>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{workspaceInsights?.emails?.length || 0}</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 pb-20">
                    {workspaceInsights?.emails?.map(m => <ActionCard key={m.id} item={m} type="GMAIL" />)}
                </div>
            </div>
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                        <Layout className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest">Basecamp</h3>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{workspaceInsights?.basecampEmails?.length || 0}</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 pb-20">
                    {workspaceInsights?.basecampEmails?.map(b => <ActionCard key={b.id} item={b} type="BASECAMP" />)}
                </div>
            </div>
        </div>
    );

    const ClientsTab = () => (
        <div className="max-w-5xl mx-auto w-full py-6 space-y-8">
            <div className="flex items-center justify-between bg-card border border-border p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl"><Users className="w-5 h-5 text-primary" /></div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight">Hub de Clientes</h2>
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Salud Operativa</p>
                    </div>
                </div>
                <select
                    value={selectedClientId || ''}
                    onChange={(e) => {
                        const val = e.target.value || null;
                        setSelectedClientId(val);
                        fetchClientSummary(val);
                    }}
                    className="bg-muted border border-border rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-1 ring-primary/20 outline-none cursor-pointer"
                >
                    <option value="">Seleccionar Cliente</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {isLoadingSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    {[1,2,3].map(i => <div key={i} className="h-64 bg-card rounded-3xl border border-border animate-pulse" />)}
                </div>
            ) : clientSummary ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-card rounded-[2rem] border border-border shadow-sm space-y-6">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Tareas Críticas
                        </h4>
                        <div className="space-y-2.5">
                            {clientSummary.criticalTasks?.map((t, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border text-[11px] font-bold truncate">
                                    <Check className="w-3.5 h-3.5 text-red-500 shrink-0" /> {t}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 bg-card rounded-[2rem] border border-border shadow-sm space-y-6">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500" /> Próximas Entregas
                        </h4>
                        <div className="space-y-3">
                            {clientSummary.highPriority?.map((p, i) => (
                                <div key={i} className="p-4 bg-muted/20 rounded-xl border border-border">
                                    <p className="text-[11px] font-bold mb-1">{p.task}</p>
                                    <div className="flex items-center gap-2 text-[8px] font-black text-muted-foreground uppercase tracking-widest"><Calendar className="w-3 h-3 text-amber-500" /> {p.deadline}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-6 bg-card rounded-[2rem] border border-border relative overflow-hidden space-y-6">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-foreground">Executive Insight</h4>
                        <div className="space-y-5">
                            <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-[11px] font-medium leading-relaxed italic text-foreground/90">"{clientSummary.aiInsight}"</div>
                            <div className="space-y-2">
                                <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest block px-1">Alertas</span>
                                {clientSummary.blockers?.map((b, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 bg-red-500/5 rounded-lg text-[9px] font-bold text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> {b}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-24 text-center bg-card rounded-[3rem] border-2 border-dashed border-border">
                    <Database className="w-12 h-12 text-muted-foreground/10 mx-auto mb-4" />
                    <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">Audit Hub</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-background transition-colors overflow-hidden font-sans text-foreground">
            <SourceManagementModal isOpen={isManageSourcesOpen} onClose={() => setIsManageSourcesOpen(false)} onRefresh={fetchInitialData} />

            {/* --- Minimal Header --- */}
            <div className="h-14 border-b border-border bg-card/60 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 z-50">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2 text-foreground/80">
                        <Brain className="w-5 h-5 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Brain Core</span>
                    </div>
                    <nav className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50">
                        {[
                            { id: 'COMMAND', icon: Activity, label: 'Comando' },
                            { id: 'OPERATIONS', icon: RefreshCw, label: 'Operaciones' },
                            { id: 'CLIENTS', icon: Users, label: 'Hub' }
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setMainTab(tab.id)} className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                mainTab === tab.id ? "bg-card text-primary shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}>
                                <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Sincronizado</span>
                    </div>
                    <button onClick={() => setIsManageSourcesOpen(true)} className="p-2 hover:bg-muted rounded-lg transition-all group">
                        <Settings2 className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary" />
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* --- Left Content --- */}
                <main className="flex-1 overflow-y-auto custom-scrollbar px-8 relative bg-background/50">
                    <AnimatePresence mode="wait">
                        <motion.div key={mainTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="h-full">
                            {mainTab === 'COMMAND' && <CommandCenterTab />}
                            {mainTab === 'OPERATIONS' && <OperationsTab />}
                            {mainTab === 'CLIENTS' && <ClientsTab />}
                        </motion.div>
                    </AnimatePresence>

                    {searchResult && mainTab === 'COMMAND' && (
                        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border-2 border-primary/20 p-6 rounded-3xl shadow-2xl z-[60]">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2 text-primary font-black uppercase text-[9px] tracking-widest"><Sparkles className="w-4 h-4" /> Respuesta IA</div>
                                <button onClick={() => setSearchResult(null)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed font-medium italic opacity-90">"{searchResult.content}"</p>
                        </div>
                    )}
                </main>

                {/* --- Clean Sidebar (No Notes/Kanban) --- */}
                <aside className="w-80 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
                    <div className="p-6 border-b border-border">
                        <h3 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Reciente</h3>
                    </div>
                    <div className="flex-1 p-6 space-y-6">
                        {(workspaceInsights?.basecampEmails || []).slice(0, 5).map(task => (
                            <div key={task.id} className="relative pl-6 border-l border-border hover:border-primary transition-all group cursor-pointer" onClick={() => setMainTab('OPERATIONS')}>
                                <p className="text-[8px] font-black uppercase text-primary/60 mb-1 tracking-tight">{task.intent || 'Operación'}</p>
                                <p className="text-[10px] font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{task.subject}</p>
                            </div>
                        ))}
                    </div>
                    <div className="p-6 bg-muted/10 border-t border-border">
                        <button onClick={() => { toast.success("Refrescando..."); fetchInitialData(); }} className="w-full py-4 bg-card border border-border text-foreground rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:border-primary/30 transition-all flex items-center justify-center gap-2 group">
                            <RefreshCw className="w-4 h-4 text-primary group-hover:rotate-180 transition-transform duration-1000" /> Auditar
                        </button>
                    </div>
                </aside>

                {/* --- Quick Note FAB --- */}
                <button
                    onClick={() => setIsNoteModalOpen(true)}
                    className="fixed bottom-8 right-88 z-[100] w-12 h-12 bg-primary text-white rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
                    title="Nueva Nota Rápida"
                >
                    <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                </button>
            </div>

            {/* --- Quick Note Modal --- */}
            <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
                <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                    <DialogHeader className="p-6 bg-primary text-white">
                        <div className="flex items-center gap-3">
                            <StickyNote className="w-5 h-5" />
                            <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">Anclar Insight al Cerebro</DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="p-6 space-y-6 bg-card">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Contexto de Cliente (Opcional)</label>
                            <select
                                value={selectedClientId || ''}
                                onChange={(e) => setSelectedClientId(e.target.value || null)}
                                className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest focus:ring-1 ring-primary/20 outline-none"
                            >
                                <option value="">Global / Agencia</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Contenido de la Memoria</label>
                            <textarea
                                value={quickNote}
                                onChange={(e) => setQuickNote(e.target.value)}
                                placeholder="Escribe algo importante..."
                                className="w-full bg-muted border border-border rounded-2xl p-4 text-sm font-medium min-h-[160px] resize-none focus:ring-1 ring-primary/20 outline-none placeholder:text-muted-foreground/30"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-muted/30 border-t border-border flex items-center justify-between gap-4">
                        <span className="text-[8px] font-black text-muted-foreground uppercase">{quickNote.length} Caracteres</span>
                        <div className="flex gap-2">
                            <button onClick={() => setIsNoteModalOpen(false)} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all">Cancelar</button>
                            <button
                                onClick={handleSaveQuickNote}
                                disabled={!quickNote.trim() || isSavingNote}
                                className="px-8 py-2.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-30"
                            >
                                {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Memoria"}
                            </button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default BrainCore;
