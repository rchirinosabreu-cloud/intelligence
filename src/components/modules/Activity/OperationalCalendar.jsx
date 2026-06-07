import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Video,
  UserX,
  Zap,
  Lock,
  Sparkles,
  Coffee
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachHourOfInterval,
  isWithinInterval,
  addDays,
  differenceInMinutes
} from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
registerLocale('es', es);
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('Week');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [hoveredEventData, setHoveredEventData] = useState(null); // { event, rect }
  const closeTimerRef = React.useRef(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'PRODUCTION',
    startAt: new Date(),
    endAt: new Date(),
    memberIds: [],
    recurrence: 'NONE',
    recurrenceEnd: null,
    meetingLink: '',
    description: ''
  });

  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PM';

  // Fetch Team for assignment
  const { data: team = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/team`);
      return res.json();
    }
  });

  const timeframe = useMemo(() => {
    if (view === 'Day') {
        const start = new Date(currentDate);
        start.setHours(7, 0, 0, 0);
        const end = new Date(currentDate);
        end.setHours(18, 0, 0, 0);
        return { start, end };
    } else if (view === 'Week') {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfDay(addDays(start, 4)); // Friday 23:59
        return { start, end };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [currentDate, view]);

  // Update current time every minute
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Events
  const { data: apiEvents = [], isLoading } = useQuery({
    queryKey: ['operational-events', timeframe.start.toISOString(), timeframe.end.toISOString()],
    queryFn: async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${timeframe.start.toISOString()}&end=${timeframe.end.toISOString()}`);
        if (!res.ok) throw new Error('Failed to fetch events');
        return res.json();
      } catch (err) {
        console.error("Calendar fetch error:", err);
        return [];
      }
    }
  });

  const events = apiEvents;

  const eventMutation = useMutation({
    mutationFn: async (eventData) => {
      const url = editingEventId
        ? `${getApiBaseUrl()}/api/activity/events/${editingEventId}`
        : `${getApiBaseUrl()}/api/activity/events`;

      const res = await fetch(url, {
        method: editingEventId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      setIsModalOpen(false);
      setEditingEventId(null);
      toast.success(editingEventId ? 'Evento actualizado' : 'Evento creado');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      return res.json();
    },
    onSuccess: () => {
      // Invalidate both events and status to trigger immediate UI update
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      toast.success('Evento eliminado');
    },
    onError: (error) => {
      console.error("Deletion error:", error);
      toast.error('No se pudo eliminar el evento');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    eventMutation.mutate(formData);
  };

  const generateMeetLink = async () => {
    if (!formData.title || !formData.startAt || !formData.endAt) {
      toast.error('Completa título y fechas para generar link');
      return;
    }

    setIsGeneratingLink(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events/generate-meet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          startAt: formData.startAt,
          endAt: formData.endAt,
          description: formData.description
        })
      });

      if (!res.ok) throw new Error('Error en el servidor');
      const data = await res.json();
      setFormData({ ...formData, meetingLink: data.meetingLink });
      toast.success('Google Meet generado');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo generar el link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleEdit = (event) => {
    setEditingEventId(event.id);
    setFormData({
      title: event.title,
      type: event.type,
      startAt: new Date(event.startAt),
      endAt: new Date(event.endAt),
      memberIds: event.memberIds || [],
      recurrence: event.recurrence || 'NONE',
      recurrenceEnd: event.recurrenceEnd ? new Date(event.recurrenceEnd) : null,
      meetingLink: event.meetingLink || '',
      description: event.description || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este evento? Esta acción no se puede deshacer.')) {
      deleteMutation.mutate(id);
    }
  };


  const columns = useMemo(() => {
    if (view === 'Day') {
        return eachHourOfInterval({ start: timeframe.start, end: timeframe.end });
    }
    const days = eachDayOfInterval({ start: timeframe.start, end: timeframe.end });
    // Filter out weekends (6: Saturday, 0: Sunday)
    return days.filter(d => d.getDay() !== 0 && d.getDay() !== 6);
  }, [timeframe, view]);

  const filteredEvents = events;

  const getEventIcon = (type) => {
    switch (type) {
      case 'PRODUCTION': return <Video className="w-3 h-3" />;
      case 'ABSENCE': return <UserX className="w-3 h-3" />;
      case 'PROJECT': return <Zap className="w-3 h-3" />;
      case 'MEETING': return <Lock className="w-3 h-3" />;
      case 'WORK_DAY': return <Clock className="w-3 h-3" />;
      case 'BREAK': return <Coffee className="w-3 h-3" />;
      default: return null;
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'PRODUCTION': return 'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-200/50';
      case 'ABSENCE': return 'bg-red-500/10 text-red-700 border-red-200/50';
      case 'PROJECT': return 'bg-indigo-500/10 text-indigo-700 border-indigo-200/50';
      case 'MEETING': return 'bg-slate-500/10 text-slate-700 border-slate-200/50';
      case 'BREAK': return 'bg-orange-500/10 text-orange-700 border-orange-200/50';
      default: return 'bg-zinc-500/10 text-zinc-700 border-zinc-200/50';
    }
  };

  const calculateTimePosition = (date) => {
    const totalDuration = timeframe.end.getTime() - timeframe.start.getTime();
    const elapsed = date.getTime() - timeframe.start.getTime();
    return Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
  };

  const renderEventsForResource = (type) => {
    const resourceEvents = filteredEvents.filter(e => e.type === type);

    return resourceEvents.map((event, idx) => {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);

      const left = calculateTimePosition(start);
      const right = calculateTimePosition(end);
      const width = right - left;

      if (width <= 0 && (start > timeframe.end || end < timeframe.start)) return null;

      const involvedMembers = team.filter(m => (event.memberIds || []).includes(m.id));

      return (
        <button
          key={`${event.id}-${idx}`}
          onMouseEnter={(e) => {
            e.stopPropagation();
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredEventData({ event, rect });
          }}
          onMouseLeave={() => {
            closeTimerRef.current = setTimeout(() => {
                setHoveredEventData(null);
            }, 300);
          }}
          className={cn(
            "absolute w-10 h-10 flex items-center justify-center rounded-full border shadow-lg transition-all z-20 group hover:scale-110 active:scale-95 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none",
            getEventColor(event.type)
          )}
          style={{
            left: `${left}%`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          <div className="relative pointer-events-none">
             <TeamAvatar
                member={involvedMembers[0]}
                showTitle={false}
                className="w-7 h-7 border-2 border-white dark:border-zinc-900 shadow-sm"
             />
             {involvedMembers.length > 1 && (
                <div className="absolute -right-2 -bottom-1 bg-indigo-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900">
                    +{involvedMembers.length - 1}
                </div>
             )}
          </div>
        </button>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* --- PREMIUM HEADER CONTROLS --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-200 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-8">
           {/* Date & View Controls */}
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Periodo de Visualización</span>
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold capitalize text-slate-800 dark:text-white">
                  {view === 'Day' ? format(currentDate, 'd MMMM, yyyy', { locale: es }) :
                   view === 'Week' ? `Semana ${format(currentDate, 'w, yyyy')}` :
                   format(currentDate, 'MMMM yyyy', { locale: es })}
                </h2>
                <div className="flex items-center bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => {
                        if (view === 'Day') setCurrentDate(prev => new Date(prev.setDate(prev.getDate() - 1)));
                        else if (view === 'Week') setCurrentDate(prev => new Date(prev.setDate(prev.getDate() - 7)));
                        else setCurrentDate(subMonths(currentDate, 1));
                    }}
                    className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
                  </button>
                  <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />
                  <button
                    onClick={() => {
                        if (view === 'Day') setCurrentDate(prev => new Date(prev.setDate(prev.getDate() + 1)));
                        else if (view === 'Week') setCurrentDate(prev => new Date(prev.setDate(prev.getDate() + 7)));
                        else setCurrentDate(addMonths(currentDate, 1));
                    }}
                    className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
                  </button>
                </div>
              </div>
           </div>
        </div>

        <div className="flex items-center gap-4">
           {/* View Selector */}
           <div className="flex p-1 bg-zinc-100 dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/10">
              {['Day', 'Week', 'Month'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    view === v ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  )}
                >
                  {v === 'Day' ? 'Día' : v === 'Week' ? 'Semana' : 'Mes'}
                </button>
              ))}
           </div>

           {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
           )}
        </div>
      </div>

      {/* --- TIMELINE GRID --- */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-[2rem] overflow-hidden shadow-xl flex flex-col min-h-[750px]">
        <div className="flex-1 overflow-x-auto custom-scrollbar relative">
          <div
            className="min-w-fit"
            style={{ width: view === 'Month' ? '3000px' : '100%' }}
          >
            {/* Timeline Header (Time Scale) */}
            <div className="flex border-b border-zinc-100 dark:border-white/5">
                <div className="w-48 min-w-[192px] shrink-0 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 border-r border-zinc-100 dark:border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Áreas / Proyectos</span>
                </div>
                <div className="flex flex-1">
                    {columns.map((col, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "flex-1 min-w-[80px] p-4 text-center border-r border-zinc-100 dark:border-white/5 flex flex-col gap-1",
                                isSameDay(col, new Date()) && view !== 'Day' && "bg-indigo-50/30 dark:bg-indigo-900/10"
                            )}
                        >
                            <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-400">
                                {view === 'Day' ? format(col, 'HH:00') : format(col, 'EEE', { locale: es })}
                            </span>
                            {view !== 'Day' && (
                                <span className={cn(
                                    "text-sm font-bold",
                                    isSameDay(col, new Date()) && view !== 'Day' ? "text-indigo-600" : "text-zinc-700 dark:text-zinc-300"
                                )}>
                                    {format(col, 'd')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Timeline Rows (Resources) */}
            <div className="relative">
                {['PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK'].map((resourceType) => (
                    <div key={resourceType} className="flex border-b border-zinc-100 dark:border-white/5 group/row min-h-[140px]">
                        <div className="w-48 min-w-[192px] shrink-0 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 border-r border-zinc-100 dark:border-white/5 flex items-center gap-3">
                            <div className={cn("p-2 rounded-xl", getEventColor(resourceType).split(' ')[0])}>
                                {getEventIcon(resourceType)}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                                {resourceType === 'PRODUCTION' ? 'Producción' :
                                 resourceType === 'PROJECT' ? 'Proyectos' :
                                 resourceType === 'MEETING' ? 'Reuniones' :
                                 resourceType === 'ABSENCE' ? 'Ausencias' : 'Descansos'}
                            </span>
                        </div>
                        <div className="flex-1 relative">
                            {/* Visual Grid Lines */}
                            <div className="absolute inset-0 flex">
                                {columns.map((_, i) => (
                                    <div key={i} className="flex-1 border-r border-zinc-50 dark:border-white/5 pointer-events-none" />
                                ))}
                            </div>

                            {/* Event Capsules Container */}
                            <div className="relative h-full py-3">
                                {renderEventsForResource(resourceType)}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Current Time Indicator */}
                {isWithinInterval(now, { start: timeframe.start, end: timeframe.end }) && (
                    <div
                        className="absolute top-0 bottom-0 z-10 pointer-events-none flex flex-col items-center"
                        style={{ left: `${calculateTimePosition(now)}%` }}
                    >
                        <div className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-lg transform -translate-y-1/2 whitespace-nowrap">
                            {format(now, 'hh:mm aa')}
                        </div>
                        <div className="w-[1px] h-full bg-indigo-500/40" />
                    </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Popover (Portal) */}
      <AnimatePresence>
        {hoveredEventData && createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[9999] w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl p-5 pointer-events-auto"
            style={{
              left: hoveredEventData.rect.left + (hoveredEventData.rect.width / 2),
              top: hoveredEventData.rect.top - 16,
              transform: 'translate(-50%, -100%)'
            }}
            onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            }}
            onMouseLeave={() => {
                closeTimerRef.current = setTimeout(() => {
                    setHoveredEventData(null);
                }, 300);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <h4 className="text-[13px] font-bold text-zinc-900 dark:text-white leading-tight truncate">
                    {hoveredEventData.event.title}
                  </h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="indigo" className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                      {hoveredEventData.event.type === 'PRODUCTION' ? 'Producción' :
                       hoveredEventData.event.type === 'PROJECT' ? 'Proyecto' :
                       hoveredEventData.event.type === 'MEETING' ? 'Reunión' :
                       hoveredEventData.event.type === 'ABSENCE' ? 'Ausencia' :
                       hoveredEventData.event.type === 'WORK_DAY' ? 'Jornada' : 'Descanso'}
                    </Badge>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(hoveredEventData.event.id);
                    }}
                    className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 rounded-xl transition-all shadow-sm shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-white/5 p-2.5 rounded-xl border border-zinc-100 dark:border-white/5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                {format(new Date(hoveredEventData.event.startAt), 'HH:mm')} - {format(new Date(hoveredEventData.event.endAt), 'HH:mm')}
              </div>

              {hoveredEventData.event.description && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                  {hoveredEventData.event.description}
                </p>
              )}

              <div className="pt-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-2">Involucrados</span>
                <div className="flex -space-x-2">
                  {team.filter(m => (hoveredEventData.event.memberIds || []).includes(m.id)).map(m => (
                    <TeamAvatar key={m.id} member={m} className="w-7 h-7 border-2 border-white dark:border-zinc-900 shadow-sm" />
                  ))}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleEdit(hoveredEventData.event)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  Editar Evento
                </button>
              )}
            </div>
            {/* Popover Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[10px] border-transparent border-t-white dark:border-t-zinc-900" />
          </motion.div>,
          document.body
        )}
      </AnimatePresence>

      {/* Modal for Creating Event */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingEventId ? 'Editar Evento' : 'Nuevo Evento Operativo'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingEventId(null); }} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Título del Evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Jornada con TruPeak"
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all shadow-sm"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tipo</label>
                  <select
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="PRODUCTION">🎬 Producción</option>
                    <option value="ABSENCE">🏖️ Permiso/Ausencia</option>
                    <option value="PROJECT">🚀 Proyecto Especial</option>
                    <option value="MEETING">🤝 Reunión</option>
                    <option value="WORK_DAY">💻 Jornada Laboral</option>
                    <option value="BREAK">☕ Descanso / Café</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recurrencia</label>
                  <select
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    value={formData.recurrence}
                    onChange={e => setFormData({...formData, recurrence: e.target.value})}
                  >
                    <option value="NONE">Única vez</option>
                    <option value="WEEKLY">Semanal</option>
                  </select>
                </div>
              </div>

              {formData.recurrence === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Hasta cuándo (Horizonte)</label>
                  <DatePicker
                    selected={formData.recurrenceEnd}
                    onChange={date => setFormData({...formData, recurrenceEnd: date})}
                    dateFormat="d MMMM, yyyy"
                    locale="es"
                    placeholderText="Seleccionar fecha fin de recurrencia"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
              )}

              {formData.type === 'MEETING' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Link de Reunión</label>
                    <button
                      type="button"
                      onClick={generateMeetLink}
                      disabled={isGeneratingLink}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {isGeneratingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generar automático
                    </button>
                  </div>
                  <div className="relative">
                    <Video className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="url"
                      placeholder="https://meet.google.com/..."
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                      value={formData.meetingLink}
                      onChange={e => setFormData({...formData, meetingLink: e.target.value})}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Contexto adicional para el equipo..."
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm resize-none"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Inicio</label>
                  <DatePicker
                    selected={formData.startAt}
                    onChange={date => setFormData({...formData, startAt: date})}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMMM, yyyy h:mm aa"
                    locale="es"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Fin</label>
                  <DatePicker
                    selected={formData.endAt}
                    onChange={date => setFormData({...formData, endAt: date})}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMMM, yyyy h:mm aa"
                    locale="es"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Involucrados</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  {team.map(member => (
                    <label key={member.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white dark:hover:bg-zinc-700">
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
                        checked={formData.memberIds.includes(member.id)}
                        onChange={e => {
                          const newIds = e.target.checked
                            ? [...formData.memberIds, member.id]
                            : formData.memberIds.filter(id => id !== member.id);
                          setFormData({...formData, memberIds: newIds});
                        }}
                      />
                      <span className="text-[10px] font-medium">{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={eventMutation.isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {eventMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingEventId ? 'Actualizar Evento' : 'Guardar Evento'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalCalendar;
