
import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Send, Loader2, ArrowRight, MessageSquare } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import SlideOver from '@/components/ui/SlideOver';
import { useAuth } from "@/context/AuthContext";

const ChatWidget = ({
    title = "Chat de Equipo",
    description = "Chat operativo del equipo",
    apiEndpoint = "/api/general-chat",
    isGlobal = true,
    clientId = null,
    fullInterface = false
}) => {
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const inputRef = useRef(null);

    // Fetch Team
    useEffect(() => {
        fetch(`${getApiBaseUrl()}/api/team`)
            .then(res => res.json())
            .then(data => setTeamMembers(data))
            .catch(err => console.error("Error fetching team:", err));
    }, []);

    // Fetch Messages
    const fetchMessages = async () => {
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}${apiEndpoint}`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (error) {
            console.error("Error fetching chat messages:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isGlobal || clientId) {
            fetchMessages();
        }
    }, [clientId, apiEndpoint]);

    const handleSendMessage = async () => {
        if (!content.trim() || isSubmitting) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();

            // Format content to replace human-readable mentions with data-mentions if needed?
            // Actually, we'll send it as is and the backend will parse the @[Name](ID) format.

            const res = await fetch(`${baseUrl}${apiEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                const newMessage = await res.json();
                setMessages(prev => [newMessage, ...prev]);
                setContent('');
            }
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    // Link & Mention Parser Helper
    const renderContentWithLinks = (text) => {
        if (!text) return null;

        // Matches @[Name](ID)
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        // Matches URLs
        const urlRegex = /((?:https?:\/\/|www\.)[^\s]+)/g;

        // We handle mentions first, then URLs
        const parts = [];
        let lastIndex = 0;
        let match;

        // Combined regex for easier splitting? No, let's keep it simple.
        // First split by mentions
        const segments = [];
        let mMatch;
        while ((mMatch = mentionRegex.exec(text)) !== null) {
            if (mMatch.index > lastIndex) {
                segments.push({ type: 'text', value: text.substring(lastIndex, mMatch.index) });
            }
            segments.push({ type: 'mention', name: mMatch[1], id: mMatch[2] });
            lastIndex = mMatch.index + mMatch[0].length;
        }
        if (lastIndex < text.length) {
            segments.push({ type: 'text', value: text.substring(lastIndex) });
        }

        return segments.map((segment, idx) => {
            if (segment.type === 'mention') {
                return (
                    <span key={idx} className="font-bold text-primary px-1 bg-primary/5 rounded">
                        @{segment.name}
                    </span>
                );
            }

            // For text segments, split by URL
            const textValue = segment.value;
            const subParts = textValue.split(urlRegex);
            return subParts.map((part, pIdx) => {
                if (part.match(urlRegex)) {
                    let href = part;
                    if (part.startsWith('www.')) href = `https://${part}`;
                    return (
                        <a key={`${idx}-${pIdx}`} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                            {part}
                        </a>
                    );
                }
                return part;
            });
        });
    };

    const getGroupedMessages = () => {
        const groups = {};
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const isSameDay = (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

        const sortedMessages = [...messages].reverse();
        sortedMessages.forEach(msg => {
            const d = new Date(msg.createdAt);
            let dateKey = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
            if (isSameDay(d, today)) dateKey = 'HOY';
            else if (isSameDay(d, yesterday)) dateKey = 'AYER';
            dateKey = dateKey.toUpperCase();
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(msg);
        });
        return groups;
    };

    const groupedMessages = getGroupedMessages();
    const scrollRef = useRef(null);
    useEffect(() => {
        if (isModalOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isModalOpen, messages]);

    // --- MENTIONS UX LOGIC ---
    const handleInputChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;
        setContent(value);
        setCursorPosition(pos);

        // Check if we are typing a mention
        const textBeforeCursor = value.substring(0, pos);
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt !== -1) {
            const query = textBeforeCursor.substring(lastAt + 1);
            // Only show if there's no space between @ and cursor
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
        const lastAt = content.lastIndexOf('@', cursorPosition - 1);
        const textBeforeAt = content.substring(0, lastAt);
        const textAfterCursor = content.substring(cursorPosition);

        // Format: @[Name](ID) - Backend will parse this
        const newContent = `${textBeforeAt}@[${member.name}](${member.id}) ${textAfterCursor}`;
        setContent(newContent);
        setShowMentionDropdown(false);

        // Refocus and set cursor
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                // Cursor should be after the space we'll add or just after the closing )
                const newPos = textBeforeAt.length + member.name.length + member.id.length + 5; // @[name](id)
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        }, 10);
    };

    const filteredMembers = (teamMembers || []).filter(m =>
        m && m.name && m.name.toLowerCase().includes(mentionQuery.toLowerCase()) && m.isActive !== false
    );

    const renderMessageList = (isModal = false) => {
        const sortedGroups = getGroupedMessages();
        return (
            <div className="space-y-8 pb-4">
                {Object.keys(sortedGroups).map(dateKey => (
                    <div key={dateKey} className="relative">
                        <div className={cn("sticky top-0 z-10 flex justify-center mb-6", isModal ? "" : "bg-white dark:bg-zinc-900 py-1")}>
                            <span className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wider">
                                {dateKey}
                            </span>
                        </div>
                        <div className="space-y-6">
                            {sortedGroups[dateKey].map((msg) => (
                                <div key={msg.id} className="flex gap-4 group">
                                    <TeamAvatar member={msg.author} className={cn("mt-1", isModal ? "w-10 h-10" : "w-8 h-8")} />
                                    <div className={cn(
                                        "flex-1 border p-3 rounded-2xl rounded-tl-none shadow-sm hover:shadow-md transition-shadow",
                                        "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                                    )}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-zinc-900 dark:text-white">{msg.author?.name}</span>
                                            <span className="text-[10px] text-zinc-400 group-hover:text-zinc-500 transition-colors">
                                                {formatTime(msg.createdAt)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                            {renderContentWithLinks(msg.content)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderInputArea = () => (
        <div className="relative">
            {/* Mentions Dropdown */}
            {showMentionDropdown && filteredMembers.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mencionar a...</span>
                    </div>
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

            <div className="relative">
                <textarea
                    ref={inputRef}
                    value={content}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                        if (e.key === 'Escape') setShowMentionDropdown(false);
                    }}
                    placeholder="Escribe un mensaje..."
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-4 pr-12 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none min-h-[50px]"
                />
                <button
                    onClick={handleSendMessage}
                    disabled={!content.trim() || isSubmitting}
                    className="absolute right-2 bottom-2 p-1.5 bg-primary hover:bg-primary/90 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 rounded-lg text-primary-foreground transition-colors h-8 w-8 flex items-center justify-center shadow-sm"
                >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );

    if (fullInterface) {
        return (
            <Card className="w-full flex flex-col p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 h-full">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                            <MessageSquare className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
                    </div>
                </div>

                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto mb-4 pr-2 h-[350px] scroll-smooth"
                >
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400"/></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-12 text-zinc-400 text-xs italic">
                            No hay mensajes aún. ¡Sé el primero en hablar!
                        </div>
                    ) : (
                        renderMessageList(false)
                    )}
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    {renderInputArea()}
                </div>
            </Card>
        );
    }

    return (
        <>
            <Card className="w-full flex flex-col h-full min-h-[300px] p-6 relative group overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                            <MessageSquare className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
                    </div>
                </div>

                <div className="flex-1 space-y-4 overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-zinc-400"/></div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-8 text-zinc-400 text-xs">
                            No hay mensajes aún. ¡Inicia la conversación!
                        </div>
                    ) : (
                        messages.slice(0, 3).map(msg => {
                            const author = msg.author;
                            return (
                                <div key={msg.id} className="flex gap-3">
                                    <TeamAvatar member={author} className="w-6 h-6 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-baseline">
                                            <p className="text-xs font-bold text-zinc-900 dark:text-white mb-0.5 truncate">
                                                {author?.name || 'Desconocido'}
                                            </p>
                                            <span className="text-[10px] text-zinc-400">{formatTime(msg.createdAt)}</span>
                                        </div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                                            {msg.content.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1')}
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

            <SlideOver
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                title={title}
                description={description}
                icon={<MessageSquare className="w-5 h-5 text-primary fill-primary" />}
                iconBgColor="bg-primary/10"
            >
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 bg-zinc-50/50 dark:bg-zinc-900/20">
                    {renderMessageList(true)}
                </div>

                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mt-auto relative">
                    {renderInputArea()}
                </div>
            </SlideOver>
        </>
    );
};

export default ChatWidget;
