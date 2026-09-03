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
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  addExternalEmailTags,
  explainGoogleSyncError,
  getCalendarPopoverPosition,
  getDayEventDisplay,
  getGoogleConnectionHealth,
  normalizeCalendarDescription,
  summarizeGoogleSyncResults
} from './calendarPresentation';

const EVENT_TYPES = [
  { value: 'PRODUCTION', label: 'Producción' },
  { value: 'PROJECT', label: 'Proyecto' },
  { value: 'MEETING', label: 'Reunión' },
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
  const [selectedDayAgenda, setSelectedDayAgenda] = useState(null);
  const [reconciliationPreview, setReconciliationPreview] = useState(null);
  const [googleErrorConnection, setGoogleErrorConnection] = useState(null);
  const [googleRetryError, setGoogleRetryError] = useState('');
  const [selectedReconciliationIds, setSelectedReconciliationIds] = useState([]);
  const [reconciliationConnectionId, setReconciliationConnectionId] = useState('');
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [externalEmailDraft, setExternalEmailDraft] = useState('');
  const [externalEmailError, setExternalEmailError] = useState('');
  const hoverCloseTimerRef = useRef(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'PRODUCTION',
    startAt: getRoundedBogotaNow(new Date()),
    endAt: addDays(getRoundedBogotaNow(new Date()), 0),
    isAllDay: false,
    captureWithFireflies: false,
    memberIds: [],
    recurrence: 'NONE',
    recurrenceEnd: null,
    meetingLink: '',
    googleMeetSpaceName: '',
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
  const isGoogleAccountConnected = email => googleConnections.some(connection => connection.email.toLowerCase() === email.toLowerCase());

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      const eventStart = new Date(event.startAt);
      const exclusiveEnd = new Date(event.endAt);
      const finalDay = event.isAllDay ? addDays(exclusiveEnd, -1) : exclusiveEnd;
      let segmentLabelAssigned = false;
      let cursor = new Date(eventStart);
      cursor.setHours(0, 0, 0, 0);
      finalDay.setHours(0, 0, 0, 0);

      while (cursor <= finalDay) {
        const key = format(cursor, 'yyyy-MM-dd');
        const isDisplayedWorkday = cursor.getDay() !== 0 && cursor.getDay() !== 6;
        const segment = {
          ...event,
          segmentStartsHere: isSameDay(cursor, eventStart),
          segmentEndsHere: isSameDay(cursor, finalDay),
          segmentShowsLabel: isDisplayedWorkday && !segmentLabelAssigned
        };
        grouped.set(key, [...(grouped.get(key) || []), segment]);
        if (isDisplayedWorkday) segmentLabelAssigned = true;
        cursor = addDays(cursor, 1);
      }
    }
    for (const [key, dayEvents] of grouped.entries()) {
      grouped.set(key, dayEvents.sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || new Date(a.startAt) - new Date(b.startAt)));
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

  const openReconciliation = async () => {
    setIsLoadingReconciliation(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/reconciliation`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo consultar la reconciliación');
      }
      const preview = await res.json();
      setReconciliationPreview(preview);
      setSelectedReconciliationIds([]);
      setReconciliationConnectionId(googleConnections[0]?.id || '');
    } catch (error) {
      console.error('Google Calendar reconciliation preview error:', error);
      toast.error(error.message || 'No se pudo consultar la reconciliación');
    } finally {
      setIsLoadingReconciliation(false);
    }
  };

  const reconciliationMutation = useMutation({
    mutationFn: async (selection) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ eventIds: selection?.eventIds || selectedReconciliationIds, connectionId: selection?.connectionId || reconciliationConnectionId })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudieron reconciliar los eventos');
      }
      return res.json();
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['operational-events'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      if (result.failed) {
        const diagnostic = result.results?.find(item => item.status === 'ERROR')?.error || 'Google no aceptó la sincronización.';
        setGoogleRetryError(diagnostic);
        toast.error('El evento sigue sin sincronizar. Revisa la causa indicada.');
        return;
      }
      setReconciliationPreview(null);
      setGoogleErrorConnection(null);
      setGoogleRetryError('');
      toast.success(`${result.synced} evento(s) sincronizados${result.failed ? `, ${result.failed} con error` : ''}`);
    },
    onError: error => {
      console.error('Google Calendar reconciliation error:', error);
      toast.error(error.message || 'No se pudieron reconciliar los eventos');
    }
  });

  const dismissGoogleErrorMutation = useMutation({
    mutationFn: async eventId => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/errors/${eventId}/dismiss`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo descartar el error');
      }
      return res.json();
    },
    onSuccess: (_result, eventId) => {
      setGoogleErrorConnection(current => {
        if (!current) return null;
        const syncErrors = (current.syncErrors || []).filter(event => event.id !== eventId);
        return syncErrors.length ? { ...current, syncErrors, errorCount: Math.max(0, (current.errorCount || 0) - 1) } : null;
      });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success('Error descartado');
    },
    onError: error => {
      console.error('Google Calendar error dismissal failed:', error);
      toast.error(error.message || 'No se pudo descartar el error');
    }
  });

  const dismissReconciliationMutation = useMutation({
    mutationFn: async eventId => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/reconciliation/${eventId}/dismiss`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo descartar de conciliación');
      }
      return res.json();
    },
    onSuccess: (_result, eventId) => {
      setSelectedReconciliationIds(current => current.filter(id => id !== eventId));
      setReconciliationPreview(current => {
        if (!current) return null;
        const events = current.events.filter(event => event.id !== eventId);
        return events.length ? { ...current, events, total: Math.max(0, current.total - 1) } : null;
      });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success('Evento descartado de conciliación');
    },
    onError: error => {
      console.error('Google Calendar reconciliation dismissal failed:', error);
      toast.error(error.message || 'No se pudo descartar de conciliación');
    }
  });

  const manualSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo sincronizar Google Calendar');
      }
      return res.json();
    },
    onSuccess: results => {
      const summary = summarizeGoogleSyncResults(results);
      queryClient.invalidateQueries({ queryKey: ['operational-events'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success(`Sincronización lista: ${summary.imported} nuevos y ${summary.updated} actualizados`);
    },
    onError: error => {
      console.error('Google Calendar manual sync error:', error);
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
      queryClient.invalidateQueries({ queryKey: ['operational-events'] });
      queryClient.invalidateQueries({ queryKey: ['team-activity-status'] });
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
      queryClient.invalidateQueries({ queryKey: ['operational-events'] });
      queryClient.invalidateQueries({ queryKey: ['team-activity-status'] });
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
      isAllDay: false,
      captureWithFireflies: false,
      memberIds: [],
      recurrence: 'NONE',
      recurrenceEnd: null,
      meetingLink: '',
      googleMeetSpaceName: '',
      description: '',
      attendeeEmails: [],
      googleConnectionId: googleConnections[0]?.id || ''
    });
    setExternalEmailDraft('');
    setExternalEmailError('');
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
      isAllDay: Boolean(event.isAllDay),
      captureWithFireflies: Boolean(event.captureWithFireflies || event.attendeeEmails?.some(email => email.toLowerCase() === 'fred@fireflies.ai')),
      memberIds: event.memberIds || [],
      recurrence: event.recurrence || 'NONE',
      recurrenceEnd: event.recurrenceEnd ? new Date(event.recurrenceEnd) : null,
      meetingLink: event.meetingLink || '',
      googleMeetSpaceName: event.googleMeetSpaceName || '',
      description: normalizeCalendarDescription(event.description || ''),
      attendeeEmails: (event.attendeeEmails || []).filter(email => email.toLowerCase() !== 'fred@fireflies.ai'),
      googleConnectionId: event.googleConnectionId || googleConnections[0]?.id || ''
    });
    setExternalEmailDraft('');
    setExternalEmailError('');
    setIsModalOpen(true);
  };

  const commitExternalEmailTags = () => {
    if (!externalEmailDraft.trim()) return;
    const result = addExternalEmailTags(formData.attendeeEmails, externalEmailDraft);
    setFormData(current => ({ ...current, attendeeEmails: result.emails }));
    setExternalEmailError(result.invalid.length ? `Correo no válido: ${result.invalid.join(', ')}` : '');
    if (!result.invalid.length) setExternalEmailDraft('');
  };

  const removeExternalEmailTag = emailToRemove => {
    setFormData(current => ({
      ...current,
      attendeeEmails: current.attendeeEmails.filter(email => email !== emailToRemove)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = addExternalEmailTags(formData.attendeeEmails, externalEmailDraft);
    if (result.invalid.length) {
      setExternalEmailError(`Correo no válido: ${result.invalid.join(', ')}`);
      return;
    }
    eventMutation.mutate({ ...formData, attendeeEmails: result.emails, captureWithFireflies: formData.captureWithFireflies });
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
          description: formData.description,
          googleConnectionId: formData.googleConnectionId
        })
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'No se pudo generar el link');
      }
      const data = await res.json();
      setFormData({ ...formData, meetingLink: data.meetingLink, googleMeetSpaceName: data.googleMeetSpaceName || '' });
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
    const position = getCalendarPopoverPosition(rect, { width: window.innerWidth, height: window.innerHeight });
    setHoveredEvent({
      event: calendarEvent,
      position
    });
  };

  const handleEventMouseLeave = () => {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = setTimeout(() => setHoveredEvent(null), 180);
  };

  const handleRequestDelete = () => {
    setDeleteCandidate({ id: editingEventId, title: formData.title });
    setIsModalOpen(false);
  };

  const handleCancelDelete = () => {
    setDeleteCandidate(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 xl:flex-row xl:items-center xl:justify-between">
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

        <div className="flex flex-col gap-3 xl:items-end">
          {isAdmin && (
            googleCalendarStatus?.connected ? (
              <div className="flex flex-wrap items-center gap-2" aria-label="Estado de cuentas de Google Calendar">
                  {googleConnections.map(connection => {
                    const health = getGoogleConnectionHealth(connection);
                    return (
                      <button type="button" key={connection.id} onClick={() => { if (health.status === 'error') { setGoogleRetryError(''); setGoogleErrorConnection(connection); } }} disabled={health.status !== 'error'} title={connection.lastSyncedAt ? `Última actualización: ${format(new Date(connection.lastSyncedAt), 'd MMM, HH:mm', { locale: es })}` : 'Sin sincronización registrada'} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-200 disabled:cursor-default dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15">
                        <span className={cn('h-2 w-2 rounded-full', health.status === 'healthy' ? 'bg-emerald-500' : health.status === 'error' ? 'bg-destructive' : 'bg-amber-500')} />
                        {connection.email.split('@')[0]} · {health.label}
                      </button>
                    );
                  })}
                  {(googleCalendarStatus?.reconciliation?.pendingCount || 0) > 0 && (
                    <button type="button" onClick={openReconciliation} disabled={isLoadingReconciliation} className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20" title="Revisar eventos históricos que todavía no tienen enlace con Google Calendar">
                      {googleCalendarStatus.reconciliation.pendingCount} pendientes de reconciliar
                    </button>
                  )}
                  {!isGoogleAccountConnected('coordinadorbrainstudio@gmail.com') && (
                    <button type="button" onClick={() => connectGoogleCalendar('coordinadorbrainstudio@gmail.com')} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">Conectar coordinador</button>
                  )}
                  {!isGoogleAccountConnected('social.brainstudio@gmail.com') && (
                    <button type="button" onClick={() => connectGoogleCalendar('social.brainstudio@gmail.com')} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">Conectar social</button>
                  )}
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

          <div className="flex flex-wrap items-center gap-3">
          {isAdmin && googleCalendarStatus?.connected && (
            <button type="button" onClick={() => manualSyncMutation.mutate()} disabled={manualSyncMutation.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-violet-200 hover:text-violet-600 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              {manualSyncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarIcon className="h-4 w-4" />}
              Sincronizar
            </button>
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
      </div>

      <div data-operational-calendar="traditional-month-grid" className="hidden overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900 md:block">
        <div className="grid grid-cols-5 border-b border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-white/5">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map(day => (
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
              const { visible: visibleEvents, overflow } = getDayEventDisplay(dayEvents);
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
                          'flex min-h-6 w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] font-bold leading-tight shadow-sm transition hover:shadow',
                          getEventTypeStyles(event.type),
                          !event.segmentStartsHere && '-ml-[9px] w-[calc(100%+9px)] rounded-l-none border-l-0 pl-[17px]',
                          !event.segmentEndsHere && '-mr-[9px] w-[calc(100%+9px)] rounded-r-none border-r-0 pr-[17px]'
                        )}
                        title={event.title}
                      >
                        {event.segmentShowsLabel && (
                          <>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                            <span className="min-w-0 flex-1 truncate">{event.title}</span>
                            {!event.isAllDay && <span className="shrink-0 font-medium opacity-80">{format(new Date(event.startAt), 'HH:mm')}</span>}
                          </>
                        )}
                      </button>
                    ))}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDayAgenda(day)}
                        className="px-2 text-[11px] font-medium text-zinc-500 hover:text-indigo-600"
                      >
                        {overflow} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3 md:hidden" aria-label="Agenda mensual">
        {monthCalendarDays.filter(day => isSameMonth(day, currentDate)).map(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(dayKey) || [];
          if (!dayEvents.length) return null;
          return (
            <section key={dayKey} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold capitalize text-zinc-900 dark:text-white">{format(day, 'EEEE d', { locale: es })}</h3>
                {isAdmin && <button type="button" onClick={() => handleEmptyDayClick(day)} className="min-h-11 min-w-11 rounded-xl text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" aria-label={`Crear evento el ${format(day, 'd MMMM', { locale: es })}`}><Plus className="mx-auto h-4 w-4" /></button>}
              </div>
              <div className="space-y-2">
                {dayEvents.map(event => (
                  <button key={event.id} type="button" onClick={() => handleEdit(event)} className={cn('flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold', getEventTypeStyles(event.type))}>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                    <span className="min-w-0 flex-1 truncate">{event.title}</span>
                    <span className="shrink-0 font-medium opacity-80">{event.isAllDay ? 'Todo el día' : format(new Date(event.startAt), 'HH:mm')}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {selectedDayAgenda && (
        <Dialog open={!!selectedDayAgenda} onOpenChange={open => { if (!open) setSelectedDayAgenda(null); }}>
          <DialogContent data-operational-day-agenda="dialog" role="dialog" aria-modal="true" className="max-h-[82vh] max-w-2xl gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <DialogHeader className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-4 text-left dark:border-zinc-800 dark:bg-zinc-900/50">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">Agenda del día</p>
                <DialogTitle id="operational-day-agenda-title" className="mt-1 text-lg font-semibold capitalize text-zinc-950 dark:text-white">{format(selectedDayAgenda, 'EEEE d MMMM', { locale: es })}</DialogTitle>
                <DialogDescription className="sr-only">Eventos programados para el día seleccionado.</DialogDescription>
              </div>
            </DialogHeader>
            <div className="min-h-0 overscroll-contain overflow-y-auto p-6" data-calendar-scroll-container="agenda">
            <div className="grid gap-2 sm:grid-cols-2">
              {(eventsByDay.get(format(selectedDayAgenda, 'yyyy-MM-dd')) || []).map(event => (
                <button key={event.id} type="button" onClick={() => { setSelectedDayAgenda(null); handleEdit(event); }} className={cn('flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs font-bold', getEventTypeStyles(event.type))}>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{event.title}</span><span className="mt-1 block font-medium opacity-75">{event.isAllDay ? 'Todo el día' : `${format(new Date(event.startAt), 'HH:mm')} – ${format(new Date(event.endAt), 'HH:mm')}`}</span></span>
                </button>
              ))}
            </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {hoveredEvent && (
        <div
          data-operational-event-popover="preview"
          className="pointer-events-none fixed z-[90] w-[300px] rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-2xl shadow-zinc-950/10 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/30"
          style={{ left: hoveredEvent.position.left, top: hoveredEvent.position.top }}
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
                {hoveredEvent.event.isAllDay ? `Todo el día · ${format(new Date(hoveredEvent.event.startAt), 'd MMM', { locale: es })}` : `${format(new Date(hoveredEvent.event.startAt), 'd MMM, HH:mm', { locale: es })} - ${format(new Date(hoveredEvent.event.endAt), 'HH:mm')}`}
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
                {normalizeCalendarDescription(hoveredEvent.event.description)}
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!googleErrorConnection} onOpenChange={open => { if (!open) setGoogleErrorConnection(null); }}>
        <DialogContent data-google-calendar-errors="dialog" className="max-w-xl rounded-2xl border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <DialogHeader className="text-left">
            <DialogTitle>Errores de Google Calendar</DialogTitle>
            <DialogDescription>{googleErrorConnection?.email}. Estos eventos no lograron crearse o actualizarse en Google.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
            {googleRetryError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                <p className="font-bold">No se pudo completar la sincronización</p>
                <p className="mt-1 leading-relaxed">{explainGoogleSyncError(googleRetryError)}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary>
                  <p className="mt-2 break-words rounded-lg bg-white/70 p-2 font-mono text-[11px] dark:bg-black/20">{googleRetryError}</p>
                </details>
              </div>
            )}
            {(googleErrorConnection?.syncErrors || []).map(event => (
              <div key={event.id} className="rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="font-semibold text-zinc-950 dark:text-white">{event.title}</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{format(new Date(event.startAt), 'd MMM yyyy, HH:mm', { locale: es })}</p>
                {event.googleSyncError ? (
                  <div className="mt-2 text-xs text-red-700 dark:text-red-200">
                    <p className="leading-relaxed">{explainGoogleSyncError(event.googleSyncError)}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold">Ver detalles técnicos</summary>
                      <p className="mt-2 break-words rounded-lg bg-white/70 p-2 font-mono text-[11px] dark:bg-black/20">{event.googleSyncError}</p>
                    </details>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-destructive">Aún no hay diagnóstico guardado. Pulsa Reintentar para obtener la causa actual de Google.</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => reconciliationMutation.mutate({ eventIds: [event.id], connectionId: googleErrorConnection.id })} disabled={reconciliationMutation.isPending} className="brain-danger-button inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-60">
                    {reconciliationMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Reintentar
                  </button>
                  <button type="button" onClick={() => dismissGoogleErrorMutation.mutate(event.id)} disabled={dismissGoogleErrorMutation.isPending} className="brain-danger-button-outline inline-flex min-h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold disabled:opacity-60 dark:bg-white/5">
                    {dismissGoogleErrorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reconciliationPreview} onOpenChange={open => { if (!open) setReconciliationPreview(null); }}>
        <DialogContent showCloseButton={false} overlayClassName="z-[115]" className="z-[116] max-h-[calc(100dvh-1rem)] max-w-2xl gap-0 overflow-y-auto rounded-3xl border-zinc-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-900 sm:max-h-[85dvh] sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">Reconciliación controlada</p>
                <DialogTitle className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">Eventos pendientes de Google Calendar</DialogTitle>
                <DialogDescription className="sr-only">Selecciona los eventos vigentes que deben sincronizarse con Google Calendar.</DialogDescription>
              </div>
              <button type="button" onClick={() => setReconciliationPreview(null)} className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10" aria-label="Cerrar reconciliación"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Confirma únicamente eventos vigentes: sincronizarlos puede enviar invitaciones a sus asistentes.</p>
            <label className="mt-4 block text-xs font-bold text-zinc-500 dark:text-zinc-400">
              Cuenta organizadora
              <select value={reconciliationConnectionId} onChange={event => setReconciliationConnectionId(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
                {googleConnections.map(connection => <option key={connection.id} value={connection.id}>{connection.email}</option>)}
              </select>
            </label>
            <div className="mt-4 space-y-2">
              {(reconciliationPreview?.events || []).map(event => (
                <div key={event.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-600" checked={selectedReconciliationIds.includes(event.id)} onChange={input => setSelectedReconciliationIds(input.target.checked ? [...selectedReconciliationIds, event.id] : selectedReconciliationIds.filter(id => id !== event.id))} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-zinc-900 dark:text-white">{event.title}</span>
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{format(new Date(event.startAt), 'd MMM yyyy, HH:mm', { locale: es })}{event.attendeeEmails?.length ? ` · ${event.attendeeEmails.length} invitado(s)` : ''}</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => dismissReconciliationMutation.mutate(event.id)} disabled={dismissReconciliationMutation.isPending} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white" aria-label={`Descartar ${event.title} de conciliación`} title="Descartar de conciliación">
                    {dismissReconciliationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    <span className="hidden sm:inline">Descartar de conciliación</span>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => reconciliationMutation.mutate()} disabled={!selectedReconciliationIds.length || !reconciliationConnectionId || reconciliationMutation.isPending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-violet-700 disabled:opacity-50">
              {reconciliationMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar y sincronizar
            </button>
        </DialogContent>
      </Dialog>

      {isModalOpen && (
        <Dialog open={isModalOpen} onOpenChange={open => { if (!open) closeModal(); }}>
          <DialogContent data-operational-event-form="dialog" className="flex max-h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-h-[90dvh]">
            <DialogHeader className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-4 text-left dark:border-zinc-800 dark:bg-zinc-900/50">
              <DialogTitle className="text-lg font-semibold text-zinc-950 dark:text-white">{editingEventId ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>
              <DialogDescription className="sr-only">Formulario para crear o editar un evento del calendario.</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div data-calendar-scroll-container="event-form" className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-6 sm:pt-6 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-zinc-500">Título del evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ej.: Reunión de tráfico"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
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
                    <option value="NONE">Única vez</option>
                    <option value="WEEKLY">Semanal</option>
                  </select>
                </div>
              </div>

              {formData.recurrence === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">Hasta cuándo</label>
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

              <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 md:col-span-2">
                <span>
                  <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">Todo el día</span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">El evento se mostrará sin horas en Brain Studio y Google Calendar.</span>
                </span>
                <input
                  type="checkbox"
                  checked={formData.isAllDay}
                  onChange={event => {
                    const isAllDay = event.target.checked;
                    const startAt = new Date(formData.startAt);
                    if (isAllDay) startAt.setHours(0, 0, 0, 0);
                    else {
                      const rounded = getRoundedBogotaNow(startAt);
                      startAt.setHours(rounded.getHours(), rounded.getMinutes(), 0, 0);
                    }
                    setFormData({ ...formData, isAllDay, startAt, endAt: isAllDay ? addDays(startAt, 1) : new Date(startAt.getTime() + 60 * 60 * 1000) });
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">{formData.isAllDay ? 'Desde' : 'Inicio'}</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.startAt}
                    onChange={date => {
                      if (!date) return;
                      if (formData.isAllDay) {
                        const startAt = new Date(date);
                        startAt.setHours(0, 0, 0, 0);
                        const durationDays = Math.max(1, Math.round((new Date(formData.endAt) - new Date(formData.startAt)) / (24 * 60 * 60 * 1000)));
                        setFormData({ ...formData, startAt, endAt: addDays(startAt, durationDays) });
                        return;
                      }
                      const currentDuration = new Date(formData.endAt).getTime() - new Date(formData.startAt).getTime();
                      setFormData({ ...formData, startAt: date, endAt: new Date(date.getTime() + Math.max(currentDuration, 15 * 60 * 1000)) });
                    }}
                    showTimeSelect={!formData.isAllDay}
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat={formData.isAllDay ? 'd MMMM, yyyy' : 'd MMM, HH:mm'}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-indigo-600/20 dark:border-white/10 dark:bg-white/5"
                    wrapperClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500">{formData.isAllDay ? 'Hasta' : 'Fin'}</label>
                  <DatePicker
                    {...brainDatePickerProps}
                    selected={formData.isAllDay ? addDays(formData.endAt, -1) : formData.endAt}
                    onChange={date => {
                      if (!date) return;
                      if (formData.isAllDay) {
                        const inclusiveEnd = new Date(date);
                        inclusiveEnd.setHours(0, 0, 0, 0);
                        setFormData({ ...formData, endAt: addDays(inclusiveEnd < formData.startAt ? formData.startAt : inclusiveEnd, 1) });
                        return;
                      }
                      setFormData({ ...formData, endAt: date });
                    }}
                    showTimeSelect={!formData.isAllDay}
                    timeIntervals={15}
                    timeCaption="Hora"
                    dateFormat={formData.isAllDay ? 'd MMMM, yyyy' : 'd MMM, HH:mm'}
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

              <div className="space-y-1.5" data-operational-external-guests="tags">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Invitados externos</label>
                <div className="flex h-11 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-2 transition [scrollbar-width:none] focus-within:ring-2 focus-within:ring-primary/50 [&::-webkit-scrollbar]:hidden dark:border-zinc-800 dark:bg-zinc-950">
                  {formData.attendeeEmails.map(email => (
                    <span key={email} className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-lg bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                      <span className="truncate">{email}</span>
                      <button type="button" onClick={() => removeExternalEmailTag(email)} className="brain-danger-button-icon rounded p-0.5" aria-label={`Eliminar invitado ${email}`}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <input
                    type="email"
                    inputMode="email"
                    placeholder={formData.attendeeEmails.length ? 'Añadir otro correo' : 'cliente@empresa.com'}
                    className="min-w-[12rem] flex-1 shrink-0 border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                    value={externalEmailDraft}
                    onChange={event => { setExternalEmailDraft(event.target.value); setExternalEmailError(''); }}
                    onBlur={commitExternalEmailTags}
                    onKeyDown={event => {
                      if (['Enter', ',', ';'].includes(event.key)) {
                        event.preventDefault();
                        commitExternalEmailTags();
                      }
                      if (event.key === 'Backspace' && !externalEmailDraft && formData.attendeeEmails.length) removeExternalEmailTag(formData.attendeeEmails.at(-1));
                    }}
                    onPaste={event => {
                      const pasted = event.clipboardData.getData('text');
                      if (!/[;,\n]/.test(pasted)) return;
                      event.preventDefault();
                      const result = addExternalEmailTags(formData.attendeeEmails, pasted);
                      setFormData(current => ({ ...current, attendeeEmails: result.emails }));
                      setExternalEmailError(result.invalid.length ? `Correo no válido: ${result.invalid.join(', ')}` : '');
                    }}
                  />
                </div>
                {externalEmailError && <p className="text-xs font-medium text-destructive" role="alert">{externalEmailError}</p>}
              </div>

              {formData.type === 'MEETING' && (
                <div className="space-y-4 rounded-xl border border-violet-500/10 bg-violet-500/5 p-4 md:col-span-2">
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-violet-200 bg-white px-4 py-3 dark:border-violet-500/20 dark:bg-zinc-900">
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white"><Sparkles className="h-4 w-4 text-violet-500" />Invitar a Fireflies</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">Fred se añadirá como invitado y entrará automáticamente a la reunión para generar la transcripción.</span>
                    </span>
                    <input type="checkbox" checked={formData.captureWithFireflies} onChange={event => setFormData({ ...formData, captureWithFireflies: event.target.checked })} className="h-4 w-4 shrink-0 rounded border-zinc-300 text-violet-600 focus:ring-violet-600" />
                  </label>
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

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-zinc-500">Descripción</label>
                <textarea
                  rows={3}
                  placeholder="Contexto adicional para el equipo..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:ring-2 focus:ring-primary/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
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

              </div>

              <div data-calendar-form-footer="event-form" className="flex shrink-0 flex-col gap-3 border-t border-zinc-100 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900 sm:px-6 md:flex-row">
                {editingEventId && (
                  <button
                    type="button"
                    onClick={handleRequestDelete}
                    disabled={deleteMutation.isPending}
                    className="brain-danger-button-outline inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition disabled:opacity-60"
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Eliminar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={eventMutation.isPending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {eventMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  {editingEventId ? 'Actualizar evento' : 'Guardar evento'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteCandidate} onOpenChange={open => { if (!open && !deleteMutation.isPending) handleCancelDelete(); }}>
        <DialogContent
          data-operational-delete-dialog="event"
          showCloseButton={false}
          overlayClassName="z-[120]"
          className="z-[121] max-w-sm gap-0 rounded-3xl border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
          onEscapeKeyDown={event => { if (deleteMutation.isPending) event.preventDefault(); }}
          onPointerDownOutside={event => { if (deleteMutation.isPending) event.preventDefault(); }}
        >
            <div className="mb-5">
              <DialogTitle className="text-lg font-bold text-zinc-950 dark:text-white">Eliminar evento</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Esta acción eliminará “{deleteCandidate?.title || 'este evento'}” del calendario operativo.
              </DialogDescription>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteCandidate.id)}
                disabled={deleteMutation.isPending}
                className="brain-danger-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition disabled:opacity-60"
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar
              </button>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default OperationalCalendar;
