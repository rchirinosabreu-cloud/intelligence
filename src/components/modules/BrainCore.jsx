import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight, Trash2, Edit3, X, QrCode, Smartphone, Wifi, RefreshCw, Settings2, Check, ExternalLink, Search, Mail, Video, Calendar, Layout, Plus, StickyNote, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import SourceManagementModal from './SourceManagementModal';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const MOCK_GMAIL = [
    { id: 1, from: 'Alexander (TruPeak)', subject: 'Feedback sobre los artes de la campaña', time: '10:30 AM', unread: true },
    { id: 2, from: 'Soporte Meta', subject: 'Tu cuenta publicitaria ha sido verificada', time: '9:15 AM', unread: false },
    { id: 3, from: 'Google Calendar', subject: 'Recordatorio: Reunión de estrategia mensual', time: '8:00 AM', unread: false },
];

const MOCK_BASECAMP = [
    { id: 1, task: 'Finalizar copy para Reels de Artyzza', project: 'Artyzza - Social Media', deadline: 'Hoy' },
    { id: 2, task: 'Diseñar carrusel de beneficios', project: 'Sunpartners - Web CRO', deadline: 'Mañana' },
    { id: 3, task: 'Revisión de métricas mensuales Q1', project: 'TruPeak - Analytics', deadline: '15 Mar' },
    { id: 4, task: 'Programar posts de la semana 2', project: 'Artyzza - Social Media', deadline: 'Viernes' },
];

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
    const [isManageSourcesOpen, setIsManageSourcesOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('feed');
    const [quickNote, setQuickNote] = useState('');
    const [workspaceInsights, setWorkspaceInsights] = useState(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);
    const [integrations, setIntegrations] = useState([]);
    const [clientSummary, setClientSummary] = useState(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

    const fileInputRef = useRef(null);
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
        setClientSummary(null); // Clear previous
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/client-summary/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setClientSummary(await res.json());
            } else {
                setClientSummary({ error: true });
            }
        } catch (e) {
            console.error(e);
            setClientSummary({ error: true });
        }
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

    const handleSaveQuickNote = async () => {
        if (!quickNote.trim() || isProcessing) return;
        setIsProcessing(true);
        setProcessingMessage('Anclando nota rápida...');
        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: quickNote, clientId: selectedClientId })
            });
            if (response.ok) {
                toast.success("Nota guardada en el cerebro.");
                setQuickNote('');
                fetchInitialData();
            }
        } catch (error) {
            toast.error("Error al guardar nota.");
        } finally {
            setIsProcessing(false);
        }
    };

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
                        <span className="text-[10px] font-black uppercase tracking-widest">Brain Core v2.0</span>
                    </div>
                    <div className="h-4 w-px bg-zinc-200" />
                    <div className="flex items-center gap-6">
                        <button className="flex items-center gap-2 group relative">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-700 uppercase">Sincronizado: {stats.count}</span>
                            </div>
                        </button>
                        <button className="flex items-center gap-2 group" onClick={() => setShowMetricDetail('ram')}>
                            <Zap className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">RAM: 420MB</span>
                        </button>
                        <button className="flex items-center gap-2 group" onClick={() => setShowMetricDetail('cognition')}>
                            <Target className="w-3.5 h-3.5 text-zinc-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Capacidad: 98%</span>
                        </button>
                        <div className="h-4 w-px bg-zinc-100 mx-2" />
                        <button
                            onClick={() => setIsManageSourcesOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-all group"
                        >
                            <Settings2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-primary transition-colors" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Gestionar Fuentes API</span>
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

                    {/* The Prompt: Central Piece */}
                    <div className="max-w-4xl mx-auto w-full mb-12">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">Pregúntale al cerebro...</h1>
                            <p className="text-sm text-zinc-500 font-medium italic">Acceso instantáneo a la memoria estratégica de la agencia.</p>
                        </div>

                        <form onSubmit={handleSearch} className="relative bg-white border border-zinc-200 rounded-[2.5rem] shadow-xl shadow-zinc-200/50 flex items-center p-2 focus-within:ring-4 ring-primary/5 transition-all">
                            <button
                                type="button"
                                onClick={() => toast.success("Conectar nueva fuente (Sheets/Slides)...")}
                                className="ml-2 p-3 hover:bg-zinc-50 rounded-full text-primary transition-all flex-shrink-0"
                                title="Vincular nueva fuente de datos"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                            <div className="p-3 text-zinc-400">
                                <Search className="w-6 h-6" />
                            </div>
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="¿Cuáles son las preferencias de diseño de TruPeak?"
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

                        {/* Integration Badges */}
                        {integrations.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 flex flex-wrap justify-center gap-2"
                            >
                                {integrations.filter(s => !selectedClientId || s.clientId === selectedClientId).map(source => {
                                    const getDocUrl = () => {
                                        if (source.type === 'SHEETS') return `https://docs.google.com/spreadsheets/d/${source.externalId}`;
                                        if (source.type === 'SLIDES') return `https://docs.google.com/presentation/d/${source.externalId}`;
                                        return null;
                                    };
                                    const url = getDocUrl();

                                    return (
                                        <div
                                            key={source.id}
                                            className="flex items-center gap-2 px-3 py-1 bg-white border border-zinc-100 rounded-full shadow-sm hover:border-emerald-200 transition-all group"
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                                                {source.type === 'SHEETS' ? 'Sheets' : source.type === 'GMAIL' ? 'Gmail' : 'Slides'}:
                                                <span className="text-zinc-900 ml-1">{source.alias}</span>
                                            </span>
                                            {url && (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-1 p-0.5 hover:bg-zinc-100 rounded text-zinc-400 hover:text-primary transition-colors"
                                                    title="Abrir documento original"
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}

                        <AnimatePresence>
                            {(searchResult && !selectedClientId) && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="mt-6 p-8 bg-white border border-zinc-200 rounded-[2rem] shadow-2xl z-50"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2 text-primary">
                                            <Sparkles className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Respuesta Sintetizada</span>
                                        </div>
                                        <button onClick={() => setSearchResult(null)} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-base text-zinc-700 leading-relaxed font-medium italic">
                                        "{searchResult.content}"
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Principal Content Grid */}
                    <div className="max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                        {/* Today: Gmail & Meet */}
                        <div className="bg-white rounded-[2rem] border border-zinc-200 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 text-red-500 rounded-xl">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Hoy (Gmail/Meet)</h3>
                                </div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">3 Pendientes</div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between group hover:bg-primary/5 hover:border-primary/20 transition-all cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-primary">
                                            <Video className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-900">Weekly Performance Sync</p>
                                            <p className="text-[10px] text-zinc-500 font-medium">Google Meet • 11:30 AM</p>
                                        </div>
                                    </div>
                                    <button className="p-2 bg-white rounded-lg border border-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                                    </button>
                                </div>

                                {isLoadingInsights ? (
                                    [1,2,3].map(i => <div key={i} className="h-16 bg-zinc-50 rounded-xl animate-pulse" />)
                                ) : workspaceInsights?.emails?.length > 0 ? (
                                    workspaceInsights.emails.map(mail => (
                                        <div key={mail.id} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center justify-between hover:shadow-md transition-all cursor-pointer">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {mail.unread && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                                    <p className="text-xs font-bold text-zinc-900 truncate">{mail.from}</p>
                                                    {mail.isBasecamp && <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 rounded-full font-black uppercase">Basecamp</span>}
                                                </div>
                                                <p className="text-[10px] text-zinc-500 truncate">{mail.subject}</p>
                                            </div>
                                            <div className="text-[9px] font-bold text-zinc-400 ml-4">{mail.time || 'Reciente'}</div>
                                        </div>
                                    ))
                                ) : (
                                    MOCK_GMAIL.map(mail => (
                                        <div key={mail.id} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center justify-between hover:shadow-md transition-all cursor-pointer">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {mail.unread && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                                    <p className="text-xs font-bold text-zinc-900 truncate">{mail.from}</p>
                                                </div>
                                                <p className="text-[10px] text-zinc-500 truncate">{mail.subject}</p>
                                            </div>
                                            <div className="text-[9px] font-bold text-zinc-400 ml-4">{mail.time}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Basecamp: Assigned Tasks */}
                        <div className="bg-white rounded-[2rem] border border-zinc-200 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                                        <Layout className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Basecamp Tasks</h3>
                                </div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Mis Asignadas</div>
                            </div>

                            <div className="space-y-3">
                                {MOCK_BASECAMP.map(task => (
                                    <div key={task.id} className="p-4 bg-zinc-50/50 border border-zinc-100 rounded-2xl hover:border-emerald-200 transition-all group cursor-pointer">
                                        <div className="flex items-start justify-between mb-2">
                                            <p className="text-xs font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">{task.task}</p>
                                            <span className={cn(
                                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                task.deadline === 'Hoy' ? "bg-red-50 border-red-100 text-red-500" : "bg-zinc-100 border-zinc-200 text-zinc-500"
                                            )}>
                                                {task.deadline}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">
                                            <Calendar className="w-3 h-3" /> {task.project}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Intelligence Feed Section OR Client Executive Widget */}
                    <div className="max-w-6xl mx-auto w-full">
                        {selectedClientId ? (
                            <div className="bg-white rounded-[2.5rem] border-2 border-primary/10 p-10 shadow-xl shadow-primary/5">
                                <div className="flex items-center justify-between mb-10">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-primary text-white rounded-2xl">
                                            <ShieldCheck className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-zinc-900 tracking-tight">Centro de Control: {clients.find(c => c.id === selectedClientId)?.name}</h3>
                                            <p className="text-xs text-zinc-500 font-medium">Resumen ejecutivo y alertas en tiempo real.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Modo Cliente Activo</span>
                                    </div>
                                </div>

                                {isLoadingSummary ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {[1,2,3].map(i => <div key={i} className="h-64 bg-zinc-50 rounded-3xl animate-pulse" />)}
                                    </div>
                                ) : clientSummary?.error ? (
                                    <div className="py-20 text-center bg-red-50/30 rounded-[2rem] border-2 border-dashed border-red-100">
                                        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
                                        <p className="text-sm font-bold text-red-500 uppercase tracking-widest">Error al cargar widgets operativos</p>
                                        <p className="text-xs text-red-400 mt-1">Verifica la conexión con el Excel o las credenciales de Google.</p>
                                        <button
                                            onClick={() => fetchClientSummary(selectedClientId)}
                                            className="mt-6 px-6 py-2 bg-white border border-red-200 text-red-500 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 transition-all"
                                        >
                                            Reintentar Carga
                                        </button>
                                    </div>
                                ) : clientSummary ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                        {/* Tarjeta 1: Tareas Críticas */}
                                        <div className="p-8 bg-zinc-50 rounded-[2.5rem] border border-zinc-100 hover:shadow-xl hover:shadow-red-500/5 transition-all group">
                                            <div className="flex items-center justify-between mb-8">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Tareas Críticas
                                                </h4>
                                                <span className="text-[9px] font-bold text-zinc-400 uppercase">En Progreso</span>
                                            </div>
                                            <div className="space-y-3">
                                                {clientSummary.criticalTasks?.length > 0 ? clientSummary.criticalTasks.map((t, i) => (
                                                    <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm group-hover:border-red-100 transition-colors">
                                                        <div className="w-5 h-5 rounded-lg border-2 border-zinc-100 flex items-center justify-center shrink-0">
                                                            <Check className="w-3 h-3 text-zinc-200" />
                                                        </div>
                                                        <p className="text-xs font-bold text-zinc-700 truncate">{t}</p>
                                                    </div>
                                                )) : <p className="text-xs text-zinc-400 font-medium italic py-10 text-center">Sin tareas críticas activas.</p>}
                                            </div>
                                        </div>

                                        {/* Tarjeta 2: Próximas Entregas */}
                                        <div className="p-8 bg-zinc-50 rounded-[2.5rem] border border-zinc-100 hover:shadow-xl hover:shadow-amber-500/5 transition-all group">
                                            <div className="flex items-center justify-between mb-8">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" /> Próximas Entregas
                                                </h4>
                                                <span className="text-[9px] font-bold text-zinc-400 uppercase">Prioridad Alta</span>
                                            </div>
                                            <div className="space-y-4">
                                                {clientSummary.highPriority?.length > 0 ? clientSummary.highPriority.map((p, i) => (
                                                    <div key={i} className="p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm group-hover:border-amber-100 transition-colors">
                                                        <p className="text-xs font-bold text-zinc-900 mb-1">{p.task}</p>
                                                        <div className="flex items-center gap-2 text-[9px] font-black text-zinc-400 uppercase tracking-tighter">
                                                            <Calendar className="w-3 h-3 text-amber-500" /> {p.deadline}
                                                        </div>
                                                    </div>
                                                )) : <p className="text-xs text-zinc-400 font-medium italic py-10 text-center">Sin entregas inmediatas.</p>}
                                            </div>
                                        </div>

                                        {/* Tarjeta 3: Alertas y Bloqueos */}
                                        <div className="p-8 bg-white rounded-[2.5rem] border-2 border-zinc-100 hover:border-primary/20 hover:shadow-2xl transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4">
                                                <AlertCircle className="w-12 h-12 text-zinc-50" />
                                            </div>
                                            <div className="flex items-center justify-between mb-8">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-900 flex items-center gap-2">
                                                    ⚠️ Alertas / Bloqueos
                                                </h4>
                                            </div>
                                            <div className="space-y-3 mb-8">
                                                {clientSummary.blockers?.length > 0 ? clientSummary.blockers.map((b, i) => (
                                                    <div key={i} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 text-xs font-medium text-zinc-600 leading-relaxed italic">
                                                        "{b}"
                                                    </div>
                                                )) : <p className="text-xs text-zinc-400 font-medium italic py-4">Todo fluye sin bloqueos.</p>}
                                            </div>
                                            <div className="pt-6 border-t border-zinc-50">
                                                <p className="text-[10px] font-black uppercase text-primary/60 mb-2">IA Executive Insight</p>
                                                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                                                    {clientSummary.aiInsight}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-20 text-center border-2 border-dashed border-zinc-100 rounded-[2rem]">
                                        <Database className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                                        <p className="text-sm font-bold text-zinc-400">Vincular una fuente (Sheets/Gmail) para activar el Centro de Control.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <History className="w-5 h-5 text-zinc-400" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Intelligence Feed</h3>
                                    </div>
                                    <div className="flex bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/60">
                                        <button onClick={() => setActiveTab('feed')} className={cn("px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'feed' ? "bg-white text-primary shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>Memoria</button>
                                        <button onClick={() => setActiveTab('proposals')} className={cn("px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", activeTab === 'proposals' ? "bg-white text-primary shadow-sm" : "text-zinc-500 hover:text-zinc-700")}>Propuestas</button>
                                    </div>
                                </div>

                                {isLoadingFeed ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {[1,2,3].map(i => <div key={i} className="h-48 rounded-[2rem] bg-zinc-100 animate-pulse" />)}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {feed.map((card) => (
                                            <motion.div
                                                key={card.id}
                                                layout
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-6 rounded-[2rem] border border-zinc-200/60 bg-white shadow-sm hover:shadow-md transition-all group"
                                            >
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="p-2 bg-primary/5 text-primary rounded-xl">
                                                        {card.type === 'ALERTA' ? <AlertCircle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                                                    </div>
                                                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{card.type}</span>
                                                </div>
                                                <h4 className="text-sm font-bold text-zinc-900 mb-2 leading-tight">{card.title}</h4>
                                                <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3 mb-4">{card.content}</p>
                                                <div className="pt-4 border-t border-zinc-50 flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-zinc-400">{new Date(card.timestamp).toLocaleDateString()}</span>
                                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Sidebar Dinámico (Derecha) */}
                <div className="w-96 border-l border-zinc-200 bg-white flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
                    {/* Quick Notes Area */}
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
                                className="w-full bg-transparent border-none focus:ring-0 text-sm text-zinc-700 resize-none h-32 placeholder:text-zinc-400 placeholder:italic"
                            />
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200/50">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase">{quickNote.length} caracteres</span>
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

                    {/* Active Agency Tasks Area */}
                    <div className="p-8 flex-1">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-zinc-400" />
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Tareas Activas</h3>
                            </div>
                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[9px] font-bold uppercase">Agencia</span>
                        </div>

                        <div className="space-y-6">
                            {MOCK_BASECAMP.slice(0, 3).map(task => (
                                <div key={task.id} className="relative pl-6 border-l-2 border-zinc-100 group">
                                    <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-zinc-200 group-hover:bg-primary transition-colors" />
                                    <p className="text-xs font-bold text-zinc-900 mb-1 group-hover:text-primary transition-colors cursor-pointer">{task.task}</p>
                                    <p className="text-[10px] text-zinc-400 font-medium">{task.project}</p>
                                </div>
                            ))}
                        </div>

                        <button className="w-full mt-12 py-4 bg-zinc-50 text-zinc-500 border border-zinc-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-all flex items-center justify-center gap-2">
                            Ver todo el Kanban <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Knowledge Confirmation Button (Footer of Sidebar) */}
                    <div className="p-8 bg-zinc-50/50 border-t border-zinc-100">
                        <button
                            onClick={() => toast.success("Aprendizaje confirmado y anclado.")}
                            className="w-full py-5 bg-white border border-zinc-200 text-zinc-900 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
                        >
                            <ShieldCheck className="w-4 h-4 text-primary group-hover:rotate-12 transition-transform" />
                            Sincronizar Todo
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default BrainCore;
