import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Clock,
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
  startOfDay,
  endOfDay,
  eachHourOfInterval,
  isWithinInterval,
  addDays,
  subDays
} from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
registerLocale('es', es);
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getFloatingCardPosition } from '@/lib/floatingCardPosition';
import EventActivityCard from './EventActivityCard';

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('Week');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [hoveredEventData, setHoveredEventData] = useState(null);
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
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PM';

  React.useLayoutEffect(() => {
    if (!hoveredEventData?.triggerRect || !eventCardRef.current) return;

    const cardRect = eventCardRef.current.getBoundingClientRect();
    const position = getFloatingCardPosition(
      hoveredEventData.triggerRect,
      { width: cardRect.width, height: cardRect.height },
      { width: window.innerWidth, height: window.innerHeight }
    );

    setHoveredEventData(prev => prev ? { ...prev, position } : prev);
  }, [hoveredEventData?.event.id]);

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
        const end = endOfDay(addDays(start, 4));
        return { start, end };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [currentDate, view]);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: apiEvents = [] } = useQuery({
    queryKey: ['operational-events', timeframe.start.toISOString(), timeframe.end.toISOString()],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${timeframe.start.toISOString()}&end=${timeframe.end.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    }
  });

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
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      toast.success('Evento eliminado');
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
    if (window.confirm('¿Estás seguro de que deseas eliminar este evento?')) {
      deleteMutation.mutate(id);
    }
  };

  const columns = useMemo(() => {
    if (view === 'Day') {
        return eachHourOfInterval({ start: timeframe.start, end: timeframe.end });
    }
    const days = eachDayOfInterval({ start: timeframe.start, end: timeframe.end });
    return days.filter(d => d.getDay() !== 0 && d.getDay() !== 6);
  }, [timeframe, view]);

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
    const resourceEvents = apiEvents.filter(e => e.type === type);
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
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredEventData({ event, triggerRect: rect });
          }}
          onMouseLeave={() => {
            closeTimerRef.current = setTimeout(() => setHoveredEventData(null), 300);
          }}
          className={cn(
            "absolute min-w-[40px] h-10 flex items-center justify-center rounded-full border shadow-lg transition-all z-20 group hover:scale-110 px-1.5",
            getEventColor(event.type)
          )}
          style={{ left: `${left}%`, top: '50%', transform: 'translateY(-50%)' }}
        >
          <div className="flex items-center -space-x-2">
            <TeamAvatar member={involvedMembers[0]} showTitle={false} className="w-7 h-7 border-2 border-white dark:border-zinc-900 shadow-sm" />
            {involvedMembers.length > 1 && (
                <div className="relative z-10 bg-indigo-600 text-white text-[8px] font-black w-7 h-7 rounded-full flex items-center justify-center border-2 border-white">
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-zinc-900 p-6 rounded-[2.5rem] border border-zinc-200 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-8">
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Periodo de Visualización</span>
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold capitalize text-slate-800 dark:text-white">
                  {view === 'Day' ? format(currentDate, 'd MMMM, yyyy', { locale: es }) :
                   view === 'Week' ? `Semana ${format(currentDate, 'w, yyyy')}` :
                   format(currentDate, 'MMMM yyyy', { locale: es })}
                </h2>
                <div className="flex items-center bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden">
                  <button onClick={() => setCurrentDate(view === 'Day' ? subDays(currentDate, 1) : view === 'Week' ? subDays(currentDate, 7) : subMonths(currentDate, 1))} className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />
                  <button onClick={() => setCurrentDate(view === 'Day' ? addDays(currentDate, 1) : view === 'Week' ? addDays(currentDate, 7) : addMonths(currentDate, 1))} className="p-2.5 hover:bg-zinc-200 dark:hover:bg-white/5"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex p-1 bg-zinc-100 dark:bg-white/5 rounded-xl border">
              {['Day', 'Week', 'Month'].map((v) => (
                <button key={v} onClick={() => setView(v)} className={cn("px-4 py-1.5 rounded-lg text-[10px] font-black uppercase", view === v ? "bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm" : "text-zinc-500")}>
                  {v === 'Day' ? 'Día' : v === 'Week' ? 'Semana' : 'Mes'}
                </button>
              ))}
           </div>
           {isAdmin && <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase"><Plus className="w-4 h-4" /> Nuevo</button>}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border rounded-[2rem] overflow-hidden shadow-xl flex flex-col min-h-[750px]">
        <div className="flex-1 overflow-x-auto relative">
          <div className="min-w-fit" style={{ width: view === 'Month' ? '3000px' : '100%' }}>
            <div className="flex border-b">
                <div className="w-48 min-w-[192px] p-4 border-r bg-zinc-50/50 dark:bg-zinc-950/20"><span className="text-[10px] font-black uppercase text-zinc-400">Áreas / Proyectos</span></div>
                <div className="flex flex-1">
                    {columns.map((col, idx) => (
                        <div key={idx} className={cn("flex-1 min-w-[80px] p-4 text-center border-r flex flex-col gap-1", isSameDay(col, new Date()) && view !== 'Day' && "bg-indigo-50/30")}>
                            <span className="text-[10px] font-black uppercase text-zinc-400">{view === 'Day' ? format(col, 'HH:00') : format(col, 'EEE', { locale: es })}</span>
                            {view !== 'Day' && <span className={cn("text-sm font-bold", isSameDay(col, new Date()) ? "text-indigo-600" : "text-zinc-700")}>{format(col, 'd')}</span>}
                        </div>
                    ))}
                </div>
            </div>
            <div className="relative">
                {['PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK'].map((resourceType) => (
                    <div key={resourceType} className="flex border-b min-h-[140px]">
                        <div className="w-48 min-w-[192px] p-4 border-r flex items-center gap-3 bg-zinc-50/50 dark:bg-zinc-950/20">
                            <div className={cn("p-2 rounded-xl", getEventColor(resourceType).split(' ')[0])}>{getEventIcon(resourceType)}</div>
                            <span className="text-[10px] font-bold uppercase text-zinc-500">{resourceType}</span>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute inset-0 flex">{columns.map((_, i) => <div key={i} className="flex-1 border-r pointer-events-none" />)}</div>
                            <div className="relative h-full py-3">{renderEventsForResource(resourceType)}</div>
                        </div>
                    </div>
                ))}
                {isWithinInterval(now, { start: timeframe.start, end: timeframe.end }) && (
                    <div className="absolute top-0 bottom-0 z-10 pointer-events-none flex flex-col items-center" style={{ left: `${calculateTimePosition(now)}%` }}>
                        <div className="bg-indigo-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full transform -translate-y-1/2">{format(now, 'hh:mm aa')}</div>
                        <div className="w-[1px] h-full bg-indigo-500/40" />
                    </div>
                )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hoveredEventData && createPortal(
          <EventActivityCard
            event={hoveredEventData.event}
            team={team}
            isAdmin={isAdmin}
            onDelete={handleDelete}
            onEdit={handleEdit}
            cardRef={eventCardRef}
            cardPosition={hoveredEventData.position || { left: 0, top: 0 }}
            handleMouseEnter={() => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }}
            handleMouseLeave={() => { closeTimerRef.current = setTimeout(() => setHoveredEventData(null), 300); }}
          />,
          document.body
        )}
      </AnimatePresence>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingEventId ? 'Editar Evento' : 'Nuevo Evento'}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditingEventId(null); }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border p-2 rounded" placeholder="Título" />
              <button type="submit" className="w-full bg-indigo-600 text-white p-2 rounded">Guardar</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalCalendar;
