import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, PlusCircle, Globe, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ChatInput = ({ onSend, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const { toast } = useToast();
  const maxLength = 1000;

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
  

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Empieza por aquí..."
            className="w-full bg-transparent px-4 py-4 mt-6 text-gray-800 placeholder:text-gray-400 font-medium resize-none outline-none max-h-[200px] min-h-[80px] text-base"
            rows={1}
            maxLength={maxLength}
            disabled={isLoading}
          />
          
          <div className="flex justify-between items-center px-2 pb-2">
            <div className="flex gap-4 items-center">
              <button
                type="button"
                className="flex items-center gap-2 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
                onClick={handleFeatureNotImplemented}
              >
                <PlusCircle className="h-5 w-5" />
                <span>Añade un archivo</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
                onClick={handleFeatureNotImplemented}
              >
                <ImageIcon className="h-5 w-5" />
                <span>Sube una imagen</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
                 <span className="text-xs text-gray-400 font-medium">
                    {input.length}/{maxLength}
                 </span>
                <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={cn(
                    "rounded-full h-10 w-10 p-0 flex items-center justify-center transition-all duration-200 shadow-sm",
                    !input.trim() || isLoading
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                )}
                >
                {isLoading ? (
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <ArrowRight className="w-5 h-5" />
                )}
                </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
