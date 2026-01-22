import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ListTodo, Mail, FileText, Cpu, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const suggestions = [
  {
    icon: ListTodo,
    title: "Gestión interna y pendientes",
    prompt: "¿Cuáles son mis pendientes hoy?",
  },
  {
    icon: Mail,
    title: "Conocimiento y documentos",
    prompt: "Resume el brief del proyecto X",
  },
  {
    icon: FileText,
    title: "Planeación y seguimiento",
    prompt: "Ayúdame a organizar esta semana",
  },
  {
    icon: Cpu,
    title: "Reportes y análisis",
    prompt: "Necesito un resumen mensual de redes",
  }
];

const GreetingMessage = ({ onSuggestionClick }) => {
  return (
    <div className="flex flex-col items-center md:items-start justify-center h-full max-w-5xl mx-auto px-4 w-full py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-left mb-8 w-full"
      >
        <h1 className="text-4xl md:text-6xl font-bold text-black mb-2 tracking-tight">
         <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Hola,</span>
        </h1>
        <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
          ¿Listo para trascender?
        </h2>
        <p className="text-gray-500 text-lg">
          Genera ideas, contenidos, análisis y consultas
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mb-6">
        {suggestions.map((item, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * index }}
            onClick={() => onSuggestionClick(item.title + " " + item.prompt)}
            className="group relative flex flex-col justify-between p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all duration-300 text-left h-32 md:h-40"
          >
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">
                {item.title}
              </p>
              <p className="font-medium text-gray-500 text-sm leading-tight">
                {item.prompt}
              </p>
            </div>
            <div className="mt-auto">
               <item.icon className="w-5 h-5 text-gray-400 group-hover:text-purple-500 transition-colors" />
            </div>
          </motion.button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
         <Button
            variant="ghost"
            className="text-gray-400 hover:text-gray-600 hover:bg-transparent pl-0 gap-2"
         >
            <RefreshCw className="w-4 h-4" />
            Sugerir prompts
         </Button>
      </motion.div>
    </div>
  );
};

export default GreetingMessage;
