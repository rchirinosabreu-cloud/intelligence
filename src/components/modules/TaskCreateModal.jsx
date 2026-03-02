import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const TaskCreateModal = ({ isOpen, onClose, onSuccess, clientsList, defaultClientId = null }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [newTaskData, setNewTaskData] = useState({
        title: '',
        clientId: defaultClientId || '',
        assigneeId: '',
        dueDate: '',
        comments: ''
    });

    // Fetch team members
    useEffect(() => {
        if (isOpen) {
            fetch(`${getApiBaseUrl()}/api/team`)
                .then(res => res.json())
                .then(data => setTeamMembers(data))
                .catch(err => console.error("Error fetching team members:", err));
        }
    }, [isOpen]);

    // Reset form when opened with new defaultClientId
    useEffect(() => {
        if (isOpen) {
            setNewTaskData({
                title: '',
                clientId: defaultClientId || '',
                assigneeId: '',
                dueDate: '',
                comments: ''
            });
        }
    }, [isOpen, defaultClientId]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!newTaskData.title || !newTaskData.clientId) return;

        setIsSubmitting(true);
        try {
            const baseUrl = getApiBaseUrl();
            let isoDate = null;
            if (newTaskData.dueDate) {
                // Ensure date string uses YYYY-MM-DD format if coming from input type="date"
                // To avoid timezone offset issues (UTC midnight shifting to previous day in UTC-5),
                // we explicitly set the time to 12:00:00 UTC. This guarantees that when the browser
                // parses the date back in any timezone from UTC-12 to UTC+12, it lands on the same day.
                const cleanDate = newTaskData.dueDate.split('T')[0]; // Extract just the date part if needed
                isoDate = `${cleanDate}T12:00:00.000Z`;
            }

            const res = await fetch(`${baseUrl}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTaskData.title,
                    clientId: newTaskData.clientId,
                    assigneeId: newTaskData.assigneeId || null,
                    dueDate: isoDate,
                    comments: newTaskData.comments,
                    status: 'Pendiente'
                })
            });

            if (!res.ok) throw new Error("Failed to create task");

            toast({ title: "Tarea Creada", description: "La tarea se ha guardado en la base de datos." });
            onSuccess();
            onClose();
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">Nueva Tarea</DialogTitle>
                    <DialogDescription className="sr-only">
                        Formulario para crear una nueva tarea en el sistema.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título de la Tarea</label>
                        <input
                            type="text"
                            required
                            value={newTaskData.title}
                            onChange={e => setNewTaskData({...newTaskData, title: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            placeholder="Ej: Revisión de artes"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Cliente</label>
                        <select
                            required
                            value={newTaskData.clientId}
                            onChange={e => setNewTaskData({...newTaskData, clientId: e.target.value})}
                            disabled={!!defaultClientId}
                            className={cn(
                                "w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white",
                                !!defaultClientId && "opacity-60 cursor-not-allowed"
                            )}
                        >
                            <option value="">Selecciona un cliente...</option>
                            {clientsList.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Responsable</label>
                            <select
                                value={newTaskData.assigneeId}
                                onChange={e => setNewTaskData({...newTaskData, assigneeId: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            >
                                <option value="">Sin Asignar</option>
                                {teamMembers.map(member => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fecha Límite</label>
                            <DatePicker
                                selected={newTaskData.dueDate ? new Date(`${newTaskData.dueDate.split('T')[0]}T12:00:00.000Z`) : null}
                                onChange={(date) => {
                                    if (date) {
                                        const dateStr = date.toISOString().split('T')[0];
                                        setNewTaskData({...newTaskData, dueDate: dateStr});
                                    } else {
                                        setNewTaskData({...newTaskData, dueDate: ''});
                                    }
                                }}
                                dateFormat="dd/MM/yyyy"
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                                placeholderText="Seleccionar fecha"
                                isClearable
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comentarios (Opcional)</label>
                        <textarea
                            value={newTaskData.comments}
                            onChange={e => setNewTaskData({...newTaskData, comments: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white resize-none h-20"
                            placeholder="Detalles adicionales..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-6 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Crear Tarea
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default TaskCreateModal;
