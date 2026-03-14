
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Calendar, Clock, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import frontendApiService from '../../../services/frontendApiService';
import { Button } from './ui/button';

const FirefliesPanel = ({ onSelectMeeting, selectedMeeting }) => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await frontendApiService.getTranscripts(50, 0);
      setMeetings(data.transcripts || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const handleRetry = () => {
    loadMeetings();
  };

  const handleMeetingClick = async (meeting) => {
      // Optimistically select it
      onSelectMeeting({
          id: meeting.id,
          title: meeting.title,
          date: meeting.date,
          text: "Cargando transcripción completa...",
          sentences: []
      });

      try {
          const details = await frontendApiService.getTranscriptDetails(meeting.id);
          const transcriptData = details.transcript;

          let fullText = "";

          // Data enrichment from Fireflies (Official Schema Fields - Fixed Plurals)
          if (transcriptData.summary) {
              const { overview, outline, keywords, action_items, notes } = transcriptData.summary;

              if (overview) fullText += `### PANORAMA (OVERVIEW) ###\n${overview}\n\n`;
              if (outline) fullText += `### ESTRUCTURA (OUTLINE) ###\n${outline}\n\n`;
              if (keywords && Array.isArray(keywords) && keywords.length > 0) {
                  fullText += `### PALABRAS CLAVE ###\n${keywords.join(', ')}\n\n`;
              }
              if (action_items && Array.isArray(action_items) && action_items.length > 0) {
                  fullText += `### ACCIONES DETECTADAS ###\n${action_items.join('\n')}\n\n`;
              }
              if (notes) fullText += `### NOTAS ADICIONALES ###\n${notes}\n\n`;
          }

          fullText += "### TRANSCRIPCIÓN COMPLETA ###\n";

          // Handle both 'sentence' and 'sentences' schema variations
          const sentences = transcriptData.sentence || transcriptData.sentences || [];

          if (sentences.length > 0) {
              fullText += sentences.map(s => {
                  const speaker = s.speaker_name || 'Desconocido';
                  const text = s.raw_text || s.text || '';
                  return `[${speaker}]: ${text}`;
              }).join('\n');
          } else {
              fullText += "No hay detalles de la transcripción disponibles.";
          }

          onSelectMeeting({
              ...meeting,
              sentences: sentences,
              text: fullText
          });

      } catch(err) {
          console.error("Failed to load details", err);
      }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Reuniones Fireflies</h3>
        </div>
        <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
        >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm"
          >
            <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Error cargando reuniones</span>
            </div>
            <p className="text-xs opacity-80">{error}</p>
            {error.includes("CORS") && (
                <p className="text-xs mt-1 bg-red-900/40 p-1 rounded">
                    Nota: La API de Fireflies puede bloquear solicitudes directas.
                </p>
            )}
            <Button size="sm" variant="outline" className="text-xs h-6 mt-1 border-red-500/50 hover:bg-red-900/30 text-red-200" onClick={handleRetry}>
                Reintentar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && !meetings.length ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">Cargando...</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {meetings.length === 0 && !loading && !error && (
             <p className="text-zinc-500 dark:text-zinc-400 text-center py-4 text-sm">No se encontraron reuniones recientes.</p>
          )}

          <AnimatePresence>
            {meetings.map((meeting, index) => (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleMeetingClick(meeting)}
                className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 group ${
                  selectedMeeting?.id === meeting.id
                    ? 'bg-muted/50 border-primary shadow-sm '
                    : 'bg-white dark:bg-zinc-900 border-border hover:border-border hover:bg-white dark:bg-zinc-900'
                }`}
              >
                <h4 className="font-medium text-zinc-900 dark:text-white mb-2 line-clamp-1 group-hover:text-muted-foreground transition-colors">
                    {meeting.title || 'Sin título'}
                </h4>
                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span>{meeting.date ? new Date(meeting.date).toLocaleDateString('es-ES') : 'N/A'}</span>
                  </div>
                  {meeting.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>{Math.round(meeting.duration / 60)} min</span>
                    </div>
                  )}
                </div>
                {meeting.organizer_email && (
                    <div className="text-xs text-gray-500 mt-2 truncate">
                        Org: {meeting.organizer_email}
                    </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default FirefliesPanel;
