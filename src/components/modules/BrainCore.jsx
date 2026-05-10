import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, User, Paperclip, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2, Zap, Target, ShieldCheck, CheckCircle2, History, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

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
        if (!input.trim()) return;

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

    const confirmLearning = () => {
        toast.success("Aprendizaje confirmado y anclado.");
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] relative bg-white dark:bg-zinc-950 transition-colors overflow-hidden">
            <PageHeader title="Brain Core Command Center" subtitle="Dashboard de Inteligencia Proactiva y Memoria Estratégica.">
                <div className="flex items-center gap-3">
                    <select
                        onChange={(e) => {
                            setSelectedClientId(e.target.value);
                            fetchRadar(e.target.value);
                        }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs focus:ring-2 ring-primary/20 outline-none"
                    >
                        <option value="">Contexto Global</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
                        <Brain className="w-4 h-4 text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Command Center V1.0</span>
                    </div>
                </div>
            </PageHeader>

            <div className="flex flex-1 min-h-0">
                {/* Main Dashboard Area */}
                <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">

                    {/* Console (Input) */}
                    <div className="mb-8 max-w-4xl mx-auto w-full">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl opacity-15 blur group-focus-within:opacity-30 transition duration-500" />
                            <form onSubmit={handleFeedBrain} className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl flex items-center p-2">
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-all flex-shrink-0">
                                    <ImageIcon className="w-6 h-6" />
                                </button>
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Alimenta al cerebro: pega notas, sube capturas o dicta instrucciones..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 px-4 py-4 text-lg font-medium"
                                />
                                <button type="submit" disabled={!input.trim() || isProcessing} className="p-4 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 hover:scale-105 transition-all disabled:opacity-50 disabled:grayscale">
                                    <Send className="w-5 h-5" />
                                </button>
                            </form>
                        </div>
                        {isProcessing && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center justify-center gap-3 text-indigo-500 font-bold text-sm tracking-tight">
                                <Loader2 className="w-4 h-4 animate-spin" /> {processingMessage}
                            </motion.div>
                        )}
                    </div>

                    {/* Intelligence Feed */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Intelligence Feed</h2>
                            <div className="h-px flex-1 bg-zinc-100 dark:bg-white/5 ml-4" />
                        </div>

                        {isLoadingFeed ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
                                {[1,2,3,4].map(i => <div key={i} className="h-48 bg-zinc-100 dark:bg-zinc-900 rounded-3xl" />)}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                                <AnimatePresence mode="popLayout">
                                    {feed.map((card) => (
                                        <motion.div
                                            key={card.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className={cn(
                                                "p-6 rounded-[2rem] border transition-all duration-500 group hover:shadow-2xl relative overflow-hidden",
                                                card.type === 'ALERTA' ? 'bg-red-50/50 border-red-200/50 dark:bg-red-900/10 dark:border-red-800/30' :
                                                card.type === 'INSIGHT' ? 'bg-amber-50/50 border-amber-200/50 dark:bg-amber-900/10 dark:border-amber-800/30' :
                                                card.type === 'RECOMENDACIÓN' ? 'bg-indigo-50/50 border-indigo-200/50 dark:bg-indigo-900/10 dark:border-indigo-800/30' :
                                                'bg-zinc-50/50 border-zinc-200/50 dark:bg-zinc-900/10 dark:border-white/5'
                                            )}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className={cn(
                                                    "p-2.5 rounded-2xl",
                                                    card.type === 'ALERTA' ? 'bg-red-500 text-white' :
                                                    card.type === 'INSIGHT' ? 'bg-amber-500 text-white' :
                                                    card.type === 'RECOMENDACIÓN' ? 'bg-indigo-500 text-white' :
                                                    'bg-zinc-500 text-white'
                                                )}>
                                                    {card.type === 'ALERTA' ? <AlertCircle className="w-5 h-5" /> :
                                                     card.type === 'INSIGHT' ? <Zap className="w-5 h-5" /> :
                                                     card.type === 'RECOMENDACIÓN' ? <Target className="w-5 h-5" /> : <History className="w-5 h-5" />}
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                                    {card.type}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2 leading-tight">{card.title}</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">{card.content}</p>
                                            <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-white/5">
                                                <span className="text-[10px] text-zinc-400">{new Date(card.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                <button className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-500 hover:gap-2 transition-all">
                                                    Ver Detalle <ChevronRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Knowledge Radar */}
                <div className="w-96 bg-zinc-50/50 dark:bg-zinc-900/20 border-l border-zinc-200 dark:border-white/5 flex flex-col p-8 overflow-y-auto">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="p-2 bg-zinc-900 dark:bg-white rounded-xl text-white dark:text-zinc-900">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest">Knowledge Radar</h2>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Ficha Mental del Cliente</p>
                        </div>
                    </div>

                    {!radar ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                            <Target className="w-12 h-12 mb-4 text-zinc-400" />
                            <p className="text-sm font-medium">Selecciona un cliente para ver su mapa de conocimiento.</p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Preferencias
                                </h4>
                                <ul className="space-y-2">
                                    {radar.preferences?.map((p, i) => (
                                        <li key={i} className="text-xs bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-zinc-100 dark:border-white/5 text-zinc-700 dark:text-zinc-300">
                                            {p}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3 text-red-500" /> Red Flags (Odia)
                                </h4>
                                <ul className="space-y-2">
                                    {radar.dislikes?.map((d, i) => (
                                        <li key={i} className="text-xs bg-red-500/5 dark:bg-red-500/10 p-3 rounded-2xl border border-red-500/10 text-red-700 dark:text-red-400 font-medium">
                                            {d}
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">Sentimiento</h4>
                                <div className="p-4 bg-indigo-600/5 rounded-[1.5rem] border border-indigo-600/10">
                                    <p className="text-xs text-indigo-700 dark:text-indigo-400 italic">"{radar.sentiment}"</p>
                                </div>
                            </section>

                            <button
                                onClick={confirmLearning}
                                className="w-full py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[1.5rem] text-xs font-black uppercase tracking-widest hover:bg-zinc-50 transition-all flex items-center justify-center gap-3 group"
                            >
                                <ShieldCheck className="w-4 h-4 text-emerald-500 group-hover:scale-125 transition-transform" />
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
