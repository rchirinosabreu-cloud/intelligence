import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Plus, Trash2, Search, Menu, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ChatHistory = ({ 
  chats, 
  currentChatId, 
  onSelectChat, 
  onNewChat, 
  onDeleteChat, 
  isOpen, 
  onToggle 
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="md:hidden fixed inset-0 bg-black/50 z-20 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <motion.div
        className={cn(
          "fixed md:static inset-y-0 left-0 z-30 w-[280px] bg-white border-r border-brand-lavender flex flex-col h-full shadow-xl md:shadow-none transition-transform duration-300 ease-in-out",
          !isOpen && "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-brand-lavender/50">
          <div className="flex items-center justify-between mb-4 md:hidden">
            <h2 className="font-bold text-brand-charcoal text-lg">Menú</h2>
            <Button variant="ghost" size="icon" onClick={onToggle}>
              <Menu className="h-5 w-5 text-brand-charcoal" />
            </Button>
          </div>
          
          <Button 
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onToggle();
            }}
            className="w-full justify-start gap-2 bg-brand-teal hover:bg-brand-teal/90 text-white shadow-sm"
          >
            <Plus className="h-5 w-5" />
            <span>Nueva conversación</span>
          </Button>

          <div className="mt-4 relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-charcoal/40" />
             <input 
               type="text" 
               placeholder="Buscar..."
               className="w-full pl-9 pr-4 py-2 bg-brand-mauve rounded-lg text-sm text-brand-charcoal placeholder:text-brand-charcoal/40 focus:outline-none focus:ring-1 focus:ring-brand-lavender transition-all"
             />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* Today/Recent Section Header could go here */}
          <div className="px-3 py-2 text-xs font-semibold text-brand-charcoal/50 uppercase tracking-wider">
            Historial
          </div>

          <AnimatePresence initial={false}>
            {chats.map((chat) => (
              <motion.div
                key={chat.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="group relative"
              >
                <button
                  onClick={() => {
                    onSelectChat(chat.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 group-hover:bg-brand-mauve/50",
                    currentChatId === chat.id 
                      ? "bg-brand-mauve text-brand-charcoal font-medium shadow-sm" 
                      : "text-brand-charcoal/70 hover:text-brand-charcoal"
                  )}
                >
                  <MessageSquare className={cn(
                    "h-4 w-4 flex-shrink-0",
                    currentChatId === chat.id ? "text-brand-teal" : "text-brand-charcoal/40"
                  )} />
                  <span className="truncate text-sm flex-1">
                    {chat.title || "Nueva conversación"}
                  </span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                  title="Eliminar chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {chats.length === 0 && (
            <div className="text-center py-8 px-4 text-brand-charcoal/40">
              <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Aún no hay historial</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-brand-lavender/50 bg-white">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-brand-mauve/50 cursor-pointer transition-colors">
            <div className="h-8 w-8 rounded-full bg-brand-teal/10 flex items-center justify-center">
              <img 
                src="https://horizons-cdn.hostinger.com/34bef26f-0844-4404-9c29-5bd38530bac6/818eb0a9481bbea858b332955da3caac.png" 
                alt="Logo" 
                className="h-5 w-5 object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-charcoal truncate">Brainstudio Intelligence</p>
              <p className="text-xs text-brand-charcoal/50">Pro Plan</p>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ChatHistory;
