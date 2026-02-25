import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Megaphone, AlertCircle, Trophy, Info, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Mock User (Pending Auth)
const CURRENT_USER = {
    name: 'Team Lead',
    avatar: '/brainstudio-logo.png'
};

const TYPES = [
    { id: 'urgent', label: 'URGENTE', icon: AlertCircle, color: 'text-red-500', border: 'border-l-red-500', bg: 'bg-red-500/10' },
    { id: 'win', label: 'LOGRO', icon: Trophy, iconColor: 'text-yellow-500', color: 'text-emerald-500', border: 'border-l-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'info', label: 'INFO', icon: Info, color: 'text-blue-500', border: 'border-l-blue-500', bg: 'bg-blue-500/10' }
];

const StudioBroadcastWidget = ({ clientId = null }) => {
    const [announcements, setAnnouncements] = useState([]);
    const [text, setText] = useState('');
    const [selectedType, setSelectedType] = useState('info');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const baseUrl = getApiBaseUrl();

    // Fetch Broadcasts
    const fetchBroadcasts = async () => {
        try {
            setLoading(true);
            const query = clientId ? `?clientId=${clientId}` : '';
            const res = await fetch(`${baseUrl}/api/broadcasts${query}`);
            if (!res.ok) throw new Error('Failed to fetch broadcasts');
            const data = await res.json();
            setAnnouncements(data);
        } catch (err) {
            console.error(err);
            setError('Error cargando anuncios.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBroadcasts();
    }, [clientId]);

    const handleAdd = async () => {
        if (!text.trim()) return;

        // Optimistic UI Update (Optional, but let's stick to simple first)
        try {
            const payload = {
                content: text.slice(0, 140),
                type: selectedType,
                clientId: clientId, // Can be null
                authorName: CURRENT_USER.name,
                authorAvatar: CURRENT_USER.avatar
            };

            const res = await fetch(`${baseUrl}/api/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to create broadcast');

            await fetchBroadcasts(); // Refresh list
            setText('');
            setError(null);
        } catch (err) {
            setError('Error publicando anuncio.');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este anuncio?')) return;
        try {
            const res = await fetch(`${baseUrl}/api/broadcasts/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete broadcast');

            // Optimistic Remove
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            alert('Error eliminando anuncio.');
        }
    };

    const isFull = announcements.length >= 20; // Soft limit for UI cleanliness

    // Helper for "Time Ago"
    const getTimeAgo = (timestamp) => {
        const diff = Date.now() - new Date(timestamp).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `Hace ${days}d`;
        if (hours > 0) return `Hace ${hours}h`;
        if (minutes > 0) return `Hace ${minutes}m`;
        return 'Ahora';
    };

    return (
        <Card className="flex flex-col relative overflow-hidden group h-full border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700">

            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                        <Megaphone className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Anuncios</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700">
                        {announcements.length}
                    </span>
                </div>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[200px] scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700">
                <AnimatePresence mode='popLayout'>
                    {loading ? (
                         <div className="flex flex-col items-center justify-center h-32 opacity-50">
                             <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                             <span className="text-xs text-zinc-400">Cargando...</span>
                         </div>
                    ) : announcements.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center p-4 opacity-50 min-h-[150px]"
                        >
                            <div className="mb-2">
                                <img src="/chill.png" alt="Chill" className="w-16 h-16 object-contain opacity-80 hover:scale-110 transition-transform duration-700" />
                            </div>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Todo tranquilo en Brain...</p>
                            <p className="text-xs text-zinc-400">Comparte una actualización.</p>
                        </motion.div>
                    ) : (
                        announcements.map((item) => {
                            const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];

                            return (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={cn(
                                        "relative group/card p-3 rounded-xl border bg-white dark:bg-zinc-950/50 shadow-sm",
                                        "border-l-4",
                                        typeConfig.border,
                                        "border-t-zinc-100 border-r-zinc-100 border-b-zinc-100 dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800"
                                    )}
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex gap-3 w-full">
                                            <img src={item.authorAvatar || '/brainstudio-logo.png'} alt="Avatar" className="w-8 h-8 bg-white rounded-full border border-black/10 object-contain p-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{item.authorName || 'Team Lead'}</span>
                                                    <span className={cn("text-[10px] uppercase font-bold flex items-center gap-1 shrink-0", typeConfig.color)}>
                                                        {item.type === 'win' && '🏆'} {typeConfig.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug break-words whitespace-pre-wrap">
                                                    {item.content}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className="text-[10px] text-zinc-400 whitespace-nowrap">{getTimeAgo(item.createdAt)}</span>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="opacity-0 group-hover/card:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 p-1"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="flex flex-col gap-2">
                    {/* Text Input */}
                    <div className="relative">
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            maxLength={140}
                            placeholder="¿Qué está pasando?"
                            className="w-full bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-3 pr-10 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 h-9"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!text.trim()}
                            className="absolute right-1 top-1 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-white transition-colors h-7 w-7 flex items-center justify-center"
                        >
                            <Send className="w-3 h-3" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        {/* Type Selector */}
                        <div className="flex gap-1.5 flex-1">
                            {TYPES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedType(t.id)}
                                    className={cn(
                                        "flex-1 py-1 px-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1 h-6",
                                        selectedType === t.id
                                            ? cn(t.bg, t.color, "border-transparent ring-1 ring-inset", t.id === 'urgent' ? 'ring-red-500' : t.id === 'win' ? 'ring-emerald-500' : 'ring-blue-500')
                                            : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                    )}
                                >
                                    {t.id === 'urgent' && <AlertCircle className="w-2.5 h-2.5" />}
                                    {t.id === 'win' && <Trophy className="w-2.5 h-2.5" />}
                                    {t.id === 'info' && <Info className="w-2.5 h-2.5" />}
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Char Counter */}
                        <span className={cn(
                            "text-[9px]",
                            text.length > 120 ? "text-red-500 font-bold" : "text-zinc-400"
                        )}>
                            {text.length}/140
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default StudioBroadcastWidget;
