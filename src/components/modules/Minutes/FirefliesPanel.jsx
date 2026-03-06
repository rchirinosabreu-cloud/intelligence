
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

          const fullText = transcriptData.sentences
              ? transcriptData.sentences.map(s => `[${s.speaker_name || 'Desconocido'}]: ${s.text}`).join('\n')
              : "No hay detalles disponibles.";

          onSelectMeeting({
              ...meeting,
              sentences: transcriptData.sentences,
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
            <Video className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Reuniones Fireflies</h3>
        </div>
        <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            className="h-8 w-8 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20"
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
        <div className="flex flex-col items-center justify-center py-8 text-purple-300">
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
                    ? 'bg-purple-900/40 border-purple-500 shadow-lg shadow-purple-500/20'
                    : 'bg-white dark:bg-zinc-900 border-purple-900/30 hover:border-purple-500/50 hover:bg-white dark:bg-zinc-900'
                }`}
              >
                <h4 className="font-medium text-zinc-900 dark:text-white mb-2 line-clamp-1 group-hover:text-purple-300 transition-colors">
                    {meeting.title || 'Sin título'}
                </h4>
                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-purple-400" />
                    <span>{meeting.date ? new Date(meeting.date).toLocaleDateString('es-ES') : 'N/A'}</span>
                  </div>
                  {meeting.duration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-purple-400" />
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
