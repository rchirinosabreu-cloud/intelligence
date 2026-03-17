
import TeamAvatar from "../../components/ui/TeamAvatar";
import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { Send, Loader2, ArrowRight, MessageSquare, Maximize2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import SlideOver from '@/components/ui/SlideOver';
import { useAuth } from "@/context/AuthContext";

const ChatWidget = ({
    title = "Chat de equipo",
    description = "Chat operativo del equipo",
    apiEndpoint = "/api/general-chat",
    isGlobal = true,
    clientId = null,
    fullInterface = false,
    externalOpen = null,
    onExternalOpenChange = null
}) => {
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [internalModalOpen, setInternalModalOpen] = useState(false);

    const isModalOpen = externalOpen !== null ? externalOpen : internalModalOpen;
    const setIsModalOpen = onExternalOpenChange !== null ? onExternalOpenChange : setInternalModalOpen;

    // Form State
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [mentionMap, setMentionMap] = useState({}); // { "@Name": "ID" }
    const inputRef = useRef(null);

    // Fetch Team
    useEffect(() => {
        fetch(`${getApiBaseUrl()}/api/team`)
            .then(res => res.json())
            .then(data => setTeamMembers(Array.isArray(data) ? data : []))
            .catch(err => console.error("Error fetching team:", err));
    }, []);

    // Fetch Messages
    const fetchMessages = async (isPolling = false) => {
        try {
            if (!isPolling) setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}${apiEndpoint}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setMessages(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            if (!isPolling) console.error("Error fetching chat messages:", error);
        } finally {
            if (!isPolling) setLoading(false);
        }
    };

    useEffect(() => {
        if (isGlobal || clientId) {
            fetchMessages();

            // Polling interval (3 seconds)
            const intervalId = setInterval(() => {
                fetchMessages(true);
            }, 3000);

            const handleOpenGeneral = () => {
                if (isGlobal && setIsModalOpen) {
                    setIsModalOpen(true);
                }
            };

            window.addEventListener('open-general-chat', handleOpenGeneral);

            return () => {
                clearInterval(intervalId);
                window.removeEventListener('open-general-chat', handleOpenGeneral);
            };
        }
    }, [clientId, apiEndpoint, isGlobal, setIsModalOpen]);

    const handleSendMessage = async () => {
        if (!content.trim() || isSubmitting) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();

            // Convert human-readable @Name to @[Name](ID)
            let formattedContent = content;
            Object.entries(mentionMap).forEach(([displayName, id]) => {
                const regex = new RegExp(`${displayName}\\b`, 'g');
                formattedContent = formattedContent.replace(regex, `@[${displayName.substring(1)}](${id})`);
            });

            const res = await fetch(`${baseUrl}${apiEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: formattedContent })
            });

            if (res.ok) {
                const newMessage = await res.json();
                setMessages(prev => [newMessage, ...prev]);
                setContent('');
                setMentionMap({}); // Clear map
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
    const renderContentWithLinks = (text, isOwnMessage = false) => {
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
                    <span key={idx} className={cn(
                        "font-bold px-1 rounded",
                        isOwnMessage ? "text-white bg-white/20" : "text-primary bg-primary/5"
                    )}>
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
    const lastMessageId = useRef(null);

    useEffect(() => {
        if ((isModalOpen || fullInterface) && scrollRef.current && messages.length > 0) {
            const currentLastMsg = messages[0]; // Newest is at index 0

            // If new messages arrived
            if (currentLastMsg.id !== lastMessageId.current) {
                const isOwn = currentLastMsg.authorId === currentUser?.id || currentLastMsg.author?.id === currentUser?.id || currentLastMsg.author?.email === currentUser?.email;

                // Check if user is already at the bottom (within a 100px threshold)
                const isAtBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop <= scrollRef.current.clientHeight + 100;

                if (isOwn || isAtBottom) {
                    // Smooth scroll for better UX
                    scrollRef.current.scrollTo({
                        top: scrollRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
                lastMessageId.current = currentLastMsg.id;
            }
        }
    }, [isModalOpen, fullInterface, messages, currentUser]);

    // --- MENTIONS UX LOGIC ---
    const handleFocus = async () => {
        try {
            const baseUrl = getApiBaseUrl();
            await fetch(`${baseUrl}/api/notifications/read-all`, { method: 'POST' });
            window.dispatchEvent(new Event('notifications-read'));
        } catch (error) {
            console.error("Error marking as read on focus:", error);
        }
    };

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

        const displayName = `@${member.name}`;
        const newContent = `${textBeforeAt}${displayName} ${textAfterCursor}`;

        setContent(newContent);
        setMentionMap(prev => ({ ...prev, [displayName]: member.id }));
        setShowMentionDropdown(false);

        // Refocus and set cursor
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
                            {sortedGroups[dateKey].map((msg) => {
                                const isOwnMessage = msg.authorId === currentUser?.id || msg.author?.id === currentUser?.id || msg.author?.email === currentUser?.email;
                                return (
                                    <div key={msg.id} className={cn("flex gap-4 group", isOwnMessage ? "flex-row-reverse" : "flex-row")}>
                                        <TeamAvatar member={msg.author} className={cn("mt-1 shrink-0", isModal ? "w-10 h-10" : "w-8 h-8")} />
                                        <div className={cn(
                                            "max-w-[85%] border p-3 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative",
                                            isOwnMessage
                                                ? "bg-primary border-primary/20 text-white rounded-tr-none"
                                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-tl-none"
                                        )}>
                                            <div className="flex items-center justify-between gap-4 mb-1">
                                                <span className={cn("text-xs font-bold truncate", isOwnMessage ? "text-primary-foreground/90" : "text-zinc-900 dark:text-white")}>
                                                    {isOwnMessage ? "Tú" : msg.author?.name}
                                                </span>
                                                <span className={cn("text-[10px] shrink-0", isOwnMessage ? "text-primary-foreground/70" : "text-zinc-400")}>
                                                    {formatTime(msg.createdAt)}
                                                </span>
                                            </div>
                                            <div className={cn("text-xs leading-relaxed whitespace-pre-wrap", isOwnMessage ? "text-white" : "text-zinc-700 dark:text-zinc-300")}>
                                                {renderContentWithLinks(msg.content, isOwnMessage)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderInputArea = (isModal = false) => (
        <div className={cn("relative", isModal ? "p-6 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900" : "")}>
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
                            onFocus={handleFocus}
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

    const cardContent = fullInterface ? (
        <Card className="w-full flex flex-col border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 h-full overflow-hidden">
            <div className="flex justify-between items-center p-6 shrink-0 border-b border-zinc-100 dark:border-zinc-800/50">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{title}</h3>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    title="Ver chat completo"
                >
                    <Maximize2 className="w-4 h-4" />
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 scroll-smooth"
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

            <div className="shrink-0 p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                {renderInputArea()}
            </div>
        </Card>
    ) : (
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
                        Abrir chat
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </Card>
    );

    const compactContent = (
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
                    messages.slice(0, 2).map(msg => {
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
                    Abrir chat
                    <ArrowRight className="w-3 h-3" />
                </button>
            </div>
        </Card>
    );

    return (
        <>
            {fullInterface ? cardContent : compactContent}

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

                <div className="mt-auto relative shrink-0">
                    {renderInputArea(true)}
                </div>
            </SlideOver>
        </>
    );
};

export default ChatWidget;
