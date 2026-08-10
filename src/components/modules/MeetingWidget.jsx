import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Video, Calendar, ExternalLink, Loader2, Clock } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Helper to format time (e.g., "10:30 AM")
const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('es-CO', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        }).format(date);
    } catch (e) {
        return dateStr;
    }
};

const MeetingWidget = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchEvents = async () => {
            if (!localStorage.getItem('authToken')) return;
            try {
                const baseUrl = getApiBaseUrl();
                const response = await fetch(`${baseUrl}/api/calendar/upcoming`);

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                setEvents(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Failed to fetch calendar events:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();

        // Refresh every 5 minutes
        const interval = setInterval(fetchEvents, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Helper to check if event starts in less than 10 mins
    const isStartingSoon = (dateStr) => {
        if (!dateStr) return false;
        const now = new Date();
        const start = new Date(dateStr);
        const diffMs = start - now;
        const diffMins = diffMs / (1000 * 60);
        return diffMins > 0 && diffMins <= 10;
    };

    if (loading) {
        return (
            <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full min-h-[150px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full">
                <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-semibold text-zinc-700 dark:text-zinc-200 text-sm">Próximas reuniones</h3>
                </div>
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    No se pudo cargar el calendario.
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">Próximas reuniones</h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                    Hoy
                </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-zinc-400 dark:text-zinc-500 space-y-2">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                            <Clock className="w-5 h-5 opacity-50" />
                        </div>
                        <p className="text-xs">No hay reuniones pendientes hoy</p>
                    </div>
                ) : (
                    events.map((event) => {
                        const isSoon = isStartingSoon(event.start_time);

                        return (
                            <div
                                key={event.id}
                                className={cn(
                                    "flex items-center justify-between p-2.5 rounded-xl border transition-all",
                                    isSoon
                                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 shadow-sm"
                                        : "bg-white dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                                )}
                            >
                                <div className="flex flex-col min-w-0 flex-1 mr-3">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={cn(
                                            "text-xs font-bold font-mono",
                                            isSoon ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"
                                        )}>
                                            {formatTime(event.start_time)}
                                        </span>
                                        {isSoon && (
                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-px rounded uppercase tracking-wide animate-pulse">
                                                En breve
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate" title={event.title}>
                                        {event.title}
                                    </h4>
                                </div>

                                {event.meet_link ? (
                                    <a
                                        href={event.meet_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            "flex items-center justify-center w-8 h-8 rounded-xl transition-colors flex-shrink-0",
                                            isSoon
                                                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                                                : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                                        )}
                                        title="Unirse a Google Meet"
                                    >
                                        <Video className="w-4 h-4" />
                                    </a>
                                ) : (
                                    event.html_link && (
                                        <a
                                            href={event.html_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
                                            title="Ver en Calendario"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default MeetingWidget;
