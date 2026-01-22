import React from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Brain } from 'lucide-react';
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
        isUser ? "flex-row-reverse" : "flex-col"
      )}
    >
      {/* Bot Icon Header (only for assistant) */}
      {!isUser && (
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-500">Brainstudio Intelligence</span>
        </div>
      )}

      {/* Message Bubble/Content */}
      <div className={cn(
        "flex flex-col max-w-[85%] md:max-w-[75%]",
        isUser ? "items-end" : "items-start w-full max-w-none"
      )}>
        <div className={cn(
          "relative text-sm md:text-base leading-relaxed whitespace-pre-wrap",
          isUser 
            ? "bg-gray-100 text-gray-900 rounded-2xl px-5 py-3.5 shadow-sm"
            : "bg-transparent text-gray-800 px-0 py-0"
        )}>
          {message.content}
          
          {/* Action Buttons (Assistant only) */}
          {!isUser && (
            <div className="flex mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-gray-400 hover:text-gray-600"
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
