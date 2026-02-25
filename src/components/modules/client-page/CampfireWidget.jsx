import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Send, MoreHorizontal, User, Paperclip } from 'lucide-react';
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

const CampfireWidget = () => {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [currentUser, setCurrentUser] = useState(TEAM_MEMBERS[0]);
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
    <Card className="h-full flex flex-col bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">

      {/* Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-orange-500/10 rounded-lg">
              <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
           </div>
           <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Campfire</h3>
        </div>

        {/* User Selector */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 outline-none">
               <img src={currentUser.avatar} alt={currentUser.name} className="w-5 h-5 rounded-full" />
               <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{currentUser.name}</span>
               <MoreHorizontal className="w-3 h-3 text-zinc-400" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="min-w-[140px] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-1 z-50 animate-in zoom-in-95 duration-200" sideOffset={5} align="end">
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
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/30 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
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
              <div className={cn("w-8 flex-shrink-0 flex flex-col items-center", !showAvatar && "opacity-0")}>
                 <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border border-white dark:border-zinc-800 shadow-sm"
                    title={user.name}
                 />
              </div>

              {/* Message Bubble */}
              <div className={cn(
                "flex flex-col max-w-[80%]",
                isMe ? "items-end" : "items-start"
              )}>
                 <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold text-zinc-500">{user.name}</span>
                    <span className="text-[9px] text-zinc-400">{formatTime(msg.timestamp)}</span>
                 </div>
                 <div className={cn(
                   "px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm",
                   isMe
                     ? "bg-indigo-600 text-white rounded-tr-sm"
                     : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-100 dark:border-zinc-700 rounded-tl-sm"
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
      <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
        <div className="relative flex items-center gap-2">
            <button className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <Paperclip className="w-4 h-4" />
            </button>
            <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={`Escribe como ${currentUser.name}...`}
                className="flex-1 bg-zinc-100 dark:bg-zinc-950/50 border-transparent focus:bg-white dark:focus:bg-zinc-950 border focus:border-indigo-500/30 rounded-full py-2 px-4 text-sm focus:outline-none transition-all placeholder:text-zinc-400"
            />
            <button
                onClick={handleSend}
                disabled={!text.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white rounded-full shadow-lg shadow-indigo-500/20 transition-all disabled:shadow-none"
            >
                <Send className="w-4 h-4" />
            </button>
        </div>
      </div>
    </Card>
  );
};

export default CampfireWidget;
