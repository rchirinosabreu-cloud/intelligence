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
  Coffee,
  X,
  PlusCircle
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
  differenceInMinutes,
  setHours,
  setMinutes,
  subDays
} from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Badge } from '@/components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getFloatingCardPosition } from '@/lib/floatingCardPosition';
import EventActivityCard from './EventActivityCard';

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('authToken')}`
});

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('Week');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);

  // Persisted state for Fade Segura
  const [hoveredEventData, setHoveredEventData] = useState(null); // { event, triggerRect }
  const [activeEventCardData, setActiveEventCardData] = useState(null); // { event, position }
  const [isCardOpen, setIsCardOpen] = useState(false);

  const closeTimerRef = React.useRef(null);
  const eventCardRef = React.useRef(null);

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
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER';

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!isCardOpen) return;

    if (hoveredEventData?.triggerRect && eventCardRef.current) {
        const cardRect = eventCardRef.current.getBoundingClientRect();
        const position = getFloatingCardPosition(
          hoveredEventData.triggerRect,
          { width: cardRect.width, height: cardRect.height },
          { width: window.innerWidth, height: window.innerHeight }
        );

        setActiveEventCardData({
            event: hoveredEventData.event,
            position
        });
    }
  }, [isCardOpen, hoveredEventData?.event.id, hoveredEventData?.triggerRect]);


  // Fetch Team for assignment
  const { data: team = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/team`, { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error('Failed to fetch team');
      }
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
        const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${timeframe.start.toISOString()}&end=${timeframe.end.toISOString()}`, {
          headers: getAuthHeaders()
        });
        if (!res.ok) {
          throw new Error('Failed to fetch events');
        }
        return res.json();
      } catch (err) {
        console.error("Calendar fetch error:", err);
        return [];
      }
    }
  });

  const events = apiEvents;

  const { data: googleCalendarStatus } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/status`, { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error('Failed to fetch Google Calendar status');
      }
      return res.json();
    }
  });

  const connectGoogleCalendar = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/auth-url`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo iniciar la conexion');
      }
      const data = await res.json();
      window.location.href = data.url;
    } catch (error) {
      console.error('Google Calendar auth URL error:', error);
      toast.error(error.message || 'No se pudo conectar Google Calendar');
    }
  };

  const googleCalendarSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          start: timeframe.start.toISOString(),
          end: timeframe.end.toISOString()
        })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo sincronizar Google Calendar');
      }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      queryClient.invalidateQueries(['google-calendar-status']);
      toast.success(`Google Calendar sincronizado (${result.imported || 0} nuevos, ${result.updated || 0} actualizados)`);
    },
    onError: (error) => {
      console.error('Google Calendar sync error:', error);
      toast.error(error.message || 'No se pudo sincronizar Google Calendar');
    }
  });

  const eventMutation = useMutation({
    mutationFn: async (eventData) => {
      const url = editingEventId
        ? `${getApiBaseUrl()}/api/activity/events/${editingEventId}`
        : `${getApiBaseUrl()}/api/activity/events`;

      const res = await fetch(url, {
        method: editingEventId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(eventData)
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'Failed to save event');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      setIsModalOpen(false);
      setEditingEventId(null);
      toast.success(editingEventId ? 'Evento actualizado' : 'Evento creado');
    },
    onError: (error) => {
      console.error('Operational event save error:', error);
      toast.error(error.message || 'No se pudo guardar el evento');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    setIsCardOpen(false);
    setHoveredEventData(null);
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

  const handleSlotClick = (date, resourceType) => {
    if (!isAdmin) return;

    let start = new Date(date);
    if (view !== 'Day') {
       // date is start of day, set to a default operational hour (e.g., 9:00 AM)
       start = setHours(start, 9);
       start = setMinutes(start, 0);
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

    setFormData({
      ...formData,
      type: resourceType || 'PRODUCTION',
      startAt: start,
      endAt: end,
      title: '',
      description: '',
      memberIds: [],
      meetingLink: '',
      recurrence: 'NONE'
    });
    setEditingEventId(null);
    setIsModalOpen(true);
  };

  const handlePointerEnterTrigger = (e, event) => {
    e.stopPropagation();
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Interaction] Pointer Enter Trigger: ${event.title}`);
    }
    if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();

    // Immediate calculation to prevent jumps
    const cardWidth = 288; // 72 * 4
    const cardHeight = 200;
    const position = getFloatingCardPosition(
      rect,
      { width: cardWidth, height: cardHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );

    setHoveredEventData({ event, triggerRect: rect });
    setActiveEventCardData({ event, position });
    setIsCardOpen(true);
  };

  const handlePointerLeaveTrigger = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Interaction] Pointer Leave Trigger`);
    }
    if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
        setIsCardOpen(false);
        closeTimerRef.current = null;
    }, 300);
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
          onPointerEnter={(e) => handlePointerEnterTrigger(e, event)}
          onPointerLeave={handlePointerLeaveTrigger}
          onFocus={(e) => handlePointerEnterTrigger(e, event)}
          onBlur={handlePointerLeaveTrigger}
          onClick={(e) => {
            e.stopPropagation();
            handlePointerEnterTrigger(e, event);
          }}
          aria-expanded={hoveredEventData?.event.id === event.id}
          aria-haspopup="dialog"
          aria-label={`Ver detalles de ${event.title}`}
          className={cn(
            "absolute min-w-[40px] h-10 flex items-center justify-center rounded-full border shadow-lg transition-all z-20 group hover:scale-110 active:scale-95 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none px-1.5",
            getEventColor(event.type)
          )}
          style={{
            left: `${left}%`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          <div className="relative pointer-events-none flex items-center justify-center">
             <div className="flex items-center -space-x-2">
                <div className="relative z-0">
                   <TeamAvatar
                      member={involvedMembers[0]}
                      showTitle={false}
                      className="w-7 h-7 border-2 border-white dark:border-zinc-900 shadow-sm ring-1 ring-zinc-200/50 dark:ring-white/10"
                   />
                </div>
                {involvedMembers.length > 1 && (
                    <div className="relative z-10 bg-indigo-600 text-white text-[8px] font-black w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-sm shrink-0">
                        +{involvedMembers.length - 1}
                    </div>
                )}
             </div>
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
                        if (view === 'Day') setCurrentDate(prev => subDays(prev, 1));
                        else if (view === 'Week') setCurrentDate(prev => subDays(prev, 7));
                        else setCurrentDate(subMonths(currentDate, 1));
                    }}
                    className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
                  </button>
                  <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />
                  <button
                    onClick={() => {
                        if (view === 'Day') setCurrentDate(prev => addDays(prev, 1));
                        else if (view === 'Week') setCurrentDate(prev => addDays(prev, 7));
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
           {isAdmin && (
            <div className="flex items-center gap-2">
              {googleCalendarStatus?.connected ? (
                <button
                  type="button"
                  onClick={() => googleCalendarSyncMutation.mutate()}
                  disabled={googleCalendarSyncMutation.isPending}
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-all hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                  title={googleCalendarStatus.email}
                >
                  {googleCalendarSyncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarIcon className="w-3.5 h-3.5" />}
                  Sincronizar Google
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connectGoogleCalendar}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600 transition-all hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Conectar Google
                </button>
              )}
            </div>
           )}

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
              onClick={() => {
                setFormData({
                  ...formData,
                  startAt: startOfDay(currentDate),
                  endAt: addDays(startOfDay(currentDate), 0),
                  title: '',
                  description: '',
                  memberIds: [],
                  type: 'PRODUCTION',
                  meetingLink: '',
                  recurrence: 'NONE'
                });
                setEditingEventId(null);
                setIsModalOpen(true);
              }}
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
                                {columns.map((col, i) => (
                                    <div
                                      key={i}
                                      onClick={() => handleSlotClick(col, resourceType)}
                                      className="flex-1 border-r border-zinc-50 dark:border-white/5 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-white/5 transition-colors"
                                    />
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

      {/* Direct portal: persisted for Fade Segura */}
      {activeEventCardData && createPortal(
        <AnimatePresence>
          {isCardOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                zIndex: 2147483647,
                pointerEvents: 'none'
              }}
            >
              <EventActivityCard
                isOpen={true}
                event={activeEventCardData.event}
                team={team}
                isAdmin={isAdmin}
                onDelete={handleDelete}
                onEdit={handleEdit}
                cardRef={eventCardRef}
                cardPosition={activeEventCardData.position}
                handlePointerEnter={() => {
                  if (closeTimerRef.current) {
                      clearTimeout(closeTimerRef.current);
                      closeTimerRef.current = null;
                  }
                  setIsCardOpen(true);
                }}
                handlePointerLeave={() => {
                  if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = setTimeout(() => {
                    setIsCardOpen(false);
                    closeTimerRef.current = null;
                  }, 300);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Modal for Creating Event (Full Restored Form) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingEventId ? 'Editar Evento' : 'Nuevo Evento Operativo'}</h3>
              <button
                onClick={() => { setIsModalOpen(false); setEditingEventId(null); }}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
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
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tipo / Categoría</label>
                  <select
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="PRODUCTION">🎬 Producción</option>
                    <option value="ABSENCE">🏖️ Permiso/Ausencia</option>
                    <option value="PROJECT">🚀 Proyecto Especial</option>
                    <option value="MEETING">🤝 Reunión</option>
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
                    {...brainDatePickerProps}
                    selected={formData.recurrenceEnd}
                    onChange={date => setFormData({...formData, recurrenceEnd: date})}
                    dateFormat="d MMMM, yyyy"
                    placeholderText="Seleccionar fecha fin"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
              )}

              {formData.type === 'MEETING' && (
                <div className="space-y-2 py-2 px-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Google Meet</label>
                    <button
                      type="button"
                      onClick={generateMeetLink}
                      disabled={isGeneratingLink}
                      className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full hover:bg-indigo-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isGeneratingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      GENERAR AUTOMÁTICO
                    </button>
                  </div>
                  <div className="relative">
                    <Video className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                    <input
                      type="url"
                      placeholder="https://meet.google.com/..."
                      className="w-full bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-500/20 rounded-xl pl-11 pr-4 py-2 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
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
                    {...brainDatePickerProps}
                    selected={formData.startAt}
                    onChange={date => setFormData({...formData, startAt: date})}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMM, HH:mm"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Fin</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.endAt}
                    onChange={date => setFormData({...formData, endAt: date})}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMM, HH:mm"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-sm"
                    wrapperClassName="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Equipo Involucrado</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 custom-scrollbar">
                  {team.map(member => (
                    <label key={member.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-700 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-600">
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600 w-3.5 h-3.5"
                        checked={formData.memberIds.includes(member.id)}
                        onChange={e => {
                          const newIds = e.target.checked
                            ? [...formData.memberIds, member.id]
                            : formData.memberIds.filter(id => id !== member.id);
                          setFormData({...formData, memberIds: newIds});
                        }}
                      />
                      <TeamAvatar member={member} showTitle={false} className="w-5 h-5" />
                      <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 truncate">{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={eventMutation.isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest py-3 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {eventMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
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
