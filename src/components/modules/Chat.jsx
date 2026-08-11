import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Mic, Sparkles, Paperclip, MoreVertical, StopCircle, MessageSquare } from '@/components/ui/icons';
import { motion } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const Chat = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "¡Hola! Soy Brain Core, tu analista de estrategia. ¿En qué puedo ayudarte hoy?"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);

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

    // Create a placeholder for the assistant response
    const assistantMessageId = Date.now() + 1;
    setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '' }]);

    abortControllerRef.current = new AbortController();

    try {
      const baseUrl = getApiBaseUrl();
      const token = localStorage.getItem('authToken');

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });

        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + chunkValue }
            : msg
        ));
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Chat error:", error);
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + "\n\n*(Error de conexión: No pude completar la respuesta.)*" }
            : msg
        ));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] relative bg-white dark:bg-zinc-950 transition-colors">
      <PageHeader
        title="Brain Core Intelligence"
        subtitle="Analista de estrategia y operaciones con IA."

      >
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-white/5">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">v6.0 Online</span>
        </div>
      </PageHeader>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 space-y-6 pb-32 scroll-smooth"
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
              <div className="w-8 h-8 rounded-xl bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-sm transition-colors mt-1">
                <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors",
                msg.role === 'user'
                  ? 'bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-br-none dark:bg-zinc-800 dark:text-white dark:border-zinc-700'
                  : 'bg-white text-zinc-700 border border-zinc-200 rounded-bl-none dark:bg-zinc-900/50 dark:text-zinc-300 dark:border-zinc-800/50 dark:backdrop-blur-sm'
              )}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code({node, inline, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                    <pre className="bg-zinc-100 dark:bg-zinc-950 p-2 rounded-xl overflow-x-auto my-2 text-xs">
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    </pre>
                                ) : (
                                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>
                                        {children}
                                    </code>
                                )
                            }
                        }}
                    >
                        {msg.content || "..."}
                    </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>

            {/* Avatar (User) */}
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-600/20 mt-1">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </motion.div>
        ))}

        {/* Loading Indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start gap-4"
            >
                 <div className="w-8 h-8 rounded-xl bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                    <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                 </div>
                 <div className="bg-white border border-zinc-200 dark:bg-zinc-900/50 dark:border-zinc-800/50 px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
            </motion.div>
        )}
      </div>

      {/* Input Area (Floating) */}
      <div className="absolute bottom-6 left-0 right-0 px-4 pointer-events-none">
        <div className="max-w-3xl mx-auto relative pointer-events-auto">
          <div className="relative group">
            {/* Background Blur & Shadow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full opacity-20 blur group-hover:opacity-30 transition duration-500"></div>

            <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-xl flex items-center p-2 pr-2">

                {/* Attachment Button */}
                <button className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500 transition-colors ml-1">
                    <Paperclip className="w-5 h-5" />
                </button>

                {/* Input Field */}
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                    disabled={isLoading}
                    placeholder="Escribe un mensaje a Brain Core..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 px-3 py-3 text-sm sm:text-base"
                />

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {isLoading ? (
                         <button
                            onClick={handleStop}
                            className="p-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400 transition-all"
                            title="Detener respuesta"
                        >
                            <StopCircle className="w-5 h-5" />
                        </button>
                    ) : (
                        !input ? (
                            <button className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500 transition-colors">
                                <Mic className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSend}
                                className="p-3 bg-indigo-600 hover:bg-indigo-600 rounded-full text-white transition-all shadow-lg shadow-indigo-600/30"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )
                    )}
                </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-600 mt-3 transition-colors">
            Brain Core puede cometer errores. Considera verificar la información importante.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Chat;
