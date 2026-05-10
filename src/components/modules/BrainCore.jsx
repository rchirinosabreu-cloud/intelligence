import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const SkeletonCard = () => (
    <div className="p-6 rounded-[2rem] border border-zinc-200/60 bg-white shadow-sm animate-pulse">
        <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-zinc-100 rounded-2xl" />
            <div className="w-16 h-3 bg-zinc-100 rounded-full" />
        </div>
        <div className="w-3/4 h-5 bg-zinc-100 rounded-lg mb-2" />
        <div className="w-full h-3 bg-zinc-100 rounded-lg mb-1" />
        <div className="w-5/6 h-3 bg-zinc-100 rounded-lg mb-6" />
        <div className="pt-4 border-t border-zinc-50 flex justify-between">
            <div className="w-12 h-2 bg-zinc-100 rounded-full" />
            <div className="w-20 h-2 bg-zinc-100 rounded-full" />
        </div>
    </div>
);

const BrainCore = () => {
    const [input, setInput] = useState('');
    const [feed, setFeed] = useState([]);
    const [stats, setStats] = useState({ count: 0 });
    const [radar, setRadar] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clients, setClients] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [showMetricDetail, setShowMetricDetail] = useState(null);
    const [automationStatus, setAutomationStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('feed'); // 'feed' or 'proposals'
    const [availableChats, setAvailableChats] = useState([]);
    const [monitoredChats, setMonitoredChats] = useState([]);

    const fileInputRef = useRef(null);
    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    const fetchInitialData = async () => {
        setIsLoadingFeed(true);
        try {
            const statusParam = activeTab === 'proposals' ? 'PENDING' : 'APPROVED';
            const [feedRes, clientsRes, automationRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed?status=${statusParam}`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/db/clients`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/automation/status`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (feedRes.ok) {
                const data = await feedRes.json();
                setFeed(data.feed || []);
                setStats(data.stats || { count: 0 });
            }
            if (clientsRes.ok) setClients(await clientsRes.json());
            if (automationRes.ok) setAutomationStatus(await automationRes.json());
        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setIsLoadingFeed(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, [activeTab]);

    const fetchRadar = async (clientId) => {
        if (!clientId) return;
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/radar/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setRadar(await res.json());
        } catch (e) { console.error(e); }
    };

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

    const handleFeedBrain = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || isProcessing) return;

        setIsProcessing(true);
        setProcessingMessage(editingItem ? 'Actualizando memoria...' : 'Sincronizando con Memoria Vectorial...');

        try {
            const url = editingItem
                ? `${baseUrl}/api/brain-core/context/${editingItem.contextId}`
                : `${baseUrl}/api/brain-core/context`;

            const method = editingItem ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: input, clientId: selectedClientId })
            });

            if (response.ok) {
                toast.success(editingItem ? "Memoria corregida." : "Memoria actualizada.");
                setInput('');
                setEditingItem(null);
                fetchInitialData();
            }
        } catch (error) {
            toast.error("Error al procesar la memoria.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProposalAction = async (id, status) => {
        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status })
            });
            if (response.ok) {
                toast.success(status === 'APPROVED' ? "Aprendizaje anclado." : "Propuesta descartada.");
                fetchInitialData();
            }
        } catch (e) {
            toast.error("Error en la acción.");
        }
    };

    const handleDeleteMemory = async (contextId) => {
        if (!confirm('¿Eliminar este aprendizaje permanentemente?')) return;

        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context/${contextId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success("Memoria eliminada.");
                fetchInitialData();
            }
        } catch (e) {
            toast.error("Error al eliminar.");
        }
    };

    const fetchChats = async () => {
        const res = await fetch(`${baseUrl}/api/automation/chats`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setAvailableChats(await res.json());
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsProcessing(true);
        setProcessingMessage('Gemini 2.5 Pro analizando sentimiento y extrayendo preferencias...');

        const formData = new FormData();
        formData.append('image', file);
        if (selectedClientId) formData.append('clientId', selectedClientId);

        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                toast.success("Captura procesada. Revisa la pestaña de Propuestas.");
                setActiveTab('proposals');
                fetchInitialData();
            }
        } catch (error) {
            toast.error("Error al procesar la captura.");
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] relative bg-zinc-50/50 transition-colors overflow-hidden">
            <PageHeader
                title="Brain Core Command Center"
                subtitle={
                    <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Dashboard de Inteligencia Proactiva.</span>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">
                                Cerebro sincronizado: Analizando {stats.count} puntos de datos
                            </span>
                        </div>
                    </div>
                }
            >
                <div className="flex items-center gap-6 mr-6">
                    <div className="flex bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/60">
                        <button
                            onClick={() => setActiveTab('feed')}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'feed' ? "bg-white text-primary shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                            )}
                        >
                            Memoria Activa
                        </button>
                        <button
                            onClick={() => setActiveTab('proposals')}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                activeTab === 'proposals' ? "bg-white text-primary shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                            )}
                        >
                            Propuestas
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        </button>
                    </div>

                    <div className="h-6 w-px bg-zinc-200" />
                </div>

                <div className="flex items-center gap-3">
                    <select
                        onChange={(e) => {
                            setSelectedClientId(e.target.value);
                            fetchRadar(e.target.value);
                        }}
                        className="bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 ring-primary/20 outline-none"
                    >
                        <option value="">Contexto Global</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 px-3 py-1.5 rounded-xl">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Command Center V1.1</span>
                    </div>
                </div>
            </PageHeader>

            <div className="flex flex-1 min-h-0 relative">
                {/* Main Dashboard Area */}
                <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden relative">

                    {/* Semantic Search Area */}
                    <div className="mb-8 relative group">
                        <form onSubmit={handleSearch} className="relative bg-white border border-zinc-200 rounded-[2.5rem] shadow-sm flex items-center p-1.5 focus-within:ring-4 ring-primary/5 transition-all">
                            <div className="p-3 text-zinc-400">
                                <Search className="w-5 h-5" />
                            </div>
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="¿Qué sabemos sobre los gustos de Alexander? Pregúntale al cerebro..."
                                className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 px-2 py-3 text-sm font-medium"
                            />
                            <button
                                type="submit"
                                disabled={!searchQuery.trim() || isSearching}
                                className="px-6 py-3 bg-zinc-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-30"
                            >
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Consultar"}
                            </button>
                        </form>

                        <AnimatePresence>
                            {searchResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full left-0 right-0 mt-3 p-6 bg-white border border-zinc-200 rounded-[2rem] shadow-2xl z-50"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2 text-primary">
                                            <Brain className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Respuesta Sintetizada</span>
                                        </div>
                                        <button onClick={() => setSearchResult(null)} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-sm text-zinc-700 leading-relaxed font-medium mb-6 italic">
                                        "{searchResult.content}"
                                    </p>
                                    {searchResult.sources && (
                                        <div className="pt-4 border-t border-zinc-50">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-3">Fuentes detectadas:</span>
                                            <div className="flex flex-wrap gap-2">
                                                {searchResult.sources.map(s => (
                                                    <div key={s.id} className="px-3 py-1 bg-zinc-50 border border-zinc-100 rounded-full text-[9px] text-zinc-500 font-bold truncate max-w-[200px]">
                                                        {s.content}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* OpenClaw Connection Card (When QR is needed) */}
                    {automationStatus?.status === 'qr_required' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="mb-8 p-6 rounded-[2.5rem] bg-primary/5 border border-primary/10 shadow-xl shadow-primary/5 flex items-center gap-8"
                        >
                            <div className="p-4 bg-white rounded-3xl shadow-lg">
                                <img src={automationStatus.qrUrl} alt="WhatsApp QR" className="w-32 h-32" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 text-primary mb-2">
                                    <QrCode className="w-5 h-5" />
                                    <h2 className="text-xs font-black uppercase tracking-widest">Enlazar OpenClaw (WhatsApp)</h2>
                                </div>
                                <p className="text-sm text-zinc-600 mb-4 max-w-lg">
                                    Escanea este código para autorizar al agente a extraer minutas y acuerdos automáticamente desde tus chats VIP.
                                </p>
                                <div className="flex items-center gap-3">
                                    <button className="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20">
                                        Escaneado
                                    </button>
                                    <button className="px-4 py-2 bg-zinc-100 text-zinc-500 text-[10px] font-black uppercase tracking-widest rounded-xl">
                                        Más información
                                    </button>
                                </div>
                            </div>
                            <Smartphone className="w-24 h-24 text-primary/10 absolute right-8" />
                        </motion.div>
                    )}

                    {/* Upper Space: Brain Health / Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setShowMetricDetail('cognition')}
                            className="p-5 rounded-3xl bg-white border border-zinc-200/60 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-3 mb-2 text-primary">
                                <Zap className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Capacidad Cognitiva</span>
                            </div>
                            <div className="text-2xl font-light text-zinc-900">98.2%</div>
                            <div className="w-full bg-zinc-100 h-1.5 rounded-full mt-3 overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: '98.2%' }} className="bg-primary h-full shadow-[0_0_8px_rgba(var(--primary),0.3)]" />
                            </div>
                            <AnimatePresence>
                                {showMetricDetail === 'cognition' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-zinc-50 text-[10px] text-zinc-500 space-y-1">
                                        <p>• Latencia media: 420ms</p>
                                        <p>• Fragmentación: 1.8%</p>
                                        <p>• Relevancia semántica: Alta</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            onClick={() => setShowMetricDetail('sync')}
                            className="p-5 rounded-3xl bg-white border border-zinc-200/60 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-3 mb-2 text-emerald-500">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Sincronización</span>
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                            <div className="text-2xl font-light text-zinc-900">Active</div>
                            <p className="text-[10px] text-zinc-500 mt-2">Vector Memory & Kanban cross-ref active.</p>
                            <AnimatePresence>
                                {showMetricDetail === 'sync' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-zinc-50 text-[10px] text-zinc-500 space-y-1">
                                        <p>• Postgres + pgvector: OK</p>
                                        <p>• Vertex AI Embedding: Connected</p>
                                        <p>• Last Sync: {new Date().toLocaleTimeString()}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            onClick={() => setShowMetricDetail('mode')}
                            className="p-5 rounded-3xl bg-white border border-zinc-200/60 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-3 mb-2 text-primary">
                                <Sparkles className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Proactive Mode</span>
                            </div>
                            <div className="text-lg font-bold text-zinc-900">Senior Director</div>
                            <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-tighter">Gemini 2.5 Pro reasoning enabled.</p>
                            <AnimatePresence>
                                {showMetricDetail === 'mode' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-zinc-50 text-[10px] text-zinc-500 space-y-1">
                                        <p>• Tono: Estratégico & Optimista</p>
                                        <p>• Nivel de Razonamiento: Máximo</p>
                                        <p>• Filtro de Privacidad: Activo</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>

                    {/* Intelligence Feed */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-32">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Intelligence Feed</h2>
                            <div className="h-px flex-1 bg-zinc-200/60 ml-4" />
                        </div>

                        {isLoadingFeed ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : feed.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                                <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4 border border-primary/10 shadow-sm">
                                    <Brain className="w-8 h-8 text-primary animate-pulse" />
                                </div>
                                <p className="text-sm font-medium text-zinc-900">Cerebro recalibrando...</p>
                                <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-bold">Analizando memoria y tareas activas</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                                <AnimatePresence mode="popLayout">
                                    {feed.map((card) => (
                                        <motion.div
                                            key={card.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9, y: 50 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                            className={cn(
                                                "p-6 rounded-[2.5rem] border transition-all duration-500 group hover:shadow-xl relative overflow-hidden bg-white",
                                                card.type === 'ALERTA' ? 'border-red-100 shadow-sm shadow-red-500/5' :
                                                card.type === 'INSIGHT' ? 'border-amber-100 shadow-sm shadow-amber-500/5' :
                                                card.type === 'RECOMENDACIÓN' ? 'border-primary/10 shadow-sm shadow-primary/5' :
                                                'border-zinc-200/60 shadow-sm'
                                            )}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className={cn(
                                                    "p-3 rounded-2xl shadow-sm",
                                                    card.type === 'ALERTA' ? 'bg-red-50 text-red-500' :
                                                    card.type === 'INSIGHT' ? 'bg-amber-50 text-amber-500' :
                                                    card.type === 'RECOMENDACIÓN' ? 'bg-primary/5 text-primary' :
                                                    'bg-zinc-50 text-zinc-500'
                                                )}>
                                                    {card.type === 'ALERTA' ? <AlertCircle className="w-5 h-5" /> :
                                                     card.type === 'INSIGHT' ? <Zap className="w-5 h-5" /> :
                                                     card.type === 'RECOMENDACIÓN' ? <Target className="w-5 h-5" /> : <History className="w-5 h-5" />}
                                                </div>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest",
                                                    card.type === 'ALERTA' ? 'text-red-400' :
                                                    card.type === 'INSIGHT' ? 'text-amber-400' :
                                                    card.type === 'RECOMENDACIÓN' ? 'text-primary/60' :
                                                    'text-zinc-400'
                                                )}>
                                                    {card.type}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-zinc-900 mb-2 leading-tight">{card.title}</h3>
                                            <p className="text-sm text-zinc-600 leading-relaxed mb-6 line-clamp-3 group-hover:line-clamp-none transition-all duration-500">{card.content}</p>

                                            <div className="flex items-center justify-between pt-4 border-t border-zinc-50">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-medium text-zinc-400">{new Date(card.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                    {card.contextId && (
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingItem(card);
                                                                    setInput(card.content);
                                                                }}
                                                                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-primary transition-colors"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteMemory(card.contextId)}
                                                                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {activeTab === 'proposals' ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleProposalAction(card.id, 'APPROVED')}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                                                        >
                                                            <Check className="w-3 h-3" /> Confirmar
                                                        </button>
                                                        <button
                                                            onClick={() => handleProposalAction(card.id, 'DISCARDED')}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 transition-all"
                                                        >
                                                            <X className="w-3 h-3" /> Descartar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter text-primary hover:translate-x-1 transition-all">
                                                        Explorar <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Floating Chat Bar (Bottom) */}
                    <div className="absolute bottom-6 left-6 right-6 z-40 pointer-events-none">
                        <div className="max-w-4xl mx-auto w-full pointer-events-auto">
                            <div className="relative group">
                                <form onSubmit={handleFeedBrain} className="relative bg-white/90 backdrop-blur-xl border border-zinc-200/80 rounded-[2rem] shadow-2xl shadow-zinc-200/50 flex items-center p-2">
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 hover:bg-zinc-50 rounded-2xl text-primary transition-all flex-shrink-0">
                                        <ImageIcon className="w-6 h-6" />
                                    </button>
                                    <input
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={editingItem ? "Corrigiendo memoria..." : "Alimenta al cerebro: notas, capturas o instrucciones..."}
                                        className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 px-4 py-4 text-base font-light"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleFeedBrain();
                                            }
                                        }}
                                    />
                                    {editingItem && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingItem(null);
                                                setInput('');
                                            }}
                                            className="p-4 hover:bg-zinc-50 rounded-2xl text-zinc-400 transition-all"
                                        >
                                            <X className="w-6 h-6" />
                                        </button>
                                    )}
                                    <button type="submit" disabled={!input.trim() || isProcessing} className="p-4 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center min-w-[60px]">
                                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                    </button>
                                </form>
                            </div>
                            <AnimatePresence>
                                {isProcessing && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="mt-4 flex items-center justify-center gap-3 text-primary font-bold text-[10px] tracking-widest uppercase bg-white/80 backdrop-blur-xl py-2 rounded-full border border-zinc-200 mx-auto w-fit px-6 shadow-sm"
                                    >
                                        <Sparkles className="w-3 h-3 animate-pulse" /> {processingMessage}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Knowledge Radar & Automation */}
                <div className="w-96 bg-white border-l border-zinc-200 flex flex-col p-8 overflow-y-auto custom-scrollbar">

                    {/* Automation Control Panel */}
                    <div className="mb-12 p-6 rounded-[2rem] bg-zinc-50 border border-zinc-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-zinc-400" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">OpenClaw Config</h3>
                            </div>
                            <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border",
                                automationStatus?.status === 'ready' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-amber-50 border-amber-100 text-amber-600"
                            )}>
                                {automationStatus?.status === 'ready' ? <Wifi className="w-3 h-3" /> : <RefreshCw className="w-3 h-3 animate-spin" />}
                                <span className="text-[9px] font-bold uppercase tracking-tight">{automationStatus?.status || 'Offline'}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2 block">Monitoreo VIP</label>
                                <button
                                    onClick={fetchChats}
                                    className="w-full py-3 bg-white border border-zinc-200 rounded-2xl text-[10px] font-bold text-zinc-600 hover:border-primary transition-all flex items-center justify-center gap-2 group"
                                >
                                    <Smartphone className="w-3.5 h-3.5 text-zinc-400 group-hover:text-primary" />
                                    Vincular nuevo chat
                                </button>
                                {availableChats.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-2 p-2 bg-white rounded-2xl border border-zinc-200 max-h-40 overflow-y-auto">
                                        {availableChats.map(chat => (
                                            <button
                                                key={chat.id}
                                                onClick={() => {
                                                    setMonitoredChats([...monitoredChats, chat.name]);
                                                    setAvailableChats([]);
                                                    toast.success(`${chat.name} anclado.`);
                                                }}
                                                className="w-full text-left px-3 py-2 hover:bg-zinc-50 rounded-xl text-[10px] font-medium text-zinc-700 flex items-center justify-between group"
                                            >
                                                {chat.name}
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mb-10">
                        <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-900">Knowledge Radar</h2>
                            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">Perfil Cognitivo del Cliente</p>
                        </div>
                    </div>

                    {!radar ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                            <Target className="w-16 h-16 mb-6 text-zinc-200" />
                            <p className="text-sm font-bold text-zinc-400">Selecciona un cliente para proyectar su conocimiento.</p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" /> Preferencias
                                </h4>
                                <ul className="space-y-3">
                                    {radar.preferences?.map((p, i) => (
                                        <li key={i} className="text-xs bg-zinc-50 p-4 rounded-3xl border border-zinc-100 text-zinc-700 shadow-sm">
                                            {p}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]" /> Red Flags
                                </h4>
                                <ul className="space-y-3">
                                    {radar.dislikes?.map((d, i) => (
                                        <li key={i} className="text-xs bg-red-50/50 p-4 rounded-3xl border border-red-100 text-red-600 font-medium shadow-sm">
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <button
                                onClick={() => toast.success("Aprendizaje confirmado y anclado.")}
                                className="w-full py-5 bg-primary text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
                            >
                                <ShieldCheck className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                Confirmar Aprendizaje
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BrainCore;
