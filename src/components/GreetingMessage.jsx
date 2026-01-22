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

// Icons mapping based on context since icons are imported but not all used in the previous array explicitly with strings
// I'll try to match icons to the text.
const allSuggestions = [
  { icon: Calendar, text: "Ayúdame a organizar esta semana." },
  { icon: AlertTriangle, text: "¿Qué proyectos están en riesgo?" },
  { icon: ArrowUpCircle, text: "Dame prioridades según fechas y carga." },
  { icon: Video, text: "¿Cómo es el proceso interno para entregar un video?" },
  { icon: Palette, text: "¿Qué incluye el servicio de branding?" },
  { icon: CheckCircle, text: "¿Cuál es el flujo de aprobación?" },
  { icon: FileText, text: "Escribe una propuesta comercial para este cliente." },
  { icon: Image, text: "Dame copys para Instagram con este enfoque." },
  { icon: Minimize2, text: "Resume este texto para presentación." },
  { icon: BarChart2, text: "Hazme el resumen mensual de redes del cliente X." },
  { icon: TrendingUp, text: "Dime qué mejoró y qué no este mes." },
  { icon: Lightbulb, text: "Prepárame insights para enviar al cliente." },
  { icon: File, text: "Muéstrame el último informe de SunPartners." },
  { icon: Users, text: "¿Qué se acordó con este cliente en la última reunión?" },
  { icon: FileText, text: "Resume el brief del proyecto X." },
  { icon: ListTodo, text: "¿Cuáles son mis pendientes hoy?" },
  { icon: CheckSquare, text: "¿Qué tareas tengo abiertas con el cliente X?" },
  { icon: Clock, text: "Recuérdame qué quedó pendiente de la última reunión." },
];

const GreetingMessage = ({ onSuggestionClick }) => {
  const [currentSuggestions, setCurrentSuggestions] = useState([]);

  const refreshSuggestions = () => {
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
        {/* User wanted dark gray text for the subtitle?
            "Quitemos el 'hola' y dejemos solamente las palabras '¿Listo para trascender?' Y en color gris oscuro."
            This might apply to the header itself.
            The previous code had text-gray-800 for the header (dark gray) and text-gray-500 for the subtitle.
            I will interpret "Y en color gris oscuro" as applying to the "¿Listo para trascender?" text.
            I'll remove the subtitle "Genera ideas..." as the user said "dejemos solamente las palabras '¿Listo para trascender?'".
            The previous code had a subtitle. I will remove it.
        */}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mb-6">
        {currentSuggestions.map((item, index) => (
          <motion.button
            key={`${item.text}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * index }}
            onClick={() => onSuggestionClick(item.text)}
            className="group relative flex flex-col justify-between p-4 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-all duration-300 text-left min-h-[140px]"
          >
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-3">
                {item.text}
              </p>
            </div>
            {/*
                "los cuadros de los prompts tienen mucho espacio, quiero decir, el icono está muy abajo del texto"
                The current layout is flex-col justify-between with min-h-[140px].
                If the text is short, there is a lot of space.
                I will change justify-between to something else, or reduce min-h.
                But user said "el icono está muy abajo del texto".
                I will make the container flex-col but NOT justify-between, instead using gap.
                And I'll keep the icon at the bottom or let it flow?
                "el icono está muy abajo del texto" suggests they want it closer to the text.
                So I will use flex-col and gap-4 (or similar) and remove justify-between.
                Also I will check if min-h is necessary. I'll keep it for uniformity but maybe reduce it or use h-full.
            */}
            <div className="mt-4">
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
