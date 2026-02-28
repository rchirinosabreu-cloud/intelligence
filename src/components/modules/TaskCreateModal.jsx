import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';

const STRICT_RESPONSIBLES = ['Claudia', 'Helen', 'Rodny', 'Jarlan', 'Francisco', 'Camila', 'Elisa', 'Melissa'];

const TaskCreateModal = ({ isOpen, onClose, onSuccess, clientsList, defaultClientId = null }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newTaskData, setNewTaskData] = useState({
        title: '',
        clientId: defaultClientId || '',
        assignee: '',
        dueDate: '',
        comments: ''
    });

    // Reset form when opened with new defaultClientId
    useEffect(() => {
        if (isOpen) {
            setNewTaskData({
                title: '',
                clientId: defaultClientId || '',
                assignee: '',
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
                const parts = newTaskData.dueDate.split(/[-/]/);
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    let year = parseInt(parts[2], 10);
                    if (year < 100) year += 2000;
                    const d = new Date(year, month, day);
                    if (!isNaN(d.getTime())) {
                        isoDate = d.toISOString();
                    }
                } else {
                    isoDate = new Date(newTaskData.dueDate).toISOString();
                }
            }

            const res = await fetch(`${baseUrl}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTaskData.title,
                    clientId: newTaskData.clientId,
                    assignee: newTaskData.assignee,
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md p-6 shadow-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Nueva Tarea</h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Título de la Tarea</label>
                        <input
                            type="text"
                            required
                            value={newTaskData.title}
                            onChange={e => setNewTaskData({...newTaskData, title: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-zinc-900 dark:text-white"
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
                                "w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-zinc-900 dark:text-white",
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
                                value={newTaskData.assignee}
                                onChange={e => setNewTaskData({...newTaskData, assignee: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-zinc-900 dark:text-white"
                            >
                                <option value="">Seleccionar...</option>
                                {STRICT_RESPONSIBLES.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fecha Límite</label>
                            <input
                                type="date"
                                value={newTaskData.dueDate}
                                onChange={e => setNewTaskData({...newTaskData, dueDate: e.target.value})}
                                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-zinc-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Comentarios (Opcional)</label>
                        <textarea
                            value={newTaskData.comments}
                            onChange={e => setNewTaskData({...newTaskData, comments: e.target.value})}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-zinc-900 dark:text-white resize-none h-20"
                            placeholder="Detalles adicionales..."
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
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
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Crear Tarea
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TaskCreateModal;
