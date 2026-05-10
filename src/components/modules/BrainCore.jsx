import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const SkeletonCard = () => (
    <div className="p-6 rounded-[2rem] border border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/20 animate-pulse">
        <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            <div className="w-16 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
        </div>
        <div className="w-3/4 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-2" />
        <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-1" />
        <div className="w-5/6 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-6" />
        <div className="pt-4 border-t border-zinc-100 dark:border-white/5 flex justify-between">
            <div className="w-12 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
            <div className="w-20 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
        </div>
    </div>
);

const BrainCore = () => {
    const [input, setInput] = useState('');
    const [feed, setFeed] = useState([]);
    const [radar, setRadar] = useState(null);
    const [isLoadingFeed, setIsLoadingFeed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [clients, setClients] = useState([]);

    const fileInputRef = useRef(null);
    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    const fetchInitialData = async () => {
        setIsLoadingFeed(true);
        try {
            const [feedRes, clientsRes] = await Promise.all([
                fetch(`${baseUrl}/api/brain-core/feed`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${baseUrl}/api/db/clients`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (feedRes.ok) setFeed(await feedRes.json());
            if (clientsRes.ok) setClients(await clientsRes.json());
        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setIsLoadingFeed(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchRadar = async (clientId) => {
        if (!clientId) return;
        try {
            const res = await fetch(`${baseUrl}/api/brain-core/radar/${clientId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setRadar(await res.json());
        } catch (e) { console.error(e); }
    };

    const handleFeedBrain = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || isProcessing) return;

        setIsProcessing(true);
        setProcessingMessage('Sincronizando con Memoria Vectorial...');

        try {
            const response = await fetch(`${baseUrl}/api/brain-core/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: input, clientId: selectedClientId })
            });

            if (response.ok) {
                toast.success("Memoria actualizada.");
                setInput('');
                fetchInitialData();
            }
        } catch (error) {
            toast.error("Error al alimentar al cerebro.");
        } finally {
            setIsProcessing(false);
        }
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
                toast.success("Captura procesada e integrada.");
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
        <div className="flex flex-col h-[calc(100vh-6rem)] relative bg-slate-950/20 transition-colors overflow-hidden">
            <PageHeader title="Brain Core Command Center" subtitle="Dashboard de Inteligencia Proactiva y Memoria Estratégica.">
                <div className="flex items-center gap-3">
                    <select
                        onChange={(e) => {
                            setSelectedClientId(e.target.value);
                            fetchRadar(e.target.value);
                        }}
                        className="bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs focus:ring-2 ring-primary/20 outline-none"
                    >
                        <option value="">Contexto Global</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl backdrop-blur-md">
                        <Brain className="w-4 h-4 text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Command Center V1.1</span>
                    </div>
                </div>
            </PageHeader>

            <div className="flex flex-1 min-h-0">
                {/* Main Dashboard Area */}
                <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">

                    {/* Console (Input) Glassmorphism */}
                    <div className="mb-8 max-w-4xl mx-auto w-full">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl opacity-20 blur-xl group-focus-within:opacity-40 transition duration-700" />
                            <form onSubmit={handleFeedBrain} className="relative bg-white/5 dark:bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] flex items-center p-2">
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 hover:bg-white/10 rounded-2xl text-zinc-400 transition-all flex-shrink-0">
                                    <ImageIcon className="w-6 h-6" />
                                </button>
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Alimenta al cerebro: pega notas, sube capturas o dicta instrucciones..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 px-4 py-4 text-lg font-medium"
                                />
                                <button type="submit" disabled={!input.trim() || isProcessing} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center min-w-[60px]">
                                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </button>
                            </form>
                        </div>
                        <AnimatePresence>
                            {isProcessing && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mt-4 flex items-center justify-center gap-3 text-indigo-500 font-bold text-xs tracking-widest uppercase"
                                >
                                    <Sparkles className="w-4 h-4 animate-pulse" /> {processingMessage}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Intelligence Feed */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Intelligence Feed</h2>
                            <div className="h-px flex-1 bg-zinc-100 dark:bg-white/5 ml-4" />
                        </div>

                        {isLoadingFeed ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                                <AnimatePresence mode="popLayout">
                                    {feed.map((card) => (
                                        <motion.div
                                            key={card.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className={cn(
                                                "p-6 rounded-[2.5rem] border backdrop-blur-md transition-all duration-500 group hover:shadow-2xl relative overflow-hidden",
                                                card.type === 'ALERTA' ? 'bg-red-900/20 border-red-500/20' :
                                                card.type === 'INSIGHT' ? 'bg-amber-900/20 border-amber-500/20' :
                                                card.type === 'RECOMENDACIÓN' ? 'bg-indigo-900/20 border-indigo-500/20' :
                                                'bg-white/5 dark:bg-slate-900/40 border-white/10'
                                            )}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className={cn(
                                                    "p-3 rounded-2xl shadow-lg",
                                                    card.type === 'ALERTA' ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white' :
                                                    card.type === 'INSIGHT' ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white' :
                                                    card.type === 'RECOMENDACIÓN' ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white' :
                                                    'bg-gradient-to-br from-zinc-500 to-slate-600 text-white'
                                                )}>
                                                    {card.type === 'ALERTA' ? <AlertCircle className="w-5 h-5" /> :
                                                     card.type === 'INSIGHT' ? <Zap className="w-5 h-5" /> :
                                                     card.type === 'RECOMENDACIÓN' ? <Target className="w-5 h-5" /> : <History className="w-5 h-5" />}
                                                </div>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-indigo-500 transition-colors">
                                                    {card.type}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2 leading-tight">{card.title}</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6 line-clamp-3 group-hover:line-clamp-none transition-all duration-500">{card.content}</p>
                                            <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-white/5">
                                                <span className="text-[10px] font-medium text-zinc-400">{new Date(card.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                <button className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tighter text-indigo-500 hover:translate-x-1 transition-all">
                                                    Explorar <ChevronRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Knowledge Radar (Glassmorphism) */}
                <div className="w-96 bg-white/5 dark:bg-slate-900/40 backdrop-blur-md border-l border-white/10 flex flex-col p-8 overflow-y-auto">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="p-3 bg-zinc-900 dark:bg-white rounded-2xl text-white dark:text-zinc-900 shadow-xl">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs font-black uppercase tracking-[0.2em]">Knowledge Radar</h2>
                            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">Perfil Cognitivo del Cliente</p>
                        </div>
                    </div>

                    {!radar ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                            <Target className="w-16 h-16 mb-6 text-zinc-300 dark:text-zinc-700" />
                            <p className="text-sm font-bold text-zinc-400">Selecciona un cliente para proyectar su conocimiento.</p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> Preferencias
                                </h4>
                                <ul className="space-y-3">
                                    {radar.preferences?.map((p, i) => (
                                        <li key={i} className="text-xs bg-white/5 dark:bg-slate-800/20 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-zinc-700 dark:text-zinc-300 shadow-sm">
                                            {p}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-5 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" /> Red Flags
                                </h4>
                                <ul className="space-y-3">
                                    {radar.dislikes?.map((d, i) => (
                                        <li key={i} className="text-xs bg-red-500/10 p-4 rounded-3xl border border-red-500/10 text-red-700 dark:text-red-400 font-bold shadow-sm">
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <button
                                onClick={() => toast.success("Aprendizaje confirmado y anclado.")}
                                className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group"
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
