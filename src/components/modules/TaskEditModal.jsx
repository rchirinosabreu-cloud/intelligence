import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { triggerConfetti } from '@/utils/confetti';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
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
                .then(data => setTeamMembers(Array.isArray(data) ? data : []))
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

            const initialStatus = taskData.status || taskData.estado || 'PENDIENTE';
            setEditFormData({
                id: taskData.id,
                title: taskData.title || taskData.pendiente || '',
                clientId: cId,
                responsable_name: taskData.assigneeId || taskData.responsable_name || taskData.assignee || '',
                status: initialStatus,
                originalStatus: initialStatus, // Store original to detect auto-resolve and anti-spam confetti
                fecha_entrega: formattedDate,
                comments: taskData.comments || taskData.comentarios || '',
                creatorName: taskData.creatorName || (taskData.creator ? taskData.creator.name : 'Sistema')
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

            // Auto-resolve logic: If it was visually 'Devuelto' (by status or by tag),
            // and the user is using the "Reintegrar" action, we resolve it.
            const currentComments = editFormData.comments || '';
            const isVisuallyReturned = editFormData.originalStatus === 'DEVUELTA' ||
                                      (editFormData.originalStatus === 'PENDIENTE' && currentComments.includes('[DEVOLUCIÓN'));

            let finalStatus = editFormData.status;
            let finalComments = currentComments;

            if (isVisuallyReturned && finalStatus === editFormData.originalStatus) {
                console.log("[TaskEditModal] Auto-resolve triggered for visually returned task.");
                // Force PENDIENTE and strip the return tag to "blind" the hierarchy
                finalStatus = 'PENDIENTE';

                // Strip the most recent [DEVOLUCIÓN] block if it exists at the start
                // Refined regex: handles optional leading space/newline and different delimiters
                if (finalComments.includes('[DEVOLUCIÓN')) {
                    finalComments = finalComments.replace(/^\s*\[DEVOLUCIÓN[^\]]*\]:[^\n]*(\n\n)?/i, '').trim();
                    console.log("[TaskEditModal] Stripped return tag from comments.");
                }
            }

            // Trigger confetti if status is changing to 'REALIZADA' (Optimistic)
            if (editFormData.originalStatus !== 'REALIZADA' && finalStatus === 'REALIZADA') {
                triggerConfetti();
            }

            const url = `${baseUrl}/api/tasks/${editFormData.id}`;

            // HARDCODED STATUS CHECK: If auto-resolve was triggered, we force 'PENDIENTE' literally.
            const statusToSubmit = (isVisuallyReturned && finalStatus === 'PENDIENTE') ? 'PENDIENTE' : finalStatus;

            const payload = {
                title: editFormData.title,
                clientId: editFormData.clientId,
                assigneeId: editFormData.responsable_name || null,
                dueDate: isoDate,
                comments: finalComments,
                status: statusToSubmit
            };

            console.log(`[TaskEditModal] Sending update to ${url}`, payload);

            const token = localStorage.getItem('authToken');
            const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const updatedTask = await res.json();
                console.log(`[TaskEditModal] Update successful. ESTADO RETORNADO POR SERVIDOR:`, updatedTask.status);
                toast({ title: 'Tarea actualizada', description: 'Los cambios se guardaron correctamente.' });
                onSuccess();
                onClose();
            } else {
                const errorBody = await res.text();
                console.error(`[TaskEditModal] Update failed (${res.status}):`, errorBody);
                throw new Error(`Error updating task: ${res.status}`);
            }
        } catch (err) {
            console.error("[TaskEditModal] Catch block error:", err);
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
                        Editar tarea
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Formulario para editar detalles de la tarea existente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleEditTask} className="p-6 space-y-4 pt-4">
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título de la tarea</label>
                        </div>
                        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700">
                             <span className="text-[10px] text-zinc-500 font-medium">Creado por:</span>
                             <span className="text-[10px] text-primary font-bold">{editFormData.creatorName}</span>
                        </div>
                    </div>
                    <div>
                        <input
                            type="text"
                            required
                            value={editFormData.title || ''}
                            onChange={e => setEditFormData({...editFormData, title: e.target.value})}
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
                                <option value="">Sin asignar</option>
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
                                value={editFormData.status || 'PENDIENTE'}
                                onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                            >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="EN_CURSO">En proceso</option>
                                <option value="REALIZADA">Realizado</option>
                                <option value="DEVUELTA">Devuelto</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fecha límite</label>
                            <DatePicker
                                selected={editFormData.fecha_entrega ? new Date(`${editFormData.fecha_entrega.split('T')[0]}T12:00:00.000Z`) : null}
                                onChange={(date) => {
                                    if (date) {
                                        const dateStr = date.toISOString().split('T')[0];
                                        setEditFormData({...editFormData, fecha_entrega: dateStr});
                                    } else {
                                        setEditFormData({...editFormData, fecha_entrega: ''});
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
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comentarios</label>
                        <textarea
                            value={editFormData.comments || ''}
                            onChange={e => setEditFormData({...editFormData, comments: e.target.value})}
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
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm",
                                (editFormData.originalStatus === 'DEVUELTA' || (editFormData.originalStatus === 'PENDIENTE' && (editFormData.comments || '').includes('[DEVOLUCIÓN')))
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 border-none"
                                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                            )}
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {(editFormData.originalStatus === 'DEVUELTA' || (editFormData.originalStatus === 'PENDIENTE' && (editFormData.comments || '').includes('[DEVOLUCIÓN')))
                                ? 'Guardar y reintegrar tarea'
                                : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default TaskEditModal;
