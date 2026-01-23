import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { sendMessage, validateApiConfig } from '@/lib/chatUtils';

import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import GreetingMessage from './GreetingMessage';
import ChatHeader from './ChatHeader';

const STORAGE_KEY = 'brainstudio_chats';

const ChatInterface = () => {
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const apiConfig = validateApiConfig();
  
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  // Load chats from local storage on mount
  useEffect(() => {
    const savedChats = localStorage.getItem(STORAGE_KEY);
    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        setChats(parsedChats);
      } catch (e) {
        console.error('Failed to parse chats', e);
      }
    }
  }, []);

  // Save chats to local storage whenever they change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [chats]);

  const currentChat = chats.find(c => c.id === currentChatId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages, isLoading]);

  const createNewChat = () => {
    const newChatId = uuidv4();
    const newChat = {
      id: newChatId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChatId);
    return newChatId;
  };

  const handleSendMessage = async (content) => {
    if (!content.trim()) return;

    // Get current chat ID or create new one if none exists
    let chatId = currentChatId;
    if (!chatId) {
      chatId = createNewChat();
    }

    // Update state optimistically with user message
    const userMessage = { role: 'user', content };
    
    setChats(prev => prev.map(chat => {
      if (chat.id === chatId) {
        // Generate title from first message if it's the first one
        const title = chat.messages.length === 0 
          ? content.slice(0, 30) + (content.length > 30 ? '...' : '')
          : chat.title;
          
        return {
          ...chat,
          title,
          messages: [...chat.messages, userMessage],
          updatedAt: new Date().toISOString()
        };
      }
      return chat;
    }));

    setIsLoading(true);

    try {
      // Get the updated messages list for the API context
      const currentMessages = chats.find(c => c.id === chatId)?.messages || [];
      const messagesForApi = [...currentMessages, userMessage];

      // Temporary placeholder for streaming response
      let assistantResponse = '';
      
      await sendMessage(messagesForApi, (chunk) => {
        assistantResponse += chunk;
        
        setChats(prev => prev.map(chat => {
          if (chat.id === chatId) {
            // Check if last message is assistant, if so update it, else add it
            const lastMsg = chat.messages[chat.messages.length - 1];
            
            let newMessages;
            if (lastMsg.role === 'assistant') {
              newMessages = [...chat.messages.slice(0, -1), { role: 'assistant', content: assistantResponse }];
            } else {
              newMessages = [...chat.messages, { role: 'assistant', content: assistantResponse }];
            }

            return {
              ...chat,
              messages: newMessages
            };
          }
          return chat;
        }));
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to get response. Please check your connection.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F3F3F3] overflow-hidden font-sans">
      {/* Main Chat Area - Full Width */}
      <div className="flex-1 flex flex-col h-full relative w-full bg-[#F3F3F3]">
        <ChatHeader 
          title={currentChat?.title} 
          onNewChat={createNewChat}
          apiConfig={apiConfig}
        />

        <div className="flex-1 overflow-y-auto w-full scroll-smooth">
          {!currentChat || currentChat.messages.length === 0 ? (
            <GreetingMessage onSuggestionClick={setInputValue} />
          ) : (
            <div className="py-6 px-0 space-y-6 min-h-full max-w-5xl mx-auto w-full">
              {currentChat.messages.map((msg, idx) => (
                <ChatMessage key={idx} message={msg} />
              ))}
              
              {isLoading && (
                 <div className="w-full max-w-4xl mx-auto px-4 flex gap-4">
                   <div className="w-8 h-8 rounded-full bg-white border border-brand-lavender flex items-center justify-center">
                     <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                   </div>
                   <div className="flex items-center gap-1 bg-white px-4 py-3 rounded-2xl rounded-tl-sm border border-brand-lavender/60">
                     <motion.div
                       animate={{ scale: [1, 1.2, 1] }}
                       transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                       className="w-1.5 h-1.5 bg-brand-charcoal/40 rounded-full"
                     />
                     <motion.div
                       animate={{ scale: [1, 1.2, 1] }}
                       transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                       className="w-1.5 h-1.5 bg-brand-charcoal/40 rounded-full"
                     />
                     <motion.div
                       animate={{ scale: [1, 1.2, 1] }}
                       transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                       className="w-1.5 h-1.5 bg-brand-charcoal/40 rounded-full"
                     />
                   </div>
                 </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-gradient-to-t from-[#F3F3F3] via-[#F3F3F3] to-transparent pt-6">
          <ChatInput
            onSend={handleSendMessage}
            isLoading={isLoading}
            input={inputValue}
            setInput={setInputValue}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
