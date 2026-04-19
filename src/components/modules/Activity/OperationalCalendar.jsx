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
  Lock
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

const OperationalCalendar = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    type: 'PRODUCTION',
    startAt: '',
    endAt: '',
    memberIds: []
  });

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
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['operational-events', format(currentDate, 'yyyy-MM')],
    queryFn: async () => {
      const start = startOfMonth(currentDate).toISOString();
      const end = endOfMonth(currentDate).toISOString();
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events?start=${start}&end=${end}`);
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (newEvent) => {
      const res = await fetch(`${getApiBaseUrl()}/api/activity/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['operational-events']);
      queryClient.invalidateQueries(['team-activity-status']);
      setIsModalOpen(false);
      toast.success('Evento creado correctamente');
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
    createMutation.mutate(formData);
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

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
          <div key={day.toString()} className="bg-white dark:bg-zinc-900 p-4 min-h-[140px] transition-colors hover:bg-zinc-50/50 dark:hover:bg-white/5">
            <span className={cn(
              "text-sm font-bold",
              isSameDay(day, new Date()) ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-600"
            )}>
              {format(day, 'd')}
            </span>
            <div className="mt-2 space-y-1">
              {events.filter(e => isSameDay(new Date(e.startAt), day)).map(event => (
                <div
                  key={event.id}
                  className={cn(
                    "group relative p-1.5 rounded-lg border text-[10px] font-medium transition-all cursor-default flex items-center gap-1.5",
                    getEventColor(event.type)
                  )}
                >
                  {getEventIcon(event.type)}
                  <span className="truncate flex-1">{event.title}</span>

                  {isAdmin && (
                    <button
                      onClick={() => deleteMutation.mutate(event.id)}
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
              <h3 className="text-xl font-bold">Nuevo Evento Operativo</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Título del Evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Jornada con TruPeak"
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Tipo</label>
                  <select
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600/20"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="PRODUCTION">Producción</option>
                    <option value="ABSENCE">Permiso/Ausencia</option>
                    <option value="PROJECT">Proyecto Especial</option>
                    <option value="MEETING">Reunión</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Inicio</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                    value={formData.startAt}
                    onChange={e => setFormData({...formData, startAt: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Fin</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                    value={formData.endAt}
                    onChange={e => setFormData({...formData, endAt: e.target.value})}
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
                disabled={createMutation.isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar Evento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationalCalendar;
