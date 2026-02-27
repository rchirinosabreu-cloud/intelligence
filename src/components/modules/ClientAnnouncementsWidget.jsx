
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Megaphone, AlertCircle, Trophy, Info, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Types Configuration
const TYPES = [
    { id: 'urgent', label: 'URGENTE', icon: AlertCircle, color: 'text-red-500', border: 'border-l-red-500', bg: 'bg-red-500/10' },
    { id: 'win', label: 'LOGRO', icon: Trophy, iconColor: 'text-yellow-500', color: 'text-emerald-500', border: 'border-l-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'info', label: 'INFO', icon: Info, color: 'text-blue-500', border: 'border-l-blue-500', bg: 'bg-blue-500/10' }
];

const ClientAnnouncementsWidget = ({ clientId }) => {
    const [announcements, setAnnouncements] = useState([]);
    const [text, setText] = useState('');
    const [selectedType, setSelectedType] = useState('info');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Announcements
    const fetchAnnouncements = async () => {
        if (!clientId) return;
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/clients/${clientId}/announcements`);
            if (res.ok) {
                const data = await res.json();
                setAnnouncements(data);
            }
        } catch (error) {
            console.error("Error fetching announcements:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnouncements();
    }, [clientId]);

    // Handle Create
    const handleAdd = async () => {
        if (!text.trim() || isSubmitting) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/clients/${clientId}/announcements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: text,
                    type: selectedType
                })
            });

            if (res.ok) {
                const newAnnouncement = await res.json();
                setAnnouncements(prev => [newAnnouncement, ...prev]);
                setText('');
            }
        } catch (error) {
            console.error("Error creating announcement:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper for "Time Ago"
    const getTimeAgo = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const diff = Date.now() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `Hace ${days}d`;
        if (hours > 0) return `Hace ${hours}h`;
        if (minutes > 0) return `Hace ${minutes}m`;
        return 'Ahora';
    };

    return (
        <Card className="w-full flex flex-col relative overflow-hidden group border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700 min-h-[300px]">

            {/* Header */}
            <div className="flex items-center justify-between mb-4 p-4 pb-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                        <Megaphone className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Anuncios del Cliente</h3>
                </div>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto space-y-3 p-4 pt-0">
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400"/></div>
                ) : announcements.length === 0 ? (
                    <div className="min-h-[120px] flex flex-col items-center justify-center text-center p-4 opacity-50">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Sin anuncios recientes</p>
                        <p className="text-xs text-zinc-400">Publica actualizaciones importantes aquí.</p>
                    </div>
                ) : (
                    <AnimatePresence mode='popLayout'>
                        {announcements.map((item) => {
                            const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];

                            return (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    className={cn(
                                        "relative group/card p-3 rounded-xl border bg-white dark:bg-zinc-950/50 shadow-sm",
                                        "border-l-4",
                                        typeConfig.border,
                                        "border-t-zinc-100 border-r-zinc-100 border-b-zinc-100 dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800"
                                    )}
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={cn("text-[10px] uppercase font-bold flex items-center gap-1", typeConfig.color)}>
                                                    {item.type === 'win' && '🏆'} {typeConfig.label}
                                                </span>
                                                <span className="text-[10px] text-zinc-400">• {getTimeAgo(item.createdAt)}</span>
                                            </div>
                                            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug break-words whitespace-pre-wrap">
                                                {item.content}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
                <div className="flex flex-col gap-3">
                    {/* Text Input */}
                    <div className="relative">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAdd();
                                }
                            }}
                            disabled={isSubmitting}
                            placeholder="Escribe un anuncio..."
                            className="w-full bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-3 pr-10 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none min-h-[60px]"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!text.trim() || isSubmitting}
                            className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-white transition-colors h-7 w-7 flex items-center justify-center"
                        >
                            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3" />}
                        </button>
                    </div>

                    {/* Type Selector */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {TYPES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedType(t.id)}
                                disabled={isSubmitting}
                                className={cn(
                                    "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5 whitespace-nowrap",
                                    selectedType === t.id
                                        ? cn(t.bg, t.color, "border-transparent ring-1 ring-inset", t.id === 'urgent' ? 'ring-red-500' : t.id === 'win' ? 'ring-emerald-500' : 'ring-blue-500')
                                        : "bg-transparent border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                )}
                            >
                                {t.id === 'urgent' && <AlertCircle className="w-3 h-3" />}
                                {t.id === 'win' && <Trophy className="w-3 h-3" />}
                                {t.id === 'info' && <Info className="w-3 h-3" />}
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ClientAnnouncementsWidget;
