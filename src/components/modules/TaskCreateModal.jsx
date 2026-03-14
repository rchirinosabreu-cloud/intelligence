import React, { useState, useEffect } from 'react';
import { Loader2, Zap, Star, Link as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
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
        comments: '',
        isPriority: false,
        isSpecial: false,
        specialType: '',
        hasReference: false,
        referenceUrl: ''
    });

    // Fetch team members
    useEffect(() => {
        if (isOpen) {
            fetch(`${getApiBaseUrl()}/api/team`)
                .then(res => res.json())
                .then(data => setTeamMembers(Array.isArray(data) ? data : []))
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
                comments: '',
                isPriority: false,
                isSpecial: false,
                specialType: '',
                hasReference: false,
                referenceUrl: ''
            });
        }
    }, [isOpen, defaultClientId]);

    const validateUrl = (url) => {
        if (!url) return true;
        return url.startsWith('http://') || url.startsWith('https://');
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!newTaskData.title || !newTaskData.clientId) return;

        // Validation logic
        if (newTaskData.isSpecial && !newTaskData.specialType.trim()) {
            toast({ variant: "destructive", title: "Campo obligatorio", description: "Por favor especifica el tipo de pendiente especial." });
            return;
        }

        if (newTaskData.hasReference && !newTaskData.referenceUrl.trim()) {
            toast({ variant: "destructive", title: "Campo obligatorio", description: "Por favor coloca el link de la referencia." });
            return;
        }

        if (newTaskData.hasReference && !validateUrl(newTaskData.referenceUrl)) {
            toast({ variant: "destructive", title: "URL inválida", description: "La referencia debe ser una URL válida (http:// o https://)." });
            return;
        }

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
                    status: 'PENDIENTE',
                    isPriority: newTaskData.isPriority,
                    isSpecial: newTaskData.isSpecial,
                    specialType: newTaskData.isSpecial ? newTaskData.specialType : null,
                    referenceUrl: newTaskData.hasReference ? newTaskData.referenceUrl : null
                })
            });

            if (!res.ok) throw new Error("Failed to create task");

            toast({ title: "Tarea creada", description: "La tarea se ha guardado en la base de datos." });
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
                    <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">Nueva tarea</DialogTitle>
                    <DialogDescription className="sr-only">
                        Formulario para crear una nueva tarea en el sistema.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título de la tarea</label>
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
                                <option value="">Sin asignar</option>
                                {teamMembers.map(member => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fecha límite</label>
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
                    <div className="grid grid-cols-2 gap-4 py-2 border-y border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Zap className={cn("w-4 h-4", newTaskData.isPriority ? "text-orange-500 fill-orange-500" : "text-zinc-400")} />
                                <span className="text-xs font-bold dark:text-zinc-300">Prioritario</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={newTaskData.isPriority}
                                onChange={e => setNewTaskData({...newTaskData, isPriority: e.target.checked})}
                                className="w-4 h-4 rounded border-zinc-300 text-primary focus:ring-primary"
                            />
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Star className={cn("w-4 h-4", newTaskData.isSpecial ? "text-purple-500 fill-purple-500" : "text-zinc-400")} />
                                <span className="text-xs font-bold dark:text-zinc-300">Especial</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={newTaskData.isSpecial}
                                onChange={e => setNewTaskData({...newTaskData, isSpecial: e.target.checked})}
                                className="w-4 h-4 rounded border-zinc-300 text-primary focus:ring-primary"
                            />
                        </div>
                    </div>

                    {newTaskData.isSpecial && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="space-y-1"
                        >
                            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Tipo de pendiente especial *</label>
                            <input
                                type="text"
                                required
                                value={newTaskData.specialType}
                                onChange={e => setNewTaskData({...newTaskData, specialType: e.target.value})}
                                className="w-full bg-purple-50/30 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-zinc-900 dark:text-white"
                                placeholder="Ej: Manual de Marca, PPT de Ventas..."
                            />
                        </motion.div>
                    )}

                    <div className="space-y-2 py-2 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <LinkIcon className={cn("w-4 h-4", newTaskData.hasReference ? "text-primary" : "text-zinc-400")} />
                                <span className="text-xs font-bold dark:text-zinc-300">¿Tiene referencia?</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={newTaskData.hasReference}
                                onChange={e => setNewTaskData({...newTaskData, hasReference: e.target.checked})}
                                className="w-4 h-4 rounded border-zinc-300 text-primary focus:ring-primary"
                            />
                        </div>

                        {newTaskData.hasReference && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                            >
                                <input
                                    type="text"
                                    required
                                    value={newTaskData.referenceUrl}
                                    onChange={e => setNewTaskData({...newTaskData, referenceUrl: e.target.value})}
                                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-zinc-900 dark:text-white"
                                    placeholder="Coloca el link aquí (https://...)"
                                />
                            </motion.div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comentarios (opcional)</label>
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
                            Crear tarea
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default TaskCreateModal;
