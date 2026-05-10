import React, { useState, useRef, useEffect } from 'react';
import { Send, Brain, User, Paperclip, StopCircle, Sparkles, AlertCircle, Info, MessageSquare, Image as ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const BrainCore = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "¡Bienvenido al Brain Core, el centro de inteligencia de Brainstudio! Estoy listo para procesar nueva información o responder tus consultas estratégicas."
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feed, setFeed] = useState([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const baseUrl = getApiBaseUrl();
  const token = localStorage.getItem('authToken');

  // Load Proactive Feed
  const fetchFeed = async () => {
    setIsLoadingFeed(true);
    try {
      const response = await fetch(`${baseUrl}/api/brain-core/feed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFeed(data);
      }
    } catch (error) {
      console.error("Error fetching feed:", error);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${baseUrl}/api/brain-core/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: input })
      });

      if (!response.ok) throw new Error("Error en la consulta");

      const data = await response.json();
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.answer,
        sources: data.sources
      }]);
    } catch (error) {
      toast.error("No se pudo obtener respuesta del Brain Core.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('metadata', JSON.stringify({ source: 'Frontend Upload' }));

    try {
      const response = await fetch(`${baseUrl}/api/brain-core/context`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("Información integrada a la memoria del Brain Core.");
        setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'assistant',
            content: `He procesado la imagen y extraído la información. Ahora forma parte de mi memoria estratégica.\n\n**Contenido extraído:**\n${data.content}`
        }]);
        fetchFeed(); // Refresh feed as new context might trigger new alerts
      } else {
        throw new Error("Error al subir archivo");
      }
    } catch (error) {
      toast.error("Error al procesar la imagen.");
      console.error(error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] relative bg-white dark:bg-zinc-950 transition-colors overflow-hidden">
      <PageHeader
        title="Brain Core"
        subtitle="Centro de inteligencia estratégica y memoria operativa."
      >
        <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
          <Brain className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Core V1 Active</span>
        </div>
      </PageHeader>

      <div className="flex flex-1 min-h-0">
        {/* Main Intelligence Area */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-200 dark:border-white/5">
          {/* Proactive Feed (Alerts) */}
          <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-white/5">
             <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> Feed Proactivo
                </h3>
                {isLoadingFeed && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
             </div>
             <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                <AnimatePresence mode='popLayout'>
                    {feed.length > 0 ? (
                        feed.map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className={cn(
                                    "flex-shrink-0 w-64 p-3 rounded-xl border text-xs shadow-sm",
                                    item.severity === 'critical' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400' :
                                    item.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-400' :
                                    'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-400'
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    {item.severity === 'critical' ? <AlertCircle className="w-4 h-4 mt-0.5" /> : <Info className="w-4 h-4 mt-0.5" />}
                                    <p className="font-medium">{item.alert}</p>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        !isLoadingFeed && <p className="text-[10px] text-zinc-400 italic py-2">No hay alertas proactivas en este momento.</p>
                    )}
                </AnimatePresence>
             </div>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth pb-32">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-600/20 mt-1">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                )}

                <div className={cn(
                    "max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors",
                    msg.role === 'user'
                      ? 'bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-br-none dark:bg-zinc-800 dark:text-white dark:border-zinc-700'
                      : 'bg-white text-zinc-700 border border-zinc-200 rounded-bl-none dark:bg-zinc-900/50 dark:text-zinc-300 dark:border-zinc-800/50 dark:backdrop-blur-sm'
                  )}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                  </div>
                )}
              </motion.div>
            ))}

            {isLoading && (
               <div className="flex justify-start gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <Brain className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-bl-none">
                    <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150" />
                    </div>
                  </div>
               </div>
            )}
          </div>

          {/* Context Input Area */}
          <div className="p-6 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-white/5">
            <div className="max-w-3xl mx-auto relative">
               <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-10 blur group-focus-within:opacity-30 transition duration-500" />
                  <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl flex items-end p-2 pr-3">

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="image/*"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors flex-shrink-0"
                    >
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                    </button>

                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                      placeholder="Alimenta la memoria o haz una consulta estratégica..."
                      className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 px-3 py-3 text-sm min-h-[48px] max-h-32 resize-none"
                    />

                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || isLoading}
                      className={cn(
                        "p-3 rounded-xl transition-all shadow-lg flex-shrink-0 mb-0.5",
                        input.trim() && !isLoading
                          ? "bg-indigo-600 text-white shadow-indigo-600/30 hover:scale-105"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 shadow-none cursor-not-allowed"
                      )}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
               </div>
               <p className="text-center text-[10px] text-zinc-400 mt-3 flex items-center justify-center gap-2">
                 <Sparkles className="w-3 h-3" /> Brain Core V1: Memoria con pgvector y Vision OCR activa.
               </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainCore;
