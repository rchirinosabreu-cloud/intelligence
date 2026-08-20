import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  PlusCircle,
  Sparkles,
  Trash2,
  Video,
  X
} from '@/components/ui/icons';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';

const EVENT_TYPES = [
  { value: 'PRODUCTION', label: 'Produccion' },
  { value: 'PROJECT', label: 'Proyecto' },
  { value: 'MEETING', label: 'Reunion' },
  { value: 'ABSENCE', label: 'Ausencia' },
  { value: 'BREAK', label: 'Descanso' }
];

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('authToken')}`
});

const getRoundedBogotaNow = (baseDate = new Date()) => {
  const bogotaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const start = new Date(baseDate);
  const minutes = bogotaNow.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;
  start.setHours(bogotaNow.getHours(), roundedMinutes === 60 ? 0 : roundedMinutes, 0, 0);
  if (roundedMinutes === 60) start.setHours(start.getHours() + 1);
  return start;
};

const getEventTypeStyles = (type) => {
  switch (type) {
    case 'PRODUCTION':
      return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-200 dark:border-fuchsia-500/20';
    case 'PROJECT':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-500/20';
    case 'MEETING':
      return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:border-violet-500/20';
    case 'ABSENCE':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/20';
    case 'BREAK':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-white/5 dark:text-zinc-200 dark:border-white/10';
  }
};

const getTypeLabel = (type) => EVENT_TYPES.find(item => item.value === type)?.label || type;

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const hoverCloseTimerRef = useRef(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'PRODUCTION',
    startAt: getRoundedBogotaNow(new Date()),
    endAt: addDays(getRoundedBogotaNow(new Date()), 0),
    memberIds: [],
    recurrence: 'NONE',
    recurrenceEnd: null,
    meetingLink: '',
    description: '',
    attendeeEmails: [],
    googleConnectionId: ''
  });

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PROJECT_MANAGER';

  const monthRange = useMemo(() => ({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
  }), [currentDate]);

  const monthCalendarDays = useMemo(() => {
    const days = [];
    let cursor = monthRange.start;
    while (cursor <= monthRange.end) {
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
        days.push(cursor);
      }
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [monthRange]);

  const { data: team = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/team`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch team');
      return res.json();
    }
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['operational-events', monthRange.start.toISOString(), monthRange.end.toISOString()],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${monthRange.start.toISOString()}&end=${monthRange.end.toISOString()}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Failed to fetch events');
      }
      return res.json();
    },
    refetchInterval: 15_000
  });

  const { data: googleCalendarStatus } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/status`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch Google Calendar status');
      return res.json();
    }
  });

  const googleConnections = googleCalendarStatus?.connections || [];

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      const key = format(new Date(event.startAt), 'yyyy-MM-dd');
      grouped.set(key, [...(grouped.get(key) || []), event]);
    }
    for (const [key, dayEvents] of grouped.entries()) {
      grouped.set(key, dayEvents.sort((a, b) => new Date(a.startAt) - new Date(b.startAt)));
    }
    return grouped;
  }, [events]);

  const connectGoogleCalendar = async (email = '') => {
    try {
      const query = email ? `?email=${encodeURIComponent(email)}` : '';
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/auth-url${query}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo iniciar la conexion');
      }
      const data = await res.json();
      if (email) sessionStorage.setItem('googleCalendarRequestedEmail', email);
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
          start: monthRange.start.toISOString(),
          end: monthRange.end.toISOString()
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
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'Failed to delete event');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      setIsModalOpen(false);
      setEditingEventId(null);
      setDeleteCandidate(null);
      toast.success('Evento eliminado');
    },
    onError: (error) => {
      console.error('Deletion error:', error);
      toast.error(error.message || 'No se pudo eliminar el evento');
    }
  });

  const openCreateModal = (date = currentDate, type = 'PRODUCTION') => {
    const start = getRoundedBogotaNow(date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setFormData({
      title: '',
      type,
      startAt: start,
      endAt: end,
      memberIds: [],
      recurrence: 'NONE',
      recurrenceEnd: null,
      meetingLink: '',
      description: '',
      attendeeEmails: [],
      googleConnectionId: googleConnections[0]?.id || ''
    });
    setEditingEventId(null);
    setIsModalOpen(true);
  };

  const handleEmptyDayClick = (day) => {
    if (!isAdmin) return;
    openCreateModal(day);
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
      description: event.description || '',
      attendeeEmails: event.attendeeEmails || [],
      googleConnectionId: event.googleConnectionId || googleConnections[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    eventMutation.mutate(formData);
  };

  const generateMeetLink = async () => {
    if (!formData.title || !formData.startAt || !formData.endAt) {
      toast.error('Completa titulo y fechas para generar link');
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

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo generar el link');
      }
      const data = await res.json();
      setFormData({ ...formData, meetingLink: data.meetingLink });
      toast.success('Google Meet generado');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo generar el link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const selectedMembers = team.filter(member => formData.memberIds.includes(member.id));

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEventId(null);
    setDeleteCandidate(null);
  };

  const handleModalBackdropClick = (event) => {
    if (event.target === event.currentTarget) closeModal();
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (deleteCandidate) {
          setDeleteCandidate(null);
          return;
        }
        if (isModalOpen) closeModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteCandidate, isModalOpen]);

  const handleEventMouseEnter = (event, calendarEvent) => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 300;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 190);
    setHoveredEvent({
      event: calendarEvent,
      position: { left, top }
    });
  };

  const handleEventMouseLeave = () => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = setTimeout(() => setHoveredEvent(null), 180);
  };

  const handlePopoverMouseEnter = () => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
  };

  const handlePopoverMouseLeave = () => {
    setHoveredEvent(null);
  };

  const handleRequestDelete = () => {
    setDeleteCandidate({ id: editingEventId, title: formData.title });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 text-center dark:border-white/10 dark:bg-white/5">
            <span className="bg-zinc-100 py-1 text-[10px] font-bold uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
              {format(currentDate, 'MMM', { locale: es })}
            </span>
            <span className="flex-1 text-lg font-black text-zinc-900 dark:text-white">
              {format(new Date(), 'd')}
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold capitalize text-zinc-950 dark:text-white">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </h2>
            <p className="text-sm text-zinc-500">
              {format(startOfMonth(currentDate), 'd MMM', { locale: es })} - {format(endOfMonth(currentDate), 'd MMM yyyy', { locale: es })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            googleCalendarStatus?.connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => googleCalendarSyncMutation.mutate()}
                  disabled={googleCalendarSyncMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  {googleCalendarSyncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarIcon className="h-4 w-4" />}
                  {googleConnections.length} cuenta{googleConnections.length === 1 ? '' : 's'} · Actualización automática
                </button>
                <button
                  type="button"
                  onClick={() => connectGoogleCalendar('coordinadorbrainstudio@gmail.com')}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                >
                  Conectar coordinador
                </button>
                <button
                  type="button"
                  onClick={() => connectGoogleCalendar('social.brainstudio@gmail.com')}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                >
                  Conectar social
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => connectGoogleCalendar('coordinadorbrainstudio@gmail.com')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 transition hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
              >
                <CalendarIcon className="h-4 w-4" />
                Conectar coordinador
              </button>
            )
          )}

          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5">
            <button type="button" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2.5 hover:bg-zinc-50 dark:hover:bg-white/10">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setCurrentDate(new Date())} className="border-x border-zinc-200 px-4 text-xs font-bold dark:border-white/10">
              Hoy
            </button>
            <button type="button" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2.5 hover:bg-zinc-50 dark:hover:bg-white/10">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => openCreateModal(currentDate)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <Plus className="h-4 w-4" />
              Evento
            </button>
          )}
        </div>
      </div>

      <div data-operational-calendar="traditional-month-grid" className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="grid grid-cols-5 border-b border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/5">
          {['Lun', 'Mar', 'Mie', 'Jue', 'Vie'].map(day => (
            <div key={day} className="px-3 py-3 text-center text-xs font-bold text-zinc-500">
              {day}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="grid grid-cols-5">
            {monthCalendarDays.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(dayKey) || [];
              const visibleEvents = dayEvents.slice(0, 4);
              const overflow = dayEvents.length - visibleEvents.length;
              return (
                <div
                  key={dayKey}
                  onDoubleClick={() => handleEmptyDayClick(day)}
                  className={cn(
                    'group min-h-[132px] border-b border-r border-zinc-100 p-2 transition hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-white/5',
                    !isSameMonth(day, currentDate) && 'bg-zinc-50/60 text-zinc-400 dark:bg-zinc-950/30',
                    isSameDay(day, new Date()) && 'bg-indigo-50/40 dark:bg-indigo-500/10'
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                      isSameDay(day, new Date()) ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 dark:bg-indigo-500' : 'text-zinc-600 dark:text-zinc-300'
                    )}>
                      {format(day, 'd')}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleEmptyDayClick(day)}
                        className="rounded-lg p-1 text-zinc-300 opacity-0 transition hover:bg-white hover:text-indigo-600 group-hover:opacity-100 md:opacity-0"
                        aria-label="Crear evento"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {visibleEvents.map(event => (
                      <button
                        key={event.id}
                        type="button"
                        onMouseEnter={(e) => handleEventMouseEnter(e, event)}
                        onMouseLeave={handleEventMouseLeave}
                        onFocus={(e) => handleEventMouseEnter(e, event)}
                        onBlur={handleEventMouseLeave}
                        onClick={() => {
                          setHoveredEvent(null);
                          handleEdit(event);
                        }}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] font-bold leading-tight shadow-sm transition hover:shadow',
                          getEventTypeStyles(event.type)
                        )}
                        title={event.title}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        <span className="min-w-0 flex-1 truncate">{event.title}</span>
                        <span className="shrink-0 font-medium opacity-80">{format(new Date(event.startAt), 'HH:mm')}</span>
                      </button>
                    ))}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => handleEmptyDayClick(day)}
                        className="px-2 text-[11px] font-medium text-zinc-500 hover:text-indigo-600"
                      >
                        {overflow} mas...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hoveredEvent && (
        <div
          data-operational-event-popover="preview"
          className="fixed z-[90] w-[300px] rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-2xl shadow-zinc-950/10 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/30"
          style={{ left: hoveredEvent.position.left, top: hoveredEvent.position.top }}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-zinc-500">{getTypeLabel(hoveredEvent.event.type)}</p>
              <h4 className="mt-1 line-clamp-2 font-bold text-zinc-950 dark:text-white">{hoveredEvent.event.title}</h4>
            </div>
            <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full border', getEventTypeStyles(hoveredEvent.event.type))} />
          </div>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              <span>
                {format(new Date(hoveredEvent.event.startAt), 'd MMM, HH:mm', { locale: es })} - {format(new Date(hoveredEvent.event.endAt), 'HH:mm')}
              </span>
            </div>
            {hoveredEvent.event.meetingLink && (
              <div className="flex items-center gap-2">
                <Video className="h-3.5 w-3.5 text-indigo-500" />
                <span>Google Meet disponible</span>
              </div>
            )}
            {hoveredEvent.event.description && (
              <p className="line-clamp-3 rounded-xl bg-zinc-50 p-3 text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                {hoveredEvent.event.description}
              </p>
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={handleModalBackdropClick}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl dark:bg-zinc-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white">{editingEventId ? 'Editar evento' : 'Nuevo evento'}</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500">Titulo del evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Reunion de trafico"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Tipo</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                  >
                    {EVENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Recurrencia</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    value={formData.recurrence}
                    onChange={e => setFormData({ ...formData, recurrence: e.target.value })}
                  >
                    <option value="NONE">Unica vez</option>
                    <option value="WEEKLY">Semanal</option>
                  </select>
                </div>
              </div>

              {formData.recurrence === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Hasta cuando</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.recurrenceEnd}
                    onChange={date => setFormData({ ...formData, recurrenceEnd: date })}
                    dateFormat="d MMMM, yyyy"
                    placeholderText="Seleccionar fecha fin"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    wrapperClassName="w-full"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Inicio</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.startAt}
                    onChange={date => {
                      if (!date) return;
                      const currentDuration = new Date(formData.endAt).getTime() - new Date(formData.startAt).getTime();
                      setFormData({ ...formData, startAt: date, endAt: new Date(date.getTime() + Math.max(currentDuration, 15 * 60 * 1000)) });
                    }}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMM, HH:mm"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    wrapperClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Fin</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.endAt}
                    onChange={date => setFormData({ ...formData, endAt: date })}
                    showTimeSelect
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat="d MMM, HH:mm"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    wrapperClassName="w-full"
                  />
                </div>
              </div>

              {googleConnections.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Cuenta de Google</label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                    value={formData.googleConnectionId}
                    onChange={event => setFormData({ ...formData, googleConnectionId: event.target.value })}
                  >
                    {googleConnections.map(connection => (
                      <option key={connection.id} value={connection.id}>{connection.email}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Invitados externos</label>
                <input
                  type="text"
                  inputMode="email"
                  placeholder="cliente@empresa.com, otra@empresa.com"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                  value={(formData.attendeeEmails || []).join(', ')}
                  onChange={event => setFormData({
                    ...formData,
                    attendeeEmails: event.target.value.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
                  })}
                />
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Google Calendar enviará la invitación y cualquier cambio de horario.</p>
              </div>

              {formData.type === 'MEETING' && (
                <div className="space-y-2 rounded-2xl border border-indigo-500/10 bg-indigo-500/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-bold text-indigo-600 dark:text-indigo-300">Google Meet</label>
                    <button
                      type="button"
                      onClick={generateMeetLink}
                      disabled={isGeneratingLink}
                      className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isGeneratingLink ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Generar
                    </button>
                  </div>
                  <div className="relative">
                    <Video className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                    <input
                      type="url"
                      placeholder="https://meet.google.com/..."
                      className="w-full rounded-xl border border-indigo-200 bg-white py-2 pl-11 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-600/20 dark:border-indigo-500/20 dark:bg-zinc-900"
                      value={formData.meetingLink}
                      onChange={e => setFormData({ ...formData, meetingLink: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500">Descripcion</label>
                <textarea
                  rows={3}
                  placeholder="Contexto adicional para el equipo..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500">Equipo involucrado</label>
                <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
                  {team.map(member => (
                    <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent p-2 transition hover:border-zinc-200 hover:bg-white dark:hover:border-white/10 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
                        checked={formData.memberIds.includes(member.id)}
                        onChange={e => {
                          const newIds = e.target.checked
                            ? [...formData.memberIds, member.id]
                            : formData.memberIds.filter(id => id !== member.id);
                          setFormData({ ...formData, memberIds: newIds });
                        }}
                      />
                      <TeamAvatar member={member} showTitle={false} className="h-5 w-5" />
                      <span className="truncate text-[11px] font-bold text-zinc-600 dark:text-zinc-300">{member.name}</span>
                    </label>
                  ))}
                </div>
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMembers.map(member => (
                      <span key={member.id} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500 dark:bg-white/10">
                        {member.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-2 md:flex-row">
                {editingEventId && (
                  <button
                    type="button"
                    onClick={handleRequestDelete}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10"
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Eliminar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={eventMutation.isPending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {eventMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  {editingEventId ? 'Actualizar evento' : 'Guardar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div
          data-operational-delete-dialog="event"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteCandidate(null);
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-zinc-950 dark:text-white">Eliminar evento</h3>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Esta accion eliminara "{deleteCandidate.title || 'este evento'}" del calendario operativo.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteCandidate.id)}
                disabled={deleteMutation.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalCalendar;
