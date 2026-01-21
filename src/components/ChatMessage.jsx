import React from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ChatMessage = ({ message }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex gap-4 w-full max-w-4xl mx-auto p-4 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-1",
        isUser ? "bg-brand-teal text-white" : "bg-white border border-brand-lavender"
      )}>
        {isUser ? (
          <User className="w-5 h-5" />
        ) : (
          <Bot className="w-5 h-5 text-brand-teal" />
        )}
      </div>

      {/* Message Bubble */}
      <div className={cn(
        "flex flex-col max-w-[85%] md:max-w-[75%]",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Name */}
        <span className="text-xs text-brand-charcoal/50 mb-1 px-1">
          {isUser ? 'You' : 'Brainstudio AI'}
        </span>

        {/* Content */}
        <div className={cn(
          "relative rounded-2xl px-5 py-3.5 shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap",
          isUser 
            ? "bg-brand-teal text-white rounded-tr-none" 
            : "bg-white border border-brand-lavender/60 text-brand-charcoal rounded-tl-none"
        )}>
          {message.content}
          
          {/* Action Buttons (Assistant only) */}
          {!isUser && (
            <div className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-brand-charcoal/40 hover:text-brand-teal"
                onClick={copyToClipboard}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
