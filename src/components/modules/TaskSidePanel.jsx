import React, { useState, useEffect, useRef } from 'react';
import {
    Loader2, Zap, Star, Link as LinkIcon, ExternalLink,
    X, Send, MessageSquare, RotateCcw, CheckCircle2,
    LayoutGrid, Calendar, User, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { triggerConfetti } from '@/utils/confetti';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import SlideOver from '@/components/ui/SlideOver';
import TeamAvatar from '@/components/ui/TeamAvatar';
import UserAvatarPopover from '@/components/ui/UserAvatarPopover';

const TaskSidePanel = ({ isOpen, onClose, onSuccess, clientsList, taskData = null, defaultClientId = null }) => {
    const { toast } = useToast();
    const isEdition = !!taskData?.id;

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);
    const [formData, setFormData] = useState({
        title: '',
        clientId: defaultClientId || '',
        assigneeId: '',
        dueDate: '',
        comments: '',
        status: 'PENDIENTE',
        isPriority: false,
        isSpecial: false,
        specialType: '',
        hasReference: false,
        referenceUrl: ''
    });

    const [newComment, setNewComment] = useState("");
    const [isSendingComment, setIsSendingComment] = useState(false);
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'history'

    const scrollRef = useRef(null);

    // Fetch team members
    useEffect(() => {
        if (isOpen) {
            fetch(`${getApiBaseUrl()}/api/team`)
                .then(res => res.json())
                .then(data => setTeamMembers(Array.isArray(data) ? data : []))
                .catch(err => console.error("Error fetching team members:", err));
        }
    }, [isOpen]);

    // Populate or Reset Form
    useEffect(() => {
        if (isOpen) {
            if (isEdition && taskData) {
                let cId = taskData.clientId || '';
                if (!cId && taskData.clientName) {
                    const clientMatch = clientsList.find(c => c.name === taskData.clientName);
                    if (clientMatch) cId = clientMatch.id;
                }

                let formattedDate = '';
                if (taskData.dueDateFormatted) {
                    const parts = taskData.dueDateFormatted.split('-');
                    if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (taskData.dueDate) {
                    try {
                        formattedDate = new Date(taskData.dueDate).toISOString().split('T')[0];
                    } catch(e) {}
                }

                setFormData({
                    id: taskData.id,
                    title: taskData.title || '',
                    clientId: cId,
                    assigneeId: taskData.assigneeId || '',
                    status: taskData.status || 'PENDIENTE',
                    originalStatus: taskData.status,
                    dueDate: formattedDate,
                    comments: taskData.comments || '',
                    creatorName: taskData.creatorName || 'Sistema',
                    isPriority: taskData.isPriority || false,
                    isSpecial: taskData.isSpecial || false,
                    specialType: taskData.specialType || '',
                    hasReference: !!taskData.referenceUrl,
                    referenceUrl: taskData.referenceUrl || '',
                    taskComments: taskData.taskComments || [],
                    plan: taskData.plan,
                    contentItemId: taskData.contentItemId
                });
            } else {
                setFormData({
                    title: '',
                    clientId: defaultClientId || '',
                    assigneeId: '',
                    dueDate: '',
                    comments: '',
                    status: 'PENDIENTE',
                    isPriority: false,
                    isSpecial: false,
                    specialType: '',
                    hasReference: false,
                    referenceUrl: ''
                });
            }
            setActiveTab('details');
        }
    }, [isOpen, taskData, isEdition, defaultClientId, clientsList]);

    const validateUrl = (url) => {
        if (!url) return true;
        return url.startsWith('http://') || url.startsWith('https://');
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();

        if (!formData.title || !formData.clientId) {
            toast({ variant: "destructive", title: "Faltan campos", description: "El título y el cliente son obligatorios." });
            return;
        }

        if (formData.isSpecial && !formData.specialType.trim()) {
            toast({ variant: "destructive", title: "Campo obligatorio", description: "Por favor especifica el tipo de pendiente especial." });
            return;
        }

        if (formData.hasReference && !formData.referenceUrl.trim()) {
            toast({ variant: "destructive", title: "Campo obligatorio", description: "Por favor coloca el link de la referencia." });
            return;
        }

        setIsSubmitting(true);
        try {
            const baseUrl = getApiBaseUrl();
            let isoDate = null;
            if (formData.dueDate) {
                let cleanDate = formData.dueDate.split('T')[0];
                isoDate = `${cleanDate}T12:00:00.000Z`;
            }

            const payload = {
                title: formData.title,
                clientId: formData.clientId,
                assigneeId: formData.assigneeId || null,
                dueDate: isoDate,
                comments: formData.comments,
                status: formData.status,
                isPriority: formData.isPriority,
                isSpecial: formData.isSpecial,
                specialType: formData.isSpecial ? formData.specialType : null,
                referenceUrl: formData.hasReference ? formData.referenceUrl : null
            };

            const token = localStorage.getItem('authToken');
            const method = isEdition ? 'PATCH' : 'POST';
            const url = isEdition ? `${baseUrl}/api/tasks/${formData.id}` : `${baseUrl}/api/tasks`;

            if (!isEdition && formData.status === 'REALIZADA') triggerConfetti();
            if (isEdition && formData.originalStatus !== 'REALIZADA' && formData.status === 'REALIZADA') triggerConfetti();

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast({ title: isEdition ? 'Tarea actualizada' : 'Tarea creada', description: 'Los cambios se guardaron correctamente.' });
                onSuccess();
                onClose();
            } else {
                throw new Error("Failed to save task");
            }
        } catch (err) {
            console.error("Save failed:", err);
            toast({ title: 'Error', description: 'No se pudo guardar la tarea.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || isSendingComment || !isEdition) return;

        setIsSendingComment(true);
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ content: newComment, type: 'human' })
            });

            if (res.ok) {
                const comment = await res.json();
                setFormData(prev => ({
                    ...prev,
                    taskComments: [comment, ...(prev.taskComments || [])]
                }));
                setNewComment("");
                // Optional: scroll to top of comments
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo enviar el comentario." });
        } finally {
            setIsSendingComment(false);
        }
    };

    const renderComment = (comment) => {
        const isSystem = comment.type === 'system_return' || comment.type === 'system_reintegrate';

        if (isSystem) {
            const isReturn = comment.type === 'system_return';
            return (
                <div key={comment.id} className={cn(
                    "p-4 rounded-2xl mb-4 border flex gap-4 items-start",
                    isReturn ? "bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30" : "bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30"
                )}>
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                        isReturn ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400"
                    )}>
                        {isReturn ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn("text-[10px] font-black uppercase tracking-widest", isReturn ? "text-red-600" : "text-emerald-600")}>
                                {isReturn ? "Evento: Devolución" : "Evento: Reintegración"}
                            </span>
                            <span className="text-[10px] text-zinc-400">•</span>
                            <span className="text-[10px] text-zinc-400">{new Date(comment.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
                            "{comment.content}"
                        </p>
                        {comment.author && (
                            <div className="mt-2 flex items-center gap-1.5 opacity-60">
                                <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Registrado por</span>
                                <span className="text-[9px] text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter">{comment.author.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div key={comment.id} className="flex gap-4 mb-6 group">
                <TeamAvatar
                    member={{ name: comment.author?.name, avatarUrl: comment.author?.avatarUrl }}
                    size={32}
                    className="shrink-0 ring-2 ring-white dark:ring-zinc-900"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{comment.author?.name || "Usuario"}</span>
                        <span className="text-[10px] text-zinc-400">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-900 p-3 rounded-2xl rounded-tl-none inline-block max-w-full">
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {comment.content}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    const headerIcon = isEdition ? <ClipboardList className="text-primary" size={20} /> : <Plus className="text-primary" size={20} />;

    return (
        <SlideOver
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title={isEdition ? "Editar Tarea" : "Nueva Tarea"}
            description={isEdition ? `ID: ${formData.id?.split('-')[0]}` : "Crea un nuevo pendiente operativo"}
            icon={headerIcon}
            className="max-w-[500px] md:max-w-[550px]"
        >
            <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-transparent">
                {/* Quick Access Toolbar (Edition Only) */}
                {isEdition && (
                    <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shrink-0 overflow-x-auto no-scrollbar">
                        {(formData.plan || formData.contentPlanId) && (
                            <button
                                onClick={() => {
                                    if (formData.plan?.id) {
                                        window.open(`/parrillas/${formData.plan.id}?item=${formData.contentItemId}`, '_blank');
                                    } else {
                                        window.open(`/parrillas/${formData.contentPlanId}?item=${formData.contentItemId}`, '_blank');
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/30 shrink-0"
                            >
                                <LayoutGrid size={12} /> Abrir Parrilla
                            </button>
                        )}
                        {formData.hasReference && formData.referenceUrl && (
                            <a
                                href={formData.referenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all border border-primary/20 shrink-0"
                            >
                                <LinkIcon size={12} /> Ver Referencia <ExternalLink size={10} />
                            </a>
                        )}
                        <div className="ml-auto flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 shrink-0">
                             <span className="text-[9px] text-zinc-500 font-black uppercase tracking-tighter">De:</span>
                             <span className="text-[9px] text-primary font-black uppercase tracking-tighter truncate max-w-[80px]">{formData.creatorName}</span>
                        </div>
                    </div>
                )}

                {/* Internal Tabs */}
                {isEdition && (
                    <div className="px-6 pt-4 shrink-0 flex gap-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={cn(
                                "pb-3 text-xs font-black uppercase tracking-widest transition-all relative",
                                activeTab === 'details' ? "text-primary" : "text-zinc-400 hover:text-zinc-600"
                            )}
                        >
                            Detalles
                            {activeTab === 'details' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={cn(
                                "pb-3 text-xs font-black uppercase tracking-widest transition-all relative flex items-center gap-2",
                                activeTab === 'history' ? "text-primary" : "text-zinc-400 hover:text-zinc-600"
                            )}
                        >
                            Comentarios & Log
                            {(formData.taskComments?.length > 0) && (
                                <span className="bg-zinc-100 dark:bg-zinc-800 text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">{formData.taskComments.length}</span>
                            )}
                            {activeTab === 'history' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                        </button>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {activeTab === 'details' ? (
                            <motion.form
                                key="details-tab"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                onSubmit={handleSave}
                                className="p-6 space-y-6"
                            >
                                {/* Title Section */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                        Título de la tarea <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        required
                                        value={formData.title}
                                        onChange={e => setFormData({...formData, title: e.target.value})}
                                        placeholder="Ej: Revisión de artes para Muebles Nuva"
                                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 ring-primary/20 outline-none transition-all resize-none h-20 shadow-sm"
                                    />
                                </div>

                                {/* Context Section */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Cliente</label>
                                        <select
                                            required
                                            value={formData.clientId}
                                            onChange={e => setFormData({...formData, clientId: e.target.value})}
                                            disabled={!!defaultClientId}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 ring-primary/20 outline-none shadow-sm disabled:opacity-60"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Responsable</label>
                                        <select
                                            value={formData.assigneeId}
                                            onChange={e => setFormData({...formData, assigneeId: e.target.value})}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 ring-primary/20 outline-none shadow-sm"
                                        >
                                            <option value="">Sin asignar</option>
                                            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Status & Date */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Estado Actual</label>
                                        <select
                                            value={formData.status}
                                            onChange={e => setFormData({...formData, status: e.target.value})}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-widest focus:ring-2 ring-primary/20 outline-none shadow-sm"
                                        >
                                            <option value="PENDIENTE">PENDIENTE</option>
                                            <option value="EN_CURSO">EN PROCESO</option>
                                            <option value="REALIZADA">REALIZADO</option>
                                            <option value="DEVUELTA">DEVUELTO</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Deadline</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none z-10" />
                                            <DatePicker
                                                selected={formData.dueDate ? new Date(`${formData.dueDate.split('T')[0]}T12:00:00.000Z`) : null}
                                                onChange={(date) => {
                                                    const dateStr = date ? date.toISOString().split('T')[0] : '';
                                                    setFormData({...formData, dueDate: dateStr});
                                                }}
                                                dateFormat="dd/MM/yyyy"
                                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:ring-2 ring-primary/20 outline-none shadow-sm"
                                                placeholderText="Elegir fecha..."
                                                isClearable
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Priority & Special Flags */}
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, isPriority: !prev.isPriority }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all shadow-sm",
                                            formData.isPriority ? "bg-orange-500 text-white border-orange-600 font-bold" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                                        )}
                                    >
                                        <Zap size={16} fill={formData.isPriority ? "currentColor" : "none"} />
                                        <span className="text-xs uppercase tracking-widest font-black">Prioritaria</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, isSpecial: !prev.isSpecial }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all shadow-sm",
                                            formData.isSpecial ? "bg-purple-600 text-white border-purple-700 font-bold" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                                        )}
                                    >
                                        <Star size={16} fill={formData.isSpecial ? "currentColor" : "none"} />
                                        <span className="text-xs uppercase tracking-widest font-black">Especial</span>
                                    </button>
                                </div>

                                {formData.isSpecial && (
                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400">Tipo de Pendiente Especial</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.specialType}
                                            onChange={e => setFormData({...formData, specialType: e.target.value})}
                                            placeholder="Ej: Manual de Marca, Estrategia 2026..."
                                            className="w-full bg-purple-500/5 border border-purple-200 dark:border-purple-800/50 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-purple-500/20 outline-none shadow-sm"
                                        />
                                    </motion.div>
                                )}

                                {/* Reference Link */}
                                <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                            <LinkIcon size={14} /> Link de Referencia / Insumos
                                        </label>
                                        <input
                                            type="checkbox"
                                            checked={formData.hasReference}
                                            onChange={e => setFormData({...formData, hasReference: e.target.checked})}
                                            className="w-4 h-4 rounded border-zinc-300 text-primary focus:ring-primary cursor-pointer"
                                        />
                                    </div>
                                    {formData.hasReference && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <input
                                                type="text"
                                                required
                                                value={formData.referenceUrl}
                                                onChange={e => setFormData({...formData, referenceUrl: e.target.value})}
                                                placeholder="https://..."
                                                className={cn(
                                                    "w-full bg-white dark:bg-zinc-900 border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 outline-none shadow-sm transition-all",
                                                    formData.referenceUrl && !validateUrl(formData.referenceUrl) ? "border-red-500 ring-red-500/20" : "border-zinc-200 dark:border-zinc-800 ring-primary/20"
                                                )}
                                            />
                                        </motion.div>
                                    )}
                                </div>

                                {/* General Context / Static Comments */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Descripción / Contexto General</label>
                                    <textarea
                                        value={formData.comments}
                                        onChange={e => setFormData({...formData, comments: e.target.value})}
                                        placeholder="Detalles base para el responsable..."
                                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-medium focus:ring-2 ring-primary/20 outline-none transition-all resize-none h-32 shadow-sm"
                                    />
                                </div>

                                <div className="h-20" /> {/* Spacer */}
                            </motion.form>
                        ) : (
                            <motion.div
                                key="history-tab"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="p-6"
                            >
                                <div className="space-y-4">
                                    {(!formData.taskComments || formData.taskComments.length === 0) ? (
                                        <div className="py-20 flex flex-col items-center justify-center text-center px-10">
                                            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4 text-zinc-400">
                                                <MessageSquare size={30} />
                                            </div>
                                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-1">Sin actividad todavía</h4>
                                            <p className="text-xs text-zinc-500">Envía un comentario para iniciar la conversación sobre esta tarea.</p>
                                        </div>
                                    ) : (
                                        formData.taskComments.map(renderComment)
                                    )}
                                </div>
                                <div className="h-32" /> {/* Spacer for chat input */}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom Actions Area */}
                <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
                    {activeTab === 'details' ? (
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-all rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSubmitting}
                                className="flex-[2] bg-primary text-primary-foreground px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                {isEdition ? "Guardar Cambios" : "Crear Tarea"}
                            </button>
                        </div>
                    ) : (
                        <div className="relative group">
                            <textarea
                                value={newComment}
                                onChange={e => setNewComment(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddComment();
                                    }
                                }}
                                placeholder="Escribe un comentario..."
                                className="w-full bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-primary/30 rounded-2xl px-5 py-3.5 pr-14 text-sm font-medium outline-none transition-all resize-none h-14 no-scrollbar shadow-inner"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={!newComment.trim() || isSendingComment}
                                className={cn(
                                    "absolute right-2 top-2 p-2.5 rounded-xl transition-all",
                                    newComment.trim() ? "bg-primary text-white shadow-lg shadow-primary/20 active:scale-90" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                                )}
                            >
                                {isSendingComment ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </SlideOver>
    );
};

export default TaskSidePanel;
