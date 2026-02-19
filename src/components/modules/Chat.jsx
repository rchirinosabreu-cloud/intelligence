import React, { useState, useRef, useEffect } from 'react';
import { MOCK_DATA } from '@/data';
import { Send, Bot, User, Mic, Sparkles, Paperclip, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

const Chat = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(MOCK_DATA.chat);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const newMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, newMsg]);
    setInput('');

    // Simulate AI thinking and response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: "Entendido. Estoy procesando tu solicitud... (Simulación de respuesta IA)"
      }]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] relative">
      {/* Header (Optional, maybe just title) */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800/50 mb-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 flex items-center justify-center transition-colors">
             <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white transition-colors">Bria Intelligence</h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Online • v2.5.0</span>
            </div>
          </div>
        </div>
        <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-4 space-y-6 pb-24 scroll-smooth"
      >
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Avatar (AI) */}
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-sm transition-colors">
                <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[70%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors",
                msg.role === 'user'
                  ? 'bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-br-none dark:bg-zinc-800 dark:text-white dark:border-zinc-700'
                  : 'bg-white text-zinc-700 border border-zinc-200 rounded-bl-none dark:bg-zinc-900/50 dark:text-zinc-300 dark:border-zinc-800/50 dark:backdrop-blur-sm'
              )}
            >
              {msg.role === 'assistant' ? (
                <div className="markdown-body">
                    {/* Simple rendering for now */}
                    {msg.content.split('\n').map((line, i) => (
                        <p key={i} className={cn("mb-2 last:mb-0", line.startsWith('**') ? 'font-bold text-zinc-900 dark:text-white' : '')}>
                            {line.replace(/\*\*/g, '')}
                        </p>
                    ))}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>

            {/* Avatar (User) */}
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Input Area (Floating Capsule) */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white dark:from-zinc-950 dark:via-zinc-950 to-transparent pt-10 pb-4 transition-colors">
        <div className="relative max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribe un mensaje a Bria..."
            className="w-full bg-white dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 pl-12 pr-14 py-4 rounded-full shadow-lg dark:shadow-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />

          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
             <button className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500 transition-colors">
                <Paperclip className="w-4 h-4" />
             </button>
          </div>

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {!input && (
                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500 transition-colors">
                    <Mic className="w-5 h-5" />
                </button>
            )}
            {input && (
                <button
                    onClick={handleSend}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition-all shadow-lg shadow-indigo-500/30"
                >
                    <Send className="w-4 h-4" />
                </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-600 mt-2 transition-colors">
            Bria puede cometer errores. Considera verificar la información importante.
        </p>
      </div>
    </div>
  );
};

export default Chat;
