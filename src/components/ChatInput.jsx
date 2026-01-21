import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

const ChatInput = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const { toast } = useToast();

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [input]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    onSend(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFeatureNotImplemented = () => {
    toast({
      description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-8 pt-2">
      <div className="relative flex flex-col bg-white rounded-3xl shadow-lg border border-brand-lavender/50 focus-within:ring-2 focus-within:ring-[#9F7892]/20 focus-within:border-[#9F7892] transition-all duration-300">
        <form onSubmit={handleSubmit} className="flex flex-col w-full">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="w-full bg-transparent px-6 py-4 text-brand-charcoal placeholder:text-brand-charcoal/40 resize-none outline-none max-h-[200px] min-h-[60px]"
            rows={1}
            disabled={isLoading}
          />
          
          <div className="flex justify-between items-center px-4 pb-3 pt-1">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-[#9F7892] hover:text-[#9F7892] hover:bg-[#9F7892]/10 rounded-full h-10 w-10 transition-colors"
                onClick={handleFeatureNotImplemented}
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-[#9F7892] hover:text-[#9F7892] hover:bg-[#9F7892]/10 rounded-full h-10 w-10 transition-colors"
                onClick={handleFeatureNotImplemented}
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>

            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "rounded-lg px-6 py-2 h-10 transition-all duration-200 shadow-sm font-medium",
                !input.trim() || isLoading 
                  ? "bg-brand-mauve text-brand-charcoal/40 cursor-not-allowed" 
                  : "bg-[#9F7892] hover:bg-[#8a687e] text-white"
              )}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs font-medium">Thinking</span>
                </div>
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </form>
      </div>
      <div className="text-center mt-4">
        <p className="text-xs text-brand-charcoal/40">
          Brainstudio AI can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
