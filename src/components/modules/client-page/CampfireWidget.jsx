import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Send, MoreHorizontal, Paperclip, X, Maximize2, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const TEAM_MEMBERS = [
  { id: 'claudia', name: 'Claudia', avatar: 'https://ui-avatars.com/api/?name=Claudia&background=f472b6&color=fff', color: 'bg-pink-500' },
  { id: 'helen', name: 'Helen', avatar: 'https://ui-avatars.com/api/?name=Helen&background=facc15&color=fff', color: 'bg-yellow-500' },
  { id: 'rodny', name: 'Rodny', avatar: 'https://ui-avatars.com/api/?name=Rodny&background=60a5fa&color=fff', color: 'bg-blue-500' },
  { id: 'jarlan', name: 'Jarlan', avatar: 'https://ui-avatars.com/api/?name=Jarlan&background=4ade80&color=fff', color: 'bg-green-500' },
  { id: 'francisco', name: 'Francisco', avatar: 'https://ui-avatars.com/api/?name=Francisco&background=a78bfa&color=fff', color: 'bg-purple-500' },
  { id: 'camila', name: 'Camila', avatar: 'https://ui-avatars.com/api/?name=Camila&background=fb923c&color=fff', color: 'bg-orange-500' },
  { id: 'elisa', name: 'Elisa', avatar: 'https://ui-avatars.com/api/?name=Elisa&background=2dd4bf&color=fff', color: 'bg-teal-500' },
  { id: 'melissa', name: 'Melissa', avatar: 'https://ui-avatars.com/api/?name=Melissa&background=f87171&color=fff', color: 'bg-red-500' },
];

const INITIAL_MESSAGES = [
  { id: 1, userId: 'rodny', text: 'Chicos, ya subí los entregables de Q3.', timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 2, userId: 'claudia', text: '¡Genial! Los reviso mañana primera hora.', timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: 3, userId: 'jarlan', text: 'Ojo con el logo en el slide 4, parece pixelado.', timestamp: new Date(Date.now() - 3600000).toISOString() },
];

