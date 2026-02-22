
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Megaphone, AlertCircle, Trophy, Info, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

// Mock User
const CURRENT_USER = {
    name: 'Tú',
    avatar: 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff'
};

const TYPES = [
    { id: 'urgent', label: 'Urgente', icon: AlertCircle, color: 'text-red-500', border: 'border-l-red-500', bg: 'bg-red-500/10' },
    { id: 'win', label: 'Win', icon: Trophy, iconColor: 'text-yellow-500', color: 'text-emerald-500', border: 'border-l-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'info', label: 'Info', icon: Info, color: 'text-blue-500', border: 'border-l-blue-500', bg: 'bg-blue-500/10' }
];

const StudioBroadcastWidget = () => {
    const [announcements, setAnnouncements] = useState([]);
    const [text, setText] = useState('');
    const [selectedType, setSelectedType] = useState('info');
    const [error, setError] = useState(null);

    // Load & Cleanup on Mount
    useEffect(() => {
        const stored = localStorage.getItem('brain_broadcasts');
        if (stored) {
            const parsed = JSON.parse(stored);
            // 24h Cleanup Logic
            const now = Date.now();
            const valid = parsed.filter(a => (now - a.timestamp) < 24 * 60 * 60 * 1000);
            setAnnouncements(valid);
            if (valid.length !== parsed.length) {
                localStorage.setItem('brain_broadcasts', JSON.stringify(valid));
            }
        }
    }, []);

    // Save on Change
    useEffect(() => {
        localStorage.setItem('brain_broadcasts', JSON.stringify(announcements));
    }, [announcements]);

    const handleAdd = () => {
        if (!text.trim()) return;
        if (announcements.length >= 5) {
            setError("Tablero lleno. Elimina un anuncio antiguo.");
            return;
        }

        const newAnnouncement = {
            id: Date.now(),
            text: text.slice(0, 140),
            type: selectedType,
            author: CURRENT_USER,
            timestamp: Date.now()
        };

        setAnnouncements(prev => [newAnnouncement, ...prev]);
        setText('');
        setError(null);
    };

    const handleClear = () => {
        if (confirm('¿Limpiar todo el tablero?')) {
            setAnnouncements([]);
        }
    };

    const handleDelete = (id) => {
        setAnnouncements(prev => prev.filter(a => a.id !== id));
    };

    const isFull = announcements.length >= 5;

    // Helper for "Time Ago"
    const getTimeAgo = (timestamp) => {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `Hace ${hours}h`;
        if (minutes > 0) return `Hace ${minutes}m`;
        return 'Ahora';
    };

    return (
        <Card className="h-full flex flex-col relative overflow-hidden group border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700">

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                        <Megaphone className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Studio Broadcast</h3>
                    <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
                        isFull
                            ? "bg-red-500/10 text-red-500 border-red-500/20"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700"
                    )}>
                        {announcements.length}/5
                    </span>
                </div>
                {announcements.length > 0 && (
                    <button
                        onClick={handleClear}
                        className="text-xs text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-500/10"
                        title="Limpiar tablero"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto min-h-[200px] space-y-3 pr-1 custom-scrollbar">
                <AnimatePresence mode='popLayout'>
                    {announcements.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center p-4 opacity-50"
                        >
                            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
                                <span className="text-xl">🍃</span>
                            </div>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Todo tranquilo en Brain...</p>
                            <p className="text-xs text-zinc-400">Comparte una actualización.</p>
                        </motion.div>
                    ) : (
                        announcements.map((item) => {
                            const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];
                            const TypeIcon = typeConfig.icon;

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
                                        <div className="flex gap-3">
                                            <img src={item.author.avatar} alt="Avatar" className="w-8 h-8 rounded-full bg-zinc-200 ring-2 ring-white dark:ring-zinc-900" />
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-xs font-bold text-zinc-900 dark:text-white">{item.author.name}</span>
                                                    <span className={cn("text-[10px] uppercase font-bold flex items-center gap-1", typeConfig.color)}>
                                                        {item.type === 'win' && '🏆'} {typeConfig.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug break-words max-w-[200px] sm:max-w-full">
                                                    {item.text}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[10px] text-zinc-400 whitespace-nowrap">{getTimeAgo(item.timestamp)}</span>
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
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {isFull && !error && (
                    <div className="mb-2 text-xs text-center text-amber-500 font-medium bg-amber-500/10 py-1 rounded">
                        Tablero lleno (máx 5).
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {/* Type Selector */}
                    <div className="flex gap-2">
                        {TYPES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => !isFull && setSelectedType(t.id)}
                                disabled={isFull}
                                className={cn(
                                    "flex-1 py-1 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1",
                                    selectedType === t.id
                                        ? cn(t.bg, t.color, "border-transparent ring-1 ring-inset", t.id === 'urgent' ? 'ring-red-500' : t.id === 'win' ? 'ring-emerald-500' : 'ring-blue-500')
                                        : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800",
                                    isFull && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                {t.id === 'urgent' && <AlertCircle className="w-3 h-3" />}
                                {t.id === 'win' && <Trophy className="w-3 h-3" />}
                                {t.id === 'info' && <Info className="w-3 h-3" />}
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Text Input */}
                    <div className="relative">
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            maxLength={140}
                            disabled={isFull}
                            placeholder={isFull ? "Límite alcanzado" : "¿Qué está pasando?"}
                            className="w-full bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 pl-3 pr-10 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!text.trim() || isFull}
                            className="absolute right-1.5 top-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-white transition-colors"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Char Counter */}
                    <div className="flex justify-end px-1">
                        <span className={cn(
                            "text-[10px]",
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
