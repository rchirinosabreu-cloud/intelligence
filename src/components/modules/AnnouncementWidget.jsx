
import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect, useRef } from 'react';
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

const AnnouncementWidget = ({ scope = "client", clientId = null }) => {
    const [announcements, setAnnouncements] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [text, setText] = useState('');
    const [selectedType, setSelectedType] = useState('info');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [mentionMap, setMentionMap] = useState({}); // { "@Name": "ID" }
    const inputRef = useRef(null);

    // Endpoint mapping
    const getEndpoint = () => {
        const baseUrl = getApiBaseUrl();
        if (scope === "general") return `${baseUrl}/api/global-announcements`;
        return `${baseUrl}/api/clients/${clientId}/announcements`;
    };

    // Fetch Team for Mentions
    useEffect(() => {
        fetch(`${getApiBaseUrl()}/api/team`)
            .then(res => res.json())
            .then(data => setTeamMembers(Array.isArray(data) ? data : []))
            .catch(err => console.error("Error fetching team:", err));
    }, []);

    // Fetch Announcements
    const fetchAnnouncements = async (isPolling = false) => {
        if (scope === "client" && !clientId) return;
        try {
            if (!isPolling) setLoading(true);
            const res = await fetch(getEndpoint(), { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setAnnouncements(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            if (!isPolling) console.error("Error fetching announcements:", error);
        } finally {
            if (!isPolling) setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnouncements();

        // Polling interval (15 seconds)
        const intervalId = setInterval(() => {
            fetchAnnouncements(true);
        }, 15000);

        return () => clearInterval(intervalId);
    }, [clientId, scope]);

    // Handle Create
    const handleAdd = async () => {
        if (!text.trim() || isSubmitting) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();

            // Convert human-readable @Name to @[Name](ID)
            let formattedContent = text;
            Object.entries(mentionMap).forEach(([displayName, id]) => {
                const regex = new RegExp(`${displayName}\\b`, 'g');
                formattedContent = formattedContent.replace(regex, `@[${displayName.substring(1)}](${id})`);
            });

            const res = await fetch(getEndpoint(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: formattedContent,
                    type: selectedType
                })
            });

            if (res.ok) {
                const newAnnouncement = await res.json();
                setAnnouncements(prev => [newAnnouncement, ...prev].slice(0, scope === 'general' ? 5 : 50));
                setText('');
                setMentionMap({});
                if (scope === 'general') fetchAnnouncements(); // Refresh for cleanup logic
            }
        } catch (error) {
            console.error("Error creating announcement:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (scope !== 'general') return;
        if (!confirm('¿Eliminar este anuncio?')) return;

        const prev = [...announcements];
        setAnnouncements(prev.filter(a => a.id !== id));

        try {
            const baseUrl = getApiBaseUrl();
            await fetch(`${baseUrl}/api/global-announcements/${id}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error("Error deleting announcement:", error);
            setAnnouncements(prev);
        }
    };

    // --- MENTIONS UX LOGIC ---
    const handleInputChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;
        setText(value);
        setCursorPosition(pos);

        const textBeforeCursor = value.substring(0, pos);
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1);
            if (!query.includes(' ')) {
                setMentionQuery(query);
                setShowMentionDropdown(true);
            } else {
                setShowMentionDropdown(false);
            }
        } else {
            setShowMentionDropdown(false);
        }
    };

    const insertMention = (member) => {
        const lastAt = text.lastIndexOf('@', cursorPosition - 1);
        const textBeforeAt = text.substring(0, lastAt);
        const textAfterCursor = text.substring(cursorPosition);

        const displayName = `@${member.name}`;
        const newContent = `${textBeforeAt}${displayName} ${textAfterCursor}`;

        setText(newContent);
        setMentionMap(prev => ({ ...prev, [displayName]: member.id }));
        setShowMentionDropdown(false);

        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const newPos = textBeforeAt.length + displayName.length + 1;
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        }, 10);
    };

    const filteredMembers = (teamMembers || []).filter(m =>
        m && m.name && m.name.toLowerCase().includes(mentionQuery.toLowerCase()) && m.isActive !== false
    );

    const renderContentWithLinks = (contentText) => {
        if (!contentText) return null;
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        const parts = contentText.split(mentionRegex);

        const result = [];
        for (let i = 0; i < parts.length; i++) {
            if (i % 3 === 0) {
                result.push(parts[i]);
            } else if (i % 3 === 1) {
                result.push(
                    <span key={i} className="font-bold text-primary bg-primary/5 px-1 rounded">
                        @{parts[i]}
                    </span>
                );
            }
            // skip parts[i] % 3 === 2 as it is the ID
        }
        return result;
    };

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
        return groups;
    };

    const grouped = getGroupedAnnouncements();

    return (
        <>
            <Card className="w-full flex flex-col relative overflow-hidden group border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700 h-full max-h-[350px]">
                <div className="flex items-center justify-between mb-4 p-4 pb-0">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-600/10 rounded-xl">
                            <Megaphone className="w-4 h-4 text-indigo-600" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">
                            {scope === 'general' ? 'Anuncios importantes' : 'Anuncios'}
                        </h3>
                    </div>
                </div>

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
                                        {item.content.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1')}
                                    </p>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        Ver historial o crear anuncio
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </Card>

            <SlideOver
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={scope === 'general' ? "Anuncios de la agencia" : "Tablero de anuncios"}
                description="Historial completo y actualizaciones"

                iconBgColor="bg-indigo-600/10"
            >
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-zinc-50/50 dark:bg-zinc-900/20">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-4 relative">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Nuevo mensaje</span>
                        </div>

                        {showMentionDropdown && filteredMembers.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                                <div className="max-h-48 overflow-y-auto">
                                    {filteredMembers.map(member => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => insertMention(member)}
                                            className="w-full flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-left"
                                        >
                                            <TeamAvatar member={member} className="w-6 h-6" />
                                            <div>
                                                <p className="text-xs font-bold text-zinc-900 dark:text-white">{member.name}</p>
                                                <p className="text-[10px] text-zinc-500 truncate">{member.role}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <textarea
                            ref={inputRef}
                            value={text}
                            onChange={handleInputChange}
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
                                            "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1.5",
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
                                className="px-4 py-2 bg-primary hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-xl text-white text-xs font-bold transition-all flex items-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3" />}
                                PUBLICAR
                            </button>
                        </div>
                    </div>

                    <div className="space-y-8 relative">
                        <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800 -z-10" />
                        {Object.keys(grouped).map(dateKey => (
                            <div key={dateKey} className="relative">
                                <div className="sticky top-0 z-10 py-2 bg-zinc-50/50 dark:bg-zinc-900/20 backdrop-blur-sm mb-4">
                                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                        {dateKey}
                                    </span>
                                </div>
                                <div className="space-y-4 pl-8">
                                    {grouped[dateKey].map(item => {
                                        const typeConfig = TYPES.find(t => t.id === item.type) || TYPES[2];
                                        return (
                                            <div key={item.id} className="group relative bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                                                <div className={cn(
                                                    "absolute -left-12 top-6 w-8 h-8 rounded-full flex items-center justify-center border-4 border-zinc-50 dark:border-black",
                                                    typeConfig.bg, typeConfig.color
                                                )}>
                                                    <typeConfig.icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-md", typeConfig.bg, typeConfig.color)}>
                                                            {typeConfig.label}
                                                        </span>
                                                        <span className="text-xs text-zinc-400">{new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                    {scope === 'general' && (
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-opacity"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                                                    {renderContentWithLinks(item.content)}
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

export default AnnouncementWidget;
