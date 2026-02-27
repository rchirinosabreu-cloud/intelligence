
import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Flame, Maximize, X, Send, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import * as Dialog from '@radix-ui/react-dialog';

// Team Configuration
const TEAM = [
    { name: 'Claudia', initial: 'CL', color: 'bg-red-500' },
    { name: 'Helen', initial: 'HE', color: 'bg-blue-500' },
    { name: 'Rodny', initial: 'RO', color: 'bg-green-500' },
    { name: 'Jarlan', initial: 'JA', color: 'bg-amber-500' },
    { name: 'Francisco', initial: 'FR', color: 'bg-purple-500' },
    { name: 'Camila', initial: 'CA', color: 'bg-pink-500' },
    { name: 'Elisa', initial: 'EL', color: 'bg-rose-500' },
    { name: 'Melissa', initial: 'ME', color: 'bg-orange-500' }
];

const CampfireWidget = ({ clientId }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [content, setContent] = useState('');
    const [author, setAuthor] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Messages
    const fetchMessages = async () => {
        if (!clientId) return;
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/clients/${clientId}/campfire`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (error) {
            console.error("Error fetching campfire messages:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();
    }, [clientId]);

    const handleSendMessage = async () => {
        if (!content.trim() || !author || isSubmitting) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/clients/${clientId}/campfire`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, author })
            });

            if (res.ok) {
                const newMessage = await res.json();
                setMessages(prev => [newMessage, ...prev]);
                setContent('');
                // Keep author selected
            }
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getAuthorStyle = (name) => {
        return TEAM.find(t => t.name === name) || { initial: '??', color: 'bg-gray-500' };
    };

    const formatTimestamp = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <>
            {/* WIDGET CARD */}
            <Card className="w-full flex flex-col h-full min-h-[300px] p-6 relative group overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-500/10 rounded-lg">
                            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">Campfire</h3>
                    </div>
                </div>

                <div className="flex-1 space-y-4 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-zinc-400"/></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-8 text-zinc-400 text-xs">
                            El fuego está apagado. Inicia la conversación.
                        </div>
                    ) : (
                        messages.slice(0, 3).map(msg => {
                            const style = getAuthorStyle(msg.author);
                            return (
                                <div key={msg.id} className="flex gap-3">
                                    <div className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5",
                                        style.color
                                    )}>
                                        {style.initial}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-zinc-900 dark:text-white mb-0.5">
                                            {msg.author}
                                        </p>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                                            {msg.content}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full py-2 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        Abrir Chat
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </Card>

            {/* EXPANDED MODAL */}
            <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                    <Dialog.Content className="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-500/10 rounded-xl">
                                    <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
                                </div>
                                <div>
                                    <Dialog.Title className="text-lg font-bold text-zinc-900 dark:text-white">
                                        Campfire
                                    </Dialog.Title>
                                    <p className="text-xs text-zinc-500">Chat operativo del equipo</p>
                                </div>
                            </div>
                            <Dialog.Close asChild>
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </Dialog.Close>
                        </div>

                        {/* Messages List (Scrollable) */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 dark:bg-zinc-900/20 flex flex-col-reverse">
                            {/* Flex-col-reverse allows auto-scroll to bottom behavior logic,
                                but messages are ordered desc (newest first).
                                So simple mapping is fine if we want newest at top.
                                User asked for "Historial completo". Usually chat is oldest at top, newest at bottom.
                                But if I map desc (newest first), the top of the list is the newest.
                                For a "Campfire" log, typically newest is at top or bottom.
                                Let's stick to standard feed: Newest at top of the container.
                            */}
                            {messages.map((msg) => {
                                const style = getAuthorStyle(msg.author);
                                return (
                                    <div key={msg.id} className="flex gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm",
                                            style.color
                                        )}>
                                            {style.initial}
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl rounded-tl-none shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white">{msg.author}</span>
                                                <span className="text-[10px] text-zinc-400 uppercase tracking-wide">
                                                    {formatTimestamp(msg.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                {msg.content}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input Area (Fixed at Bottom) */}
                        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                            <div className="flex gap-2 mb-2">
                                <select
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500/20"
                                >
                                    <option value="">Selecciona tu nombre...</option>
                                    {TEAM.map(t => (
                                        <option key={t.name} value={t.name}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="relative">
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Escribe un mensaje..."
                                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-4 pr-12 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none min-h-[50px]"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!content.trim() || !author || isSubmitting}
                                    className="absolute right-2 bottom-2 p-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-white transition-colors h-8 w-8 flex items-center justify-center shadow-sm"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
};

export default CampfireWidget;
