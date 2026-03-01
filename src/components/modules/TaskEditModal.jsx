import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const TaskEditModal = ({ isOpen, onClose, onSuccess, clientsList, taskData }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [editFormData, setEditFormData] = useState({});

    // Fetch team members
    useEffect(() => {
        if (isOpen) {
            fetch(`${getApiBaseUrl()}/api/team`)
                .then(res => res.json())
                .then(data => setTeamMembers(data))
                .catch(err => console.error("Error fetching team members:", err));
        }
    }, [isOpen]);

    // Populate form data when the modal opens or taskData changes
    useEffect(() => {
        if (isOpen && taskData) {
            // Find client ID based on client name if we only have the name in the mapped task
            let cId = taskData.clientId || '';
            if (!cId && taskData.cliente) {
                 const clientMatch = clientsList.find(c => c.name === taskData.cliente);
                 if (clientMatch) cId = clientMatch.id;
            }

            // Ensure date format is YYYY-MM-DD for input type="date"
            let formattedDate = '';
            if (taskData.fecha_entrega) {
                const parts = taskData.fecha_entrega.split('-');
                if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else if (taskData.dueDate) {
                // Handle raw backend taskData
                try {
                    formattedDate = new Date(taskData.dueDate).toISOString().split('T')[0];
                } catch(e) {}
            }

            setEditFormData({
                id: taskData.id,
                pendiente: taskData.pendiente || taskData.title || '',
                clientId: cId,
                responsable_name: taskData.assigneeId || taskData.responsable_name || taskData.assignee || '',
                estado: taskData.estado || taskData.status || 'Pendiente',
                fecha_entrega: formattedDate,
                comentarios: taskData.comentarios || taskData.comments || ''
            });
        }
    }, [isOpen, taskData, clientsList]);

    const handleEditTask = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const baseUrl = getApiBaseUrl();
            let isoDate = null;
            if (editFormData.fecha_entrega) {
                // To avoid timezone offset issues (UTC midnight shifting to previous day in UTC-5),
                // we explicitly set the time to 12:00:00 UTC. This guarantees that when the browser
                // parses the date back in any timezone from UTC-12 to UTC+12, it lands on the same day.
                let cleanDate = editFormData.fecha_entrega;
                const parts = cleanDate.split('-');
                if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
                   // Convert DD-MM-YYYY to YYYY-MM-DD
                   cleanDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else {
                   // Ensure it's just the date part (if passed as full ISO)
                   cleanDate = cleanDate.split('T')[0];
                }
                isoDate = `${cleanDate}T12:00:00.000Z`;
            }

            const res = await fetch(`${baseUrl}/api/tasks/${editFormData.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editFormData.pendiente,
                    clientId: editFormData.clientId,
                    assigneeId: editFormData.responsable_name || null,
                    dueDate: isoDate,
                    comments: editFormData.comentarios,
                    status: editFormData.estado
                })
            });

            if (res.ok) {
                toast({ title: 'Tarea actualizada', description: 'Los cambios se guardaron correctamente.' });
                onSuccess();
                onClose();
            } else { throw new Error('Error updating task'); }
        } catch (err) {
            console.error(err);
            toast({ title: 'Error', description: 'No se pudo actualizar la tarea.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg p-0 shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden gap-0">
                <DialogHeader className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                    <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-white m-0">
                        Editar Tarea
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Formulario para editar detalles de la tarea existente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleEditTask} className="p-6 space-y-4 pt-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título de la tarea</label>
                        <input
                            type="text"
                            required
                            value={editFormData.pendiente || ''}
                            onChange={e => setEditFormData({...editFormData, pendiente: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Cliente</label>
                            <select
                                required
                                value={editFormData.clientId || ''}
                                onChange={e => setEditFormData({...editFormData, clientId: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            >
                                <option value="">Selecciona un cliente...</option>
                                {clientsList.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Responsable</label>
                            <select
                                value={editFormData.responsable_name || ''}
                                onChange={e => setEditFormData({...editFormData, responsable_name: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            >
                                <option value="">Sin Asignar</option>
                                {teamMembers.map(member => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Estado</label>
                            <select
                                value={editFormData.estado || 'Pendiente'}
                                onChange={e => setEditFormData({...editFormData, estado: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            >
                                <option value="Pendiente">Pendiente</option>
                                <option value="En proceso">En proceso</option>
                                <option value="Realizado">Realizado</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fecha Límite</label>
                            <input
                                type="date"
                                value={editFormData.fecha_entrega || ''}
                                onChange={e => setEditFormData({...editFormData, fecha_entrega: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comentarios</label>
                        <textarea
                            value={editFormData.comentarios || ''}
                            onChange={e => setEditFormData({...editFormData, comentarios: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white resize-none h-24"
                            placeholder="Detalles adicionales..."
                        />
                    </div>

                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
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
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default TaskEditModal;
