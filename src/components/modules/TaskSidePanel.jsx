import React, { useState, useEffect, useRef } from 'react';
import {
    Loader2, Zap, Star, Link as LinkIcon, ExternalLink,
    X, Send, MessageSquare, RotateCcw, CheckCircle2,
    LayoutGrid, Calendar, User, Trash2, Plus, ClipboardList,
    FileText, Database
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
import LinkDropdown from '@/components/ui/LinkDropdown';

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
        referenceUrl: '',
        assetsLinks: []
    });

    const [newComment, setNewComment] = useState("");
    const [isSendingComment, setIsSendingComment] = useState(false);
    const [showReintegratePrompt, setShowReintegratePrompt] = useState(false);
    const [reintegrateReason, setReintegrateReason] = useState("");

    const commentInputRef = useRef(null);
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
                    creatorAvatar: taskData.assigneeAvatar,
                    isPriority: taskData.isPriority || false,
                    isSpecial: taskData.isSpecial || false,
                    specialType: taskData.specialType || '',
                    hasReference: !!taskData.referenceUrl,
                    referenceUrl: taskData.referenceUrl || '',
                    assetsLinks: taskData.contentItem?.assetsLinks || [],
                    taskComments: taskData.taskComments || [],
                    plan: taskData.plan,
                    contentItemId: taskData.contentItemId,
                    creator: taskData.creator || { name: taskData.creatorName || 'Sistema' }
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
                    referenceUrl: '',
                    assetsLinks: []
                });
            }
            setShowReintegratePrompt(false);
            setReintegrateReason("");
        }
    }, [isOpen, taskData, isEdition, defaultClientId, clientsList]);

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
                specialType: formData.isSpecial ? formData.specialType : null
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

    const handleReintegrate = async () => {
        if (!reintegrateReason.trim()) {
            toast({ variant: "destructive", title: "Motivo obligatorio", description: "Por favor explica por qué estás reintegrando la tarea." });
            return;
        }

        setIsSubmitting(true);
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            // 1. Update status
            const statusRes = await fetch(`${baseUrl}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ status: 'PENDIENTE' })
            });

            if (!statusRes.ok) throw new Error("Failed to update status");

            // 2. Add system_reintegrate comment
            await fetch(`${baseUrl}/api/tasks/${formData.id}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ content: reintegrateReason, type: 'system_reintegrate' })
            });

            toast({ title: 'Tarea reintegrada', description: 'El estado se cambió a PENDIENTE.' });
            onSuccess();
            onClose();
        } catch (err) {
            console.error("Reintegration failed:", err);
            toast({ variant: "destructive", title: "Error", description: "No se pudo reintegrar la tarea." });
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
                    "p-3 rounded-xl mb-3 border flex gap-3 items-start",
                    isReturn ? "bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30" : "bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30"
                )}>
                    <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                        isReturn ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400"
                    )}>
                        {isReturn ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn("text-[9px] font-black uppercase tracking-tight", isReturn ? "text-red-600" : "text-emerald-600")}>
                                {isReturn ? "Evento: Devolución" : "Evento: Reintegración"}
                            </span>
                            <span className="text-[9px] text-zinc-400">•</span>
                            <span className="text-[9px] text-zinc-400">{new Date(comment.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short'})}</span>
                        </div>
                        <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
                            "{comment.content}"
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div key={comment.id} className="flex gap-3 mb-4 group">
                <TeamAvatar
                    member={{ name: comment.author?.name, avatarUrl: comment.author?.avatarUrl }}
                    size={28}
                    className="shrink-0 ring-1 ring-white dark:ring-zinc-900"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100">{comment.author?.name || "Usuario"}</span>
                        <span className="text-[9px] text-zinc-400">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-900 p-2.5 rounded-xl rounded-tl-none inline-block max-w-full shadow-sm">
                        <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {comment.content}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    const headerIcon = isEdition ? <ClipboardList className="text-primary" size={18} /> : <Plus className="text-primary" size={18} />;

    return (
        <SlideOver
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title={isEdition ? "Editar Tarea" : "Nueva Tarea"}
            description={isEdition ? `ID: ${formData.id?.split('-')[0]}` : "Crea un nuevo pendiente operativo"}
            icon={headerIcon}
            className="w-[45vw] max-w-3xl"
        >
            <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-transparent">
                {/* Quick Access Toolbar (Edition Only) */}
                {isEdition && (
                    <div className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3">
                            {(formData.plan || formData.contentPlanId) && (
                                <button
                                    onClick={() => {
                                        if (formData.plan?.id) {
                                            window.open(`/parrillas/${formData.plan.id}?item=${formData.contentItemId}`, '_blank');
                                        } else {
                                            window.open(`/parrillas/${formData.contentPlanId}?item=${formData.contentItemId}`, '_blank');
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/30 shadow-sm"
                                >
                                    <LayoutGrid size={11} /> Abrir Parrilla
                                </button>
                            )}

                            {formData.status === 'DEVUELTA' && !showReintegratePrompt && (
                                <button
                                    onClick={() => setShowReintegratePrompt(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20"
                                >
                                    <RotateCcw size={11} /> Reintegrar Tarea
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-inner">
                             <UserAvatarPopover user={formData.creator}>
                                <TeamAvatar
                                    member={{ name: formData.creator?.name, avatarUrl: formData.creator?.avatarUrl }}
                                    size={18}
                                    className="ring-1 ring-white dark:ring-zinc-800"
                                />
                             </UserAvatarPopover>
                             <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">De:</span>
                             <span className="text-[9px] text-zinc-900 dark:text-zinc-100 font-black uppercase tracking-tighter truncate max-w-[100px]">{formData.creatorName}</span>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                    {showReintegratePrompt && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="m-5 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl shadow-xl"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center rounded-full text-emerald-600">
                                    <RotateCcw size={14} />
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Reintegración de Tarea</h4>
                                    <p className="text-[9px] text-emerald-600/70 font-medium">Explica brevemente el motivo para el responsable</p>
                                </div>
                            </div>
                            <textarea
                                autoFocus
                                value={reintegrateReason}
                                onChange={e => setReintegrateReason(e.target.value)}
                                placeholder="Ej: Ya se corrigieron los artes solicitados..."
                                className="w-full bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-[11px] font-medium focus:ring-2 ring-emerald-500/20 outline-none resize-none h-24 mb-3"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowReintegratePrompt(false)}
                                    className="flex-1 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleReintegrate}
                                    className="flex-[2] bg-emerald-500 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-[0.98] transition-all"
                                >
                                    Confirmar Reintegración
                                </button>
                            </div>
                        </motion.div>
                    )}

                    <form
                        onSubmit={handleSave}
                        className="p-5 space-y-6"
                    >
                                {/* Title Section */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                        Título de la tarea <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.title}
                                        onChange={e => setFormData({...formData, title: e.target.value})}
                                        placeholder="Ej: Revisión de artes..."
                                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-[13px] font-bold focus:ring-2 ring-primary/10 outline-none transition-all shadow-sm"
                                    />
                                </div>

                                {/* Context Section */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Cliente</label>
                                        <select
                                            required
                                            value={formData.clientId}
                                            onChange={e => setFormData({...formData, clientId: e.target.value})}
                                            disabled={!!defaultClientId}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-bold focus:ring-2 ring-primary/10 outline-none shadow-sm disabled:opacity-60 h-[38px]"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Responsable</label>
                                        <select
                                            value={formData.assigneeId}
                                            onChange={e => setFormData({...formData, assigneeId: e.target.value})}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-bold focus:ring-2 ring-primary/10 outline-none shadow-sm h-[38px]"
                                        >
                                            <option value="">Sin asignar</option>
                                            {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Status & Date */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Estado Actual</label>
                                        <select
                                            value={formData.status}
                                            onChange={e => setFormData({...formData, status: e.target.value})}
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-2 ring-primary/10 outline-none shadow-sm h-[38px]"
                                        >
                                            <option value="PENDIENTE">PENDIENTE</option>
                                            <option value="EN_CURSO">EN PROCESO</option>
                                            <option value="REALIZADA">REALIZADO</option>
                                            <option value="DEVUELTA">DEVUELTO</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Deadline</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none z-10" />
                                            <DatePicker
                                                selected={formData.dueDate ? new Date(`${formData.dueDate.split('T')[0]}T12:00:00.000Z`) : null}
                                                onChange={(date) => {
                                                    const dateStr = date ? date.toISOString().split('T')[0] : '';
                                                    setFormData({...formData, dueDate: dateStr});
                                                }}
                                                dateFormat="dd/MM/yyyy"
                                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-[11px] font-bold focus:ring-2 ring-primary/10 outline-none shadow-sm h-[38px]"
                                                placeholderText="Elegir fecha..."
                                                isClearable
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Priority & Special Flags */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, isPriority: !prev.isPriority }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all shadow-sm",
                                            formData.isPriority ? "bg-orange-500 text-white border-orange-600 font-bold" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400"
                                        )}
                                    >
                                        <Zap size={14} fill={formData.isPriority ? "currentColor" : "none"} />
                                        <span className="text-[9px] uppercase tracking-widest font-black">Prioritaria</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, isSpecial: !prev.isSpecial }))}
                                        className={cn(
                                            "flex items-center justify-center gap-2 p-2.5 rounded-xl border transition-all shadow-sm",
                                            formData.isSpecial ? "bg-purple-600 text-white border-purple-700 font-bold" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400"
                                        )}
                                    >
                                        <Star size={14} fill={formData.isSpecial ? "currentColor" : "none"} />
                                        <span className="text-[9px] uppercase tracking-widest font-black">Especial</span>
                                    </button>
                                </div>

                                {formData.isSpecial && (
                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Tipo de Pendiente Especial</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.specialType}
                                            onChange={e => setFormData({...formData, specialType: e.target.value})}
                                            placeholder="Ej: Manual de Marca..."
                                            className="w-full bg-purple-500/5 border border-purple-200 dark:border-purple-800/50 rounded-xl px-4 py-2 text-[11px] font-bold focus:ring-2 ring-purple-500/10 outline-none shadow-sm"
                                        />
                                    </motion.div>
                                )}

                                {/* Links Section (Read-Only Dropdowns) */}
                                {isEdition && (
                                    <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                                Insumos & Referencias
                                            </label>
                                            <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-tight opacity-60">Gestión en Parrilla</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <LinkDropdown
                                                label="Referencia"
                                                links={formData.referenceUrl}
                                                icon={FileText}
                                            />
                                            <LinkDropdown
                                                label="Insumo"
                                                links={formData.assetsLinks}
                                                icon={Database}
                                            />
                                        </div>
                                        {(!formData.referenceUrl && (!formData.assetsLinks || formData.assetsLinks.length === 0)) && (
                                            <div className="text-[10px] text-zinc-400 italic text-center py-2 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                                                No hay enlaces vinculados a esta tarea.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* General Context / Static Comments */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Descripción / Contexto General</label>
                                    <textarea
                                        value={formData.comments}
                                        onChange={e => setFormData({...formData, comments: e.target.value})}
                                        placeholder="Detalles base para el responsable..."
                                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium focus:ring-2 ring-primary/10 outline-none transition-all resize-none h-20 shadow-sm"
                                    />
                                </div>
                            </form>

                            {/* Divider & History Section */}
                            {isEdition && (
                                <div className="px-5 pb-20">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800/50" />
                                        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-full">
                                            <MessageSquare size={10} className="text-zinc-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Conversación & Eventos</span>
                                        </div>
                                        <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800/50" />
                                    </div>

                                    <div className="space-y-3">
                                        {(!formData.taskComments || formData.taskComments.length === 0) ? (
                                            <div className="py-10 flex flex-col items-center justify-center text-center px-8">
                                                <div className="w-10 h-10 bg-zinc-50 dark:bg-zinc-900/50 rounded-full flex items-center justify-center mb-2 text-zinc-200 dark:text-zinc-800">
                                                    <MessageSquare size={20} />
                                                </div>
                                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sin comentarios aún</h4>
                                            </div>
                                        ) : (
                                            formData.taskComments.map(renderComment)
                                        )}
                                    </div>
                                </div>
                            )}
                </div>

                {/* Bottom Actions Area - Split for unified view */}
                <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-[0_-4px_30px_-10px_rgba(0,0,0,0.1)]">
                    <div className="flex flex-col gap-4">
                        {/* Chat Input Field (Edition Only) */}
                        {isEdition && (
                            <div className="relative group">
                                <textarea
                                    ref={commentInputRef}
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAddComment();
                                        }
                                    }}
                                    placeholder="Escribe un mensaje al equipo..."
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-primary/30 rounded-xl px-4 py-3 pr-12 text-[11px] font-medium outline-none transition-all resize-none h-[48px] no-scrollbar shadow-inner"
                                />
                                <button
                                    onClick={handleAddComment}
                                    disabled={!newComment.trim() || isSendingComment}
                                    className={cn(
                                        "absolute right-1.5 top-1.5 p-2 rounded-lg transition-all",
                                        newComment.trim() ? "bg-primary text-white shadow-md shadow-primary/10 active:scale-90" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                                    )}
                                >
                                    {isSendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        )}

                        {/* Save/Cancel Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition-all rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent"
                            >
                                Cerrar Panel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSubmitting}
                                className="flex-[2] bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                {isEdition ? "Guardar Cambios" : "Crear Tarea"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </SlideOver>
    );
};

export default TaskSidePanel;
