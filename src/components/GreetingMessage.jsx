import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Lightbulb, Code, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const suggestions = [
  {
    icon: Lightbulb,
    title: "Write a plan",
    prompt: "Create a 30-day plan to learn React basics",
    color: "text-amber-500",
    bg: "bg-amber-500/10"
  },
  {
    icon: Code,
    title: "Debug Code",
    prompt: "Help me find the bug in this JavaScript loop",
    color: "text-blue-500",
    bg: "bg-blue-500/10"
  },
  {
    icon: Sparkles,
    title: "Creative Story",
    prompt: "Write a short sci-fi story about AI assistants",
    color: "text-purple-500",
    bg: "bg-purple-500/10"
  },
  {
    icon: BookOpen,
    title: "Summarize",
    prompt: "Summarize the key principles of atomic design",
    color: "text-green-500",
    bg: "bg-green-500/10"
  }
];

const GreetingMessage = ({ onSuggestionClick }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-4 w-full py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        {/* Updated Logo Container - No Shadow */}
        <div className="relative inline-block mb-6">
          <img 
            src="https://horizons-cdn.hostinger.com/34bef26f-0844-4404-9c29-5bd38530bac6/818eb0a9481bbea858b332955da3caac.png" 
            alt="Brainstudio AI" 
            className="w-24 h-24 relative z-10 object-contain"
          />
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-brand-charcoal mb-4 tracking-tight">
          Good Morning, User!
        </h1>
        <p className="text-brand-charcoal/60 text-lg max-w-xl mx-auto leading-relaxed font-medium">
          I'm your personal AI assistant. I can help you write code, draft emails, answer questions, and much more.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {suggestions.map((item, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * index }}
            onClick={() => onSuggestionClick(item.prompt)}
            className="group relative flex items-start gap-5 p-6 rounded-2xl bg-white border border-brand-lavender/60 hover:border-[#9F7892]/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-left"
          >
            <div className={cn("p-3 rounded-xl transition-colors group-hover:bg-[#9F7892]/10", item.bg, item.color, "group-hover:text-[#9F7892]")}>
              <item.icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-charcoal text-base mb-1 group-hover:text-[#9F7892] transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-brand-charcoal/50 leading-relaxed group-hover:text-brand-charcoal/70">
                "{item.prompt}"
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default GreetingMessage;
