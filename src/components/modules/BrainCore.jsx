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

// --- Simple Global Cache ---
const dataCache = {
    feed: null,
    stats: null,
    clients: null
};

const BrainCore = () => {
    const [mainTab] = useState('COMMAND');
    const [feed, setFeed] = useState(dataCache.feed || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingFeed, setIsLoadingFeed] = useState(!dataCache.feed);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clients, setClients] = useState(dataCache.clients || []);
    const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false);

    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [quickNote, setQuickNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    const fetchInitialData = useCallback(async () => {
        if (!dataCache.feed) setIsLoadingFeed(true);

        try {
            const [feedRes, clientsRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/db/clients`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (feedRes.ok) {
                const data = await feedRes.json();
                dataCache.feed = data.feed || [];
                dataCache.stats = data.stats || { count: 0 };
                setFeed(dataCache.feed);
            }
            if (clientsRes.ok) {
                dataCache.clients = await clientsRes.json();
                setClients(dataCache.clients);
            }
        } catch (error) {
            console.error("Manager Sync Error:", error);
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

    // --- Tab Content Components ---

    const CommandCenterTab = () => {
        const threats = useMemo(() => feed.filter(i => i.type === 'AMENAZA' || i.severity === 'critical'), [feed]);
        const recent = useMemo(() => feed.filter(i => i.type !== 'AMENAZA' && i.severity !== 'critical').slice(0, 9), [feed]);

        return (
            <div className="w-full max-w-6xl mx-auto py-8 space-y-12">
                {/* Minimalist Landing Header */}
                <div className="space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-black tracking-tight text-foreground">Project Manager</h1>
                        <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.2em] mt-2">v2.5 Operative Intelligence</p>
                    </div>
                    <form onSubmit={handleSearch} className="relative bg-card border border-border rounded-full shadow-xl flex items-center p-1.5 focus-within:ring-2 ring-primary/10 transition-all max-w-2xl mx-auto">
                        <div className="p-3 text-muted-foreground/40"><Search className="w-5 h-5" /></div>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Consultar riesgos u operaciones..."
                            className="flex-1 bg-transparent border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/30 px-2 py-3.5 text-sm font-medium"
                        />
                        <button type="submit" disabled={isSearching} className="px-8 py-3.5 bg-foreground text-background dark:bg-primary dark:text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Auditar"}
                        </button>
                    </form>
                </div>

                {/* Threat Zone - Wide and clean */}
                <div className="space-y-5">
                    <div className="flex items-center gap-2.5 px-1 border-l-4 border-red-500 py-1">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">Amenazas Activas</h3>
                        <span className="text-[9px] bg-red-500 text-white px-2 py-0.5 rounded-full font-black">{threats.length}</span>
                    </div>
                    {threats.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {threats.map(t => <ActionCard key={t.id} item={t} type="THREAT" />)}
                        </div>
                    ) : (
                        <div className="py-16 text-center bg-muted/20 rounded-[2rem] border-2 border-dashed border-border/40">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400/50 mx-auto mb-3" />
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sin riesgos detectados en la plataforma</p>
                        </div>
                    )}
                </div>

                {/* Grid-based Intelligence Feed */}
                <div className="space-y-5 pb-32">
                    <div className="flex items-center gap-2.5 px-1 border-l-4 border-primary py-1">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">Log de Inteligencia</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {recent.map(r => <ActionCard key={r.id} item={r} type="INTELLIGENCE" />)}
                    </div>
                </div>
            </div>
        );
    };


    return (
        <div className="flex flex-col h-screen bg-background transition-colors overflow-hidden font-sans text-foreground">
            <SourceManagementModal isOpen={isManageSourcesOpen} onClose={() => setIsManageSourcesOpen(false)} onRefresh={fetchInitialData} />

            {/* --- Ultra Minimal Header --- */}
            <div className="h-16 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-center relative px-8 shrink-0 z-50">
                <div className="flex items-center gap-4 border-l-4 border-primary pl-4 py-1">
                    <h2 className="text-xl font-black tracking-tight uppercase">Inteligencia Operativa</h2>
                </div>

                <div className="absolute right-8 flex items-center gap-5">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Sincronizado</span>
                    </div>
                    <button onClick={() => setIsManageSourcesOpen(true)} className="p-2 hover:bg-muted rounded-xl transition-all group">
                        <Settings2 className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    </button>
                </div>
            </div>

            {/* --- Clean Action Canvas --- */}
            <div className="flex-1 overflow-hidden relative">
                <main className="h-full overflow-y-auto custom-scrollbar px-6 relative bg-background">
                    <AnimatePresence mode="wait">
                        <motion.div key={mainTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                            {mainTab === 'COMMAND' && <CommandCenterTab />}
                        </motion.div>
                    </AnimatePresence>

                    {searchResult && mainTab === 'COMMAND' && (
                        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border border-primary/20 p-8 rounded-[2rem] shadow-2xl z-[60]">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-primary font-black uppercase text-[9px] tracking-widest"><Sparkles className="w-4 h-4" /> Respuesta IA</div>
                                <button onClick={() => setSearchResult(null)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed font-medium italic opacity-90">"{searchResult.content}"</p>
                        </div>
                    )}
                </main>

                {/* --- Small FAB for Quick Note --- */}
                <button
                    onClick={() => setIsNoteModalOpen(true)}
                    className="fixed bottom-10 right-10 z-[100] w-14 h-14 bg-foreground text-background dark:bg-primary dark:text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
                    title="Nueva Nota"
                >
                    <Plus className="w-7 h-7" />
                </button>
            </div>

            {/* --- Quick Note Modal --- */}
            <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
                <DialogContent className="max-w-md rounded-[2rem] p-0 overflow-hidden border border-border shadow-2xl">
                    <DialogHeader className="p-6 bg-foreground text-background dark:bg-primary dark:text-white">
                        <div className="flex items-center gap-3">
                            <StickyNote className="w-5 h-5" />
                            <DialogTitle className="text-[11px] font-black uppercase tracking-widest">Anclar Insight Operativo</DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="p-8 space-y-6 bg-card">
                        <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest px-1">Contexto</label>
                            <select
                                value={selectedClientId || ''}
                                onChange={(e) => setSelectedClientId(e.target.value || null)}
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-xs font-bold uppercase focus:ring-1 ring-primary/20 outline-none"
                            >
                                <option value="">Global / Agencia</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[9px] font-black uppercase text-muted-foreground tracking-widest px-1">Nota</label>
                            <textarea
                                value={quickNote}
                                onChange={(e) => setQuickNote(e.target.value)}
                                placeholder="¿Qué descubrimos hoy?"
                                className="w-full bg-muted/50 border border-border rounded-2xl p-5 text-sm font-medium min-h-[180px] resize-none focus:ring-1 ring-primary/20 outline-none placeholder:text-muted-foreground/30 leading-relaxed"
                            />
                        </div>
                    </div>
                    <div className="p-6 bg-muted/10 border-t border-border flex items-center justify-end gap-3">
                        <button onClick={() => setIsNoteModalOpen(false)} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all">Cancelar</button>
                        <button
                            onClick={handleSaveQuickNote}
                            disabled={!quickNote.trim() || isSavingNote}
                            className="px-10 py-2.5 bg-foreground text-background dark:bg-primary dark:text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-30"
                        >
                            {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Memoria"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default BrainCore;
