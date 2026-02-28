
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Megaphone, AlertCircle, Trophy, Info, X, Loader2, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import SlideOver from '@/components/ui/SlideOver';

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
    const [isModalOpen, setIsModalOpen] = useState(false);

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

    // Helper for grouping by date (Today, Yesterday, Date)
    const getGroupedAnnouncements = () => {
        const groups = {};
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const isSameDay = (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

        announcements.forEach(a => {
            const d = new Date(a.createdAt);
            let key = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

            if (isSameDay(d, today)) key = 'Hoy';
            else if (isSameDay(d, yesterday)) key = 'Ayer';

            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        });

        return groups; // Object { "Hoy": [...], "15 feb": [...] }
    };

    const grouped = getGroupedAnnouncements();
    // Sort keys manually to ensure Hoy/Ayer come first if default sorting fails?
    // Object.keys order isn't guaranteed but usually insertion order works if we process sorted array.
    // Announcements are sorted desc by default from backend. So keys will be inserted in order (Newest -> Oldest).

    return (
        <>
            {/* COMPACT WIDGET VIEW */}
            <Card className="w-full flex flex-col relative overflow-hidden group border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700 h-full max-h-[350px]">

                {/* Header */}
                <div className="flex items-center justify-between mb-4 p-4 pb-0">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                            <Megaphone className="w-4 h-4 text-indigo-500" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Anuncios</h3>
                    </div>
                </div>

                {/* Compact List (Max 3) */}
                <div className="flex-1 overflow-hidden space-y-3 p-4 pt-0">
                    {loading ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-zinc-400"/></div>
                    ) : announcements.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-2 opacity-50">
                            <p className="text-xs text-zinc-400">No hay anuncios recientes.</p>
                        </div>
                    ) : (
                        announcements.slice(0, 3).map((item) => {
                            const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];
                            return (
                                <div key={item.id} className="relative pl-3 border-l-2 border-zinc-100 dark:border-zinc-800 py-1">
                                    <div className={cn("absolute left-[-2px] top-1.5 w-1 h-4 rounded-r-full", typeConfig.bg.replace('/10', ''))} />
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={cn("text-[9px] uppercase font-bold", typeConfig.color)}>
                                            {typeConfig.label}
                                        </span>
                                        <span className="text-[9px] text-zinc-400">• {getTimeAgo(item.createdAt)}</span>
                                    </div>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug line-clamp-2">
                                        {item.content}
                                    </p>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        Ver historial o crear anuncio
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </Card>

            {/* EXPANDED MODAL VIEW (Basecamp Style) */}
            <SlideOver
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title="Tablero de Anuncios"
                description="Historial completo y actualizaciones"
                icon={<Megaphone className="w-5 h-5 text-indigo-500" />}
                iconBgColor="bg-indigo-500/10"
            >
                {/* Modal Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-zinc-50/50 dark:bg-zinc-900/20">

                    {/* Creation Area (Top) */}
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Nuevo Mensaje</span>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Escribe una actualización detallada..."
                                    className="w-full bg-transparent border-none p-0 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:ring-0 resize-none min-h-[100px]"
                                />
                                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                    <div className="flex gap-2">
                                        {TYPES.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => setSelectedType(t.id)}
                                                disabled={isSubmitting}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5",
                                                    selectedType === t.id
                                                        ? cn(t.bg, t.color, "border-transparent ring-1 ring-inset", t.id === 'urgent' ? 'ring-red-500' : t.id === 'win' ? 'ring-emerald-500' : 'ring-blue-500')
                                                        : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                                )}
                                            >
                                                {t.id === 'urgent' && <AlertCircle className="w-3 h-3" />}
                                                {t.id === 'win' && <Trophy className="w-3 h-3" />}
                                                {t.id === 'info' && <Info className="w-3 h-3" />}
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleAdd}
                                        disabled={!text.trim() || isSubmitting}
                                        className="px-4 py-2 bg-primary hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-white text-xs font-bold transition-all flex items-center gap-2"
                                    >
                                        {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3" />}
                                        PUBLICAR
                                    </button>
                                </div>
                            </div>

                            {/* History Timeline */}
                            <div className="space-y-8 relative">
                                {/* Vertical Line */}
                                <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800 -z-10" />

                                {Object.keys(grouped).map(dateKey => (
                                    <div key={dateKey} className="relative">
                                        {/* Date Header */}
                                        <div className="sticky top-0 z-10 py-2 bg-zinc-50/50 dark:bg-zinc-900/20 backdrop-blur-sm mb-4">
                                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                                {dateKey}
                                            </span>
                                        </div>

                                        {/* Items */}
                                        <div className="space-y-4 pl-8">
                                            {grouped[dateKey].map(item => {
                                                const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];
                                                return (
                                                    <div key={item.id} className="group relative bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                                                        {/* Avatar/Icon Indicator on Line */}
                                                        <div className={cn(
                                                            "absolute -left-12 top-6 w-8 h-8 rounded-full flex items-center justify-center border-4 border-zinc-50 dark:border-black",
                                                            typeConfig.bg, typeConfig.color
                                                        )}>
                                                            <typeConfig.icon className="w-4 h-4" />
                                                        </div>

                                                        <div className="flex items-center gap-3 mb-3">
                                                            <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-md", typeConfig.bg, typeConfig.color)}>
                                                                {typeConfig.label}
                                                            </span>
                                                            <span className="text-xs text-zinc-400">{new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                        </div>

                                                        <div className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                                                            {item.content}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                    </div>

                </div>
            </SlideOver>
        </>
    );
};

export default ClientAnnouncementsWidget;
