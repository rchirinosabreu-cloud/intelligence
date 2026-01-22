import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ChatHeader = ({ title, onNewChat }) => {
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-brand-lavender px-6 py-4 flex items-center justify-between h-20 shadow-sm">
      <div className="flex flex-col overflow-hidden">
        <h2 className="font-semibold text-brand-charcoal truncate text-lg">
          {title || "Nueva conversación"}
        </h2>
        <p className="text-xs text-brand-charcoal/50 font-medium">Brainstudio Intelligence</p>
      </div>

      <div className="flex items-center gap-2">
        <Button 
          className="flex gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white border-none rounded-full shadow-sm transition-all duration-200 font-medium px-5"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          Nuevo chat
        </Button>
      </div>
    </header>
  );
};

export default ChatHeader;
