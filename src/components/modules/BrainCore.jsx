import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search, Mail, Video, Calendar, Layout, Plus, StickyNote, Clock, ChevronDown, ListTodo, MoreHorizontal, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import SourceManagementModal from './SourceManagementModal';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const BrainCore = () => {
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
    const [activeTab, setActiveTab] = useState('feed');
    const [quickNote, setQuickNote] = useState('');
    const [workspaceInsights, setWorkspaceInsights] = useState(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);
    const [integrations, setIntegrations] = useState([]);
    const [clientSummary, setClientSummary] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

    // UI States for Expansion
    const [expandedCardId, setExpandedCardId] = useState(null);

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

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
            const statusParam = activeTab === 'proposals' ? 'PENDING' : 'APPROVED';
            const [feedRes, clientsRes, integrationsRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed?status=${statusParam}`, { headers: { 'Authorization': `Bearer ${token}` } }),
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
    }, [activeTab]);

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

        // Optimistic UI
        const tempNote = quickNote;
        setQuickNote('');
        toast.success("Anclando nota...");

        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: tempNote, clientId: selectedClientId })
            });
            if (response.ok) {
                fetchInitialData();
            } else {
                setQuickNote(tempNote);
                toast.error("Fallo al guardar nota.");
            }
        } catch (error) {
            setQuickNote(tempNote);
        }
    };

    const toggleCard = (id) => {
        setExpandedCardId(expandedCardId === id ? null : id);
    };

    // Component for Thread/Blocking Zone
    const ThreatZone = () => {
        const threats = feed.filter(item => item.type === 'AMENAZA' || item.severity === 'critical');
        if (threats.length === 0) return null;

        return (
            <div className="max-w-6xl mx-auto w-full mb-12">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-red-900">Zona de Amenazas Operativas</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {threats.map(threat => (
                        <motion.div
                            key={threat.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-50 border-2 border-red-100 rounded-3xl p-6 relative overflow-hidden group hover:border-red-200 transition-all cursor-pointer"
                            onClick={() => toggleCard(threat.id)}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                    <span className="text-[10px] font-black uppercase text-red-600 tracking-tighter">Acción Recomendada</span>
                                </div>
                                <Clock className="w-3.5 h-3.5 text-red-300" />
                            </div>
                            <h4 className="text-sm font-black text-red-900 mb-2 leading-tight">{threat.title}</h4>
                            <p className="text-xs text-red-700/80 font-medium leading-relaxed line-clamp-2">{threat.content}</p>

                            <ChevronDown className={cn("w-4 h-4 text-red-400 absolute bottom-4 right-6 transition-transform", expandedCardId === threat.id && "rotate-180")} />
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    };

    // Expanded Content Component
    const ExpandedContent = ({ item }) => (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-50 mt-4 pt-6"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Resumen Ejecutivo</span>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                        {item.metadata?.intent ? `Este mensaje se clasifica como: ${item.metadata.intent}. ` : ''}
                        {item.content}
                    </p>

                    {item.metadata?.actionLink && (
                        <div className="mt-6">
                             <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Quick Actions</span>
                            </div>
                            <a
                                href={item.metadata.actionLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-4 py-3 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all w-fit"
                            >
                                Abrir en Plataforma <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    )}
                </div>

                <div className="bg-zinc-50/50 rounded-2xl p-6 border border-zinc-100">
                    <div className="flex items-center gap-2 mb-4">
                        <ListTodo className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Action Items Checklist</span>
                    </div>
                    <div className="space-y-3">
                        {(item.metadata?.actionItems || []).map((step, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded border border-zinc-300 flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 transition-colors">
                                    <Check className="w-2.5 h-2.5 text-transparent hover:text-emerald-500" />
                                </div>
                                <span className="text-xs text-zinc-500 font-medium">{step}</span>
                            </div>
                        ))}
                        {(!item.metadata?.actionItems || item.metadata.actionItems.length === 0) && (
                            <p className="text-[10px] text-zinc-400 italic">No se detectaron pasos accionables.</p>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="flex flex-col h-screen bg-zinc-50 transition-colors overflow-hidden">
            <SourceManagementModal
                isOpen={isManageSourcesOpen}
                onClose={() => setIsManageSourcesOpen(false)}
                onRefresh={fetchInitialData}
            />

            {/* Optimized Thin Header */}
            <div className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6 shrink-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-zinc-900 text-white px-3 py-1.5 rounded-xl shadow-sm">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Brain Core v2.5</span>
                    </div>
                    <div className="h-4 w-px bg-zinc-200" />
                    <div className="flex items-center gap-6">
                        <button className="flex items-center gap-2 group relative">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-700 uppercase">Sincronizado: {stats.count}</span>
                            </div>
                        </button>
                        <button className="flex items-center gap-2 group">
                            <Zap className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Tráfico AI: Normal</span>
                        </button>
                        <div className="h-4 w-px bg-zinc-100 mx-2" />
                        <button
                            onClick={() => setIsManageSourcesOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-all group"
                        >
                            <Settings2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-primary transition-colors" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Gestionar Fuentes</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={selectedClientId || ''}
                        onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedClientId(val);
                            fetchClientSummary(val);
                        }}
                        className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest focus:ring-2 ring-primary/20 outline-none"
                    >
                        <option value="">Global Context</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-zinc-500" />
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Main Workspace */}
                <div className="flex-1 flex flex-col min-w-0 p-8 overflow-y-auto custom-scrollbar pb-32">

                    {/* Central Prompt */}
                    <div className="max-w-4xl mx-auto w-full mb-12">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">Pregúntale al cerebro...</h1>
                            <p className="text-sm text-zinc-500 font-medium italic">Motor de operaciones activado • v2.5 Operative Intelligence</p>
                        </div>

                        <form onSubmit={handleSearch} className="relative bg-white border border-zinc-200 rounded-[2.5rem] shadow-xl shadow-zinc-200/50 flex items-center p-2 focus-within:ring-4 ring-primary/5 transition-all">
                            <button
                                type="button"
                                className="ml-2 p-3 hover:bg-zinc-50 rounded-full text-primary transition-all flex-shrink-0"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                            <div className="p-3 text-zinc-400">
                                <Search className="w-6 h-6" />
                            </div>
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="¿Riesgos de retraso detectados hoy?"
                                className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 px-2 py-4 text-lg font-medium"
                            />
                            <button
                                type="submit"
                                disabled={!searchQuery.trim() || isSearching}
                                className="px-8 py-4 bg-zinc-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-30"
                            >
                                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Consultar Cerebro"}
                            </button>
                        </form>
                    </div>

                    <ThreatZone />

                    {/* Dashboard Grid */}
                    <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                        {/* Gmail: Human Conversations First */}
                        <div className="bg-white rounded-[2rem] border border-zinc-200 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Conversaciones Directas (Gmail)</h3>
                                </div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase">{workspaceInsights?.emails?.length || 0} Relevantes</div>
                            </div>

                            <div className="space-y-4">
                                {isLoadingInsights ? (
                                    [1,2,3].map(i => <div key={i} className="h-16 bg-zinc-50 rounded-xl animate-pulse" />)
                                ) : workspaceInsights?.emails?.length > 0 ? (
                                    workspaceInsights.emails.map(mail => (
                                        <div
                                            key={mail.id}
                                            className="p-5 bg-white border border-zinc-100 rounded-2xl flex flex-col hover:border-primary/20 transition-all cursor-pointer group"
                                            onClick={() => toggleCard(mail.id)}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <p className="text-xs font-bold text-zinc-900 truncate">{mail.from}</p>
                                                    {mail.friction && <span className="text-[8px] bg-red-50 text-red-600 px-1.5 rounded-full font-black uppercase tracking-tighter flex items-center gap-1"><AlertCircle className="w-2 h-2" /> Fricción</span>}
                                                </div>
                                                <span className={cn(
                                                    "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase",
                                                    mail.priority === 'HIGH' ? "bg-red-50 text-red-500" : "bg-zinc-100 text-zinc-400"
                                                )}>{mail.priority}</span>
                                            </div>
                                            <p className="text-[11px] font-medium text-zinc-500 line-clamp-1">{mail.subject}</p>
                                            <AnimatePresence>
                                                {expandedCardId === mail.id && <ExpandedContent item={{...mail, content: mail.summary}} />}
                                            </AnimatePresence>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-zinc-400 font-medium italic py-8 text-center">Bandeja limpia de ruido operativo.</p>
                                )}
                            </div>
                        </div>

                        {/* Basecamp Tasks */}
                        <div className="bg-white rounded-[2rem] border border-zinc-200 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                                        <Layout className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Operaciones (Basecamp)</h3>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {(workspaceInsights?.basecampEmails || []).map(task => (
                                    <div
                                        key={task.id}
                                        className="p-5 bg-zinc-50/50 border border-zinc-100 rounded-2xl hover:border-emerald-200 transition-all group cursor-pointer"
                                        onClick={() => toggleCard(task.id)}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex flex-col">
                                                <p className="text-xs font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors leading-tight mb-1">{task.subject}</p>
                                                <span className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">{task.intent}</span>
                                            </div>
                                            <span className={cn(
                                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                task.priority === 'HIGH' ? "bg-red-50 border-red-100 text-red-500" : "bg-zinc-100 border-zinc-200 text-zinc-500"
                                            )}>
                                                {task.priority}
                                            </span>
                                        </div>
                                        <AnimatePresence>
                                            {expandedCardId === task.id ? (
                                                <ExpandedContent item={task} />
                                            ) : (
                                                <p className="text-[10px] text-zinc-500 line-clamp-1">{task.summary}</p>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Intelligence Feed */}
                    {!selectedClientId && (
                        <div className="max-w-6xl mx-auto w-full">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <History className="w-5 h-5 text-zinc-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Intelligence Feed</h3>
                                </div>
                            </div>

                            {isLoadingFeed ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[1,2,3].map(i => <div key={i} className="h-48 rounded-[2rem] bg-zinc-100 animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {feed.filter(i => i.type !== 'AMENAZA').map((card) => (
                                        <motion.div
                                            key={card.id}
                                            layout
                                            className="p-6 rounded-[2rem] border border-zinc-200/60 bg-white shadow-sm hover:shadow-md transition-all group cursor-pointer"
                                            onClick={() => toggleCard(card.id)}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="p-2 bg-primary/5 text-primary rounded-xl">
                                                    {card.severity === 'critical' ? <AlertCircle className="w-4 h-4 text-red-500" /> : <Zap className="w-4 h-4" />}
                                                </div>
                                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{card.type}</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-zinc-900 mb-2 leading-tight line-clamp-2">{card.title}</h4>
                                            <AnimatePresence>
                                                {expandedCardId === card.id ? (
                                                    <ExpandedContent item={card} />
                                                ) : (
                                                    <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{card.content}</p>
                                                )}
                                            </AnimatePresence>
                                            {!expandedCardId === card.id && (
                                                <div className="pt-4 mt-4 border-t border-zinc-50 flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-zinc-400">{new Date(card.timestamp).toLocaleDateString()}</span>
                                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar Dinámico (Derecha) */}
                <div className="w-96 border-l border-zinc-200 bg-white flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
                    <div className="p-8 border-b border-zinc-100">
                        <div className="flex items-center gap-3 mb-6">
                            <StickyNote className="w-5 h-5 text-primary" />
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Nota Rápida al Cerebro</h3>
                        </div>
                        <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-4 focus-within:ring-2 ring-primary/20 transition-all">
                            <textarea
                                value={quickNote}
                                onChange={(e) => setQuickNote(e.target.value)}
                                placeholder="Escribe algo importante para no olvidarlo..."
                                className="w-full bg-transparent border-none focus:ring-0 text-sm text-zinc-700 resize-none h-32 placeholder:text-zinc-400 placeholder:italic font-medium"
                            />
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200/50">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">{quickNote.length} caracteres</span>
                                <button
                                    onClick={handleSaveQuickNote}
                                    disabled={!quickNote.trim() || isProcessing}
                                    className="p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-30"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 flex-1 bg-zinc-50/20">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-zinc-400" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Tareas Activas</h3>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {(workspaceInsights?.basecampEmails || []).slice(0, 5).map(task => (
                                <div
                                    key={task.id}
                                    className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:border-primary/20 transition-all cursor-pointer group"
                                    onClick={() => toggleCard(task.id)}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary/60">{task.intent || 'Operación'}</span>
                                        <ArrowRight className="w-3 h-3 text-zinc-300 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                    <p className="text-xs font-bold text-zinc-900 line-clamp-1">{task.subject}</p>
                                </div>
                            ))}
                        </div>

                        <button className="w-full mt-12 py-4 bg-white text-zinc-500 border border-zinc-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-50 transition-all flex items-center justify-center gap-2">
                            Ver todo el Kanban <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="p-8 bg-white border-t border-zinc-100">
                        <button
                            onClick={() => {
                                toast.success("Iniciando auditoría profunda de la agencia...");
                                fetchInitialData();
                            }}
                            className="w-full py-5 bg-zinc-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-zinc-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
                        >
                            <RefreshCw className="w-4 h-4 text-primary group-hover:rotate-180 transition-transform duration-700" />
                            Auditar Sincronización
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default BrainCore;