// --- Sub-Component: Chat Interface (The full drawer content) ---
const ChatInterface = ({ messages, setMessages, currentUser, setCurrentUser, onClose }) => {
    const [text, setText] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!text.trim()) return;

        const newMessage = {
            id: Date.now(),
            userId: currentUser.id,
            text: text,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, newMessage]);
        setText('');
    };

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat('es-MX', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-xl">
                        <Flame className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white">Campfire</h3>
                        <p className="text-xs text-zinc-500">Historial de equipo</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* User Selector */}
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-zinc-200 dark:border-zinc-700 outline-none">
                                <img src={currentUser.avatar} alt={currentUser.name} className="w-5 h-5 rounded-full" />
                                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{currentUser.name}</span>
                                <MoreHorizontal className="w-3 h-3 text-zinc-400" />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content className="min-w-[140px] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-1 z-[60] animate-in zoom-in-95 duration-200" sideOffset={5} align="end">
                                <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                    Publicar como...
                                </div>
                                {TEAM_MEMBERS.map(member => (
                                    <DropdownMenu.Item
                                        key={member.id}
                                        onClick={() => setCurrentUser(member)}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer outline-none transition-colors",
                                            currentUser.id === member.id
                                                ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium"
                                                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        )}
                                    >
                                        <img src={member.avatar} alt={member.name} className="w-4 h-4 rounded-full" />
                                        {member.name}
                                    </DropdownMenu.Item>
                                ))}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>

                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 dark:bg-zinc-950/30 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                {messages.map((msg, index) => {
                    const user = TEAM_MEMBERS.find(u => u.id === msg.userId) || TEAM_MEMBERS[0];
                    const isMe = msg.userId === currentUser.id;
                    const showAvatar = index === 0 || messages[index - 1].userId !== msg.userId;

                    return (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}
                        >
                            {/* Avatar */}
                            <div className={cn("w-10 flex-shrink-0 flex flex-col items-center", !showAvatar && "opacity-0")}>
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    className="w-10 h-10 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm"
                                    title={user.name}
                                />
                            </div>

                            {/* Message Bubble */}
                            <div className={cn(
                                "flex flex-col max-w-[75%]",
                                isMe ? "items-end" : "items-start"
                            )}>
                                <div className="flex items-baseline gap-2 mb-1 px-1">
                                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{user.name}</span>
                                    <span className="text-[10px] text-zinc-400">{formatTime(msg.timestamp)}</span>
                                </div>
                                <div className={cn(
                                    "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                                    isMe
                                        ? "bg-indigo-600 text-white rounded-tr-sm"
                                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-tl-sm"
                                )}>
                                    {msg.text}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                <div className="relative flex items-center gap-2 max-w-4xl mx-auto">
                    <button className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={`Escribe como ${currentUser.name}...`}
                        className="flex-1 bg-zinc-100 dark:bg-zinc-950/50 border-transparent focus:bg-white dark:focus:bg-zinc-950 border focus:border-indigo-500/30 rounded-full py-3 px-5 text-sm focus:outline-none transition-all placeholder:text-zinc-400"
                        autoFocus
                    />
                    <button
                        onClick={handleSend}
                        disabled={!text.trim()}
                        className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-full shadow-lg shadow-indigo-500/20 transition-all disabled:shadow-none"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Sub-Component: Widget Preview (The small card in the grid) ---
const CampfirePreview = ({ messages, onClick }) => {
    const lastMessage = messages[messages.length - 1];
    const lastUser = TEAM_MEMBERS.find(u => u.id === lastMessage?.userId) || TEAM_MEMBERS[0];

    // Get unique participants for avatars
    const participantIds = [...new Set(messages.map(m => m.userId))].slice(0, 3);
    const participants = participantIds.map(id => TEAM_MEMBERS.find(u => u.id === id));

    return (
        <Card
            onClick={onClick}
            className="group h-full flex flex-col justify-between p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 relative overflow-hidden cursor-pointer hover:border-orange-300 dark:hover:border-orange-500/30 transition-all shadow-sm hover:shadow-md"
        >
            <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-zinc-400 group-hover:text-orange-500" />
            </div>

            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-orange-500/10 rounded-lg group-hover:scale-110 transition-transform">
                        <Flame className="w-4 h-4 text-orange-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Campfire</h3>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{lastUser.name}:</span>
                        <span className="text-xs text-zinc-500 truncate max-w-[150px]">{lastMessage?.text}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Hace un momento</p>
                </div>
            </div>

            <div className="flex items-center justify-between mt-4">
               <div className="flex -space-x-2">
                   {participants.map((p, i) => (
                       <img
                         key={i}
                         src={p.avatar}
                         className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900"
                         alt={p.name}
                       />
                   ))}
                   {messages.length > 3 && (
                       <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[8px] font-medium text-zinc-500">
                           +{messages.length - 3}
                       </div>
                   )}
               </div>
               <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                   Abrir chat
               </div>
            </div>
        </Card>
    );
};

// --- Main Export ---
const CampfireWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [currentUser, setCurrentUser] = useState(TEAM_MEMBERS[0]);

    return (
        <>
            <CampfirePreview
                messages={messages}
                onClick={() => setIsOpen(true)}
            />

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[50]"
                        />

                        {/* Drawer */}
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="fixed top-0 right-0 h-full w-full sm:w-[450px] bg-white dark:bg-zinc-900 shadow-2xl z-[60] border-l border-zinc-200 dark:border-zinc-800"
                        >
                            <ChatInterface
                                messages={messages}
                                setMessages={setMessages}
                                currentUser={currentUser}
                                setCurrentUser={setCurrentUser}
                                onClose={() => setIsOpen(false)}
                            />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default CampfireWidget;
