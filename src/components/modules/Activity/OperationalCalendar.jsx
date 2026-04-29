import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
registerLocale('es', es);
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
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

  // Fetch Events
  const { data: apiEvents = [], isLoading } = useQuery({
    queryKey: ['operational-events', format(currentDate, 'yyyy-MM')],
    queryFn: async () => {
      try {
        const start = startOfMonth(currentDate).toISOString();
        const end = endOfMonth(currentDate).toISOString();
        const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${start}&end=${end}`);
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
      await fetch(`${getApiBaseUrl()}/api/activity/events/${id}`, { method: 'DELETE' });
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

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const days = eachDayOfInterval({
    start: monthStart,
    end: monthEnd
  });

  // Function to project events (including multi-day and recurring) into the calendar grid
  const getProjectedEvents = () => {
    const projected = [];
    events.forEach(event => {
      const eventStart = new Date(event.startAt);
      const eventEnd = new Date(event.endAt);

      if (event.recurrence === 'NONE' || !event.recurrence) {
        // Multi-day non-recurring events: Project into each day
        let currentDay = new Date(eventStart);
        currentDay.setHours(0, 0, 0, 0);

        const lastDay = new Date(eventEnd);
        lastDay.setHours(0, 0, 0, 0);

        while (currentDay <= lastDay) {
          if (currentDay >= monthStart && currentDay <= monthEnd) {
            projected.push({
              ...event,
              // Display dates for the specific cell
              displayStartAt: currentDay.toISOString(),
              isMultiDay: !isSameDay(eventStart, eventEnd),
              isFirstDay: isSameDay(currentDay, eventStart),
              isLastDay: isSameDay(currentDay, eventEnd)
            });
          }
          currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
        }
      } else if (event.recurrence === 'WEEKLY') {
        let currentInstanceStart = new Date(eventStart);
        const duration = eventEnd.getTime() - eventStart.getTime();
        const limit = event.recurrenceEnd ? new Date(event.recurrenceEnd) : monthEnd;

        // Move current to the first instance that could overlap with the visible month
        // (Even if it started weeks ago, a multi-day instance might still overlap)
        while (new Date(currentInstanceStart.getTime() + duration) < monthStart) {
          currentInstanceStart = new Date(currentInstanceStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        }

        const maxDate = limit < monthEnd ? limit : monthEnd;

        while (currentInstanceStart <= maxDate) {
            const instanceEnd = new Date(currentInstanceStart.getTime() + duration);

            let currentDay = new Date(currentInstanceStart);
            currentDay.setHours(0, 0, 0, 0);

            const lastDay = new Date(instanceEnd);
            lastDay.setHours(0, 0, 0, 0);

            while (currentDay <= lastDay) {
                if (currentDay >= monthStart && currentDay <= monthEnd) {
                    projected.push({
                        ...event,
                        displayStartAt: currentDay.toISOString(),
                        isProjected: true,
                        isMultiDay: !isSameDay(currentInstanceStart, instanceEnd),
                        isFirstDay: isSameDay(currentDay, currentInstanceStart),
                        isLastDay: isSameDay(currentDay, lastDay)
                    });
                }
                currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
            }
            currentInstanceStart = new Date(currentInstanceStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        }
      }
    });
    return projected;
  };

  const projectedEvents = getProjectedEvents();

  const getEventIcon = (type) => {
    switch (type) {
      case 'PRODUCTION': return <Video className="w-3 h-3" />;
      case 'ABSENCE': return <UserX className="w-3 h-3" />;
      case 'PROJECT': return <Zap className="w-3 h-3" />;
      case 'MEETING': return <Lock className="w-3 h-3" />;
      default: return null;
    }
  };

  const getEventColor = (type) => {
    switch (type) {
      case 'PRODUCTION': return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 dark:border-fuchsia-800';
      case 'ABSENCE': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'PROJECT': return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800';
      case 'MEETING': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      default: return 'bg-zinc-100 text-zinc-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </h2>
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            Nuevo Evento
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
          <div key={day} className="bg-zinc-50 dark:bg-zinc-900/50 p-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{day}</span>
          </div>
        ))}

        {/* Placeholder for days before start of month */}
        {[...Array((days[0].getDay() + 6) % 7)].map((_, i) => (
          <div key={`empty-${i}`} className="bg-white dark:bg-zinc-900/30 p-4" />
        ))}

        {days.map(day => (
          <div key={day.toString()} className="bg-white dark:bg-zinc-900 p-2 md:p-4 min-h-[120px] md:min-h-[140px] transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/5">
            <span className={cn(
              "text-sm font-bold",
              isSameDay(day, new Date()) ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-600"
            )}>
              {format(day, 'd')}
            </span>
            <div className="mt-2 space-y-1">
              {projectedEvents.filter(e => isSameDay(new Date(e.displayStartAt || e.startAt), day)).map((event, idx) => (
                <div
                  key={`${event.id}-${idx}`}
                  onClick={() => isAdmin && handleEdit(event)}
                  className={cn(
                    "group relative p-1.5 border text-[10px] font-medium transition-all flex items-center gap-1.5",
                    isAdmin ? "cursor-pointer hover:shadow-md" : "cursor-default",
                    getEventColor(event.type),
                    // Multi-day visualization logic
                    event.isMultiDay ? (
                        event.isFirstDay ? "rounded-l-lg border-r-0 mr-[-2px] z-10" :
                        event.isLastDay ? "rounded-r-lg border-l-0 ml-[-2px]" :
                        "rounded-none border-x-0 mx-[-2px]"
                    ) : "rounded-lg"
                  )}
                >
                  {(!event.isMultiDay || event.isFirstDay) && getEventIcon(event.type)}
                  <span className={cn(
                      "truncate flex-1",
                      event.isMultiDay && !event.isFirstDay && "invisible" // Only show title on first day for clean look
                  )}>
                    {event.title}
                  </span>

                  {isAdmin && (!event.isMultiDay || event.isLastDay) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(event.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500 hover:text-white rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
