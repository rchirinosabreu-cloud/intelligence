import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, ListTodo, Mail, FileText, Cpu, Calendar,
  AlertTriangle, ArrowUpCircle, Video, Palette, CheckCircle,
  Image, Minimize2, BarChart2, TrendingUp, Lightbulb, File,
  Users, CheckSquare, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const allSuggestions = [
  {
    icon: Calendar,
    title: "Ayúdame a organizar esta semana.",
    prompt: "",
  },
  {
    icon: AlertTriangle,
    title: "¿Qué proyectos están en riesgo?",
    prompt: "",
  },
  {
    icon: ArrowUpCircle,
    title: "Dame prioridades según fechas y carga.",
    prompt: "",
  },
  {
    icon: Video,
    title: "¿Cómo es el proceso interno para entregar un video?",
    prompt: "",
  },
  {
    icon: Palette,
    title: "¿Qué incluye el servicio de branding?",
    prompt: "",
  },
  {
    icon: CheckCircle,
    title: "¿Cuál es el flujo de aprobación?",
    prompt: "",
  },
  {
    icon: FileText,
    title: "Escribe una propuesta comercial para este cliente.",
    prompt: "",
  },
  {
    icon: Image,
    title: "Dame copys para Instagram con este enfoque.",
    prompt: "",
  },
  {
    icon: Minimize2,
    title: "Resume este texto para presentación.",
    prompt: "",
  },
  {
    icon: BarChart2,
    title: "Hazme el resumen mensual de redes del cliente X.",
    prompt: "",
  },
  {
    icon: TrendingUp,
    title: "Dime qué mejoró y qué no este mes.",
    prompt: "",
  },
  {
    icon: Lightbulb,
    title: "Prepárame insights para enviar al cliente.",
    prompt: "",
  },
  {
    icon: File,
    title: "Muéstrame el último informe de SunPartners.",
    prompt: "",
  },
  {
    icon: Users,
    title: "¿Qué se acordó con este cliente en la última reunión?",
    prompt: "",
  },
  {
    icon: FileText,
    title: "Resume el brief del proyecto X.",
    prompt: "",
  },
  {
    icon: ListTodo,
    title: "¿Cuáles son mis pendientes hoy?",
    prompt: "",
  },
  {
    icon: CheckSquare,
    title: "¿Qué tareas tengo abiertas con el cliente X?",
    prompt: "",
  },
  {
    icon: Clock,
    title: "Recuérdame qué quedó pendiente de la última reunión.",
    prompt: "",
  }
];

const GreetingMessage = ({ onSuggestionClick }) => {
  const [currentSuggestions, setCurrentSuggestions] = useState([]);

  const refreshSuggestions = () => {
    // Shuffle and pick 4
    const shuffled = [...allSuggestions].sort(() => 0.5 - Math.random());
    setCurrentSuggestions(shuffled.slice(0, 4));
  };

  useEffect(() => {
    refreshSuggestions();
  }, []);

  return (
    <div className="flex flex-col items-center md:items-start justify-center h-full max-w-5xl mx-auto px-4 w-full py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-left mb-8 w-full"
      >
        <h2 className="text-3xl md:text-5xl font-bold text-gray-800 mb-4">
          ¿Listo para trascender?
        </h2>
        <p className="text-gray-500 text-lg">
          Genera ideas, contenidos, análisis y consultas
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mb-6">
        {currentSuggestions.map((item, index) => (
          <motion.button
            key={`${item.title}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * index }}
            onClick={() => onSuggestionClick(item.title + (item.prompt ? " " + item.prompt : ""))}
            className="group relative flex flex-col justify-between p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all duration-300 text-left min-h-[140px]"
          >
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-3">
                {item.title}
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
            onClick={refreshSuggestions}
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
