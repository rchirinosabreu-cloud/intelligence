import React, { useState, useEffect, useRef } from 'react';
import {
    Loader2, Zap, Star, Link as LinkIcon, ExternalLink,
    X, Send, MessageSquare, RotateCcw, CheckCircle2, Bell,
    LayoutGrid, Calendar, User, Trash2, Plus, ClipboardList,
    FileText, Database, Paperclip, ImageIcon, Eye, Download
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
import { linkify, cleanSystemMessage } from '@/utils/chatUtils.jsx';

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
        referenceLinks: [],
        assetsLinks: []
    });

    const [newComment, setNewComment] = useState("");
    const [isSendingComment, setIsSendingComment] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isTogglingFollow, setIsTogglingFollow] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [showReintegratePrompt, setShowReintegratePrompt] = useState(false);
    const [reintegrateReason, setReintegrateReason] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);

    // States for Task Creation mode
    const [tempReferences, setTempReferences] = useState([]); // Array of { url, name }
    const [tempInputs, setTempInputs] = useState([]);         // Array of { url, name }
    const [tempComments, setTempComments] = useState([]);     // Array of { content, createdAt, id }

    const [newRefUrl, setNewRefUrl] = useState("");
    const [newRefName, setNewRefName] = useState("");
    const [newInpUrl, setNewInpUrl] = useState("");
    const [newInpName, setNewInpName] = useState("");

    // States for Task Edition mode attachments
    const [editRefUrl, setEditRefUrl] = useState("");
    const [editRefName, setEditRefName] = useState("");
    const [editInpUrl, setEditInpUrl] = useState("");
    const [editInpName, setEditInpName] = useState("");

    const commentInputRef = useRef(null);
    const scrollRef = useRef(null);
    const chatContainerRef = useRef(null);

    const handleDownloadImage = (url) => {
        if (!url) return;

        // Since we are using a Backend Proxy with Content-Disposition: attachment,
        // we can simply use window.location.assign or a simple <a> click.
        // This is safer and avoids CORS/Blob complexities in the frontend.
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', '');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({ title: "Descarga iniciada", description: "El archivo se descargará en breve." });
    };

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
        const handleEsc = (e) => {
            if (e.key === 'Escape') setPreviewImage(null);
        };
        if (previewImage) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [previewImage]);

    // Populate or Reset Form
    useEffect(() => {
        if (isOpen) {
            setPreviewImage(null); // Clear image viewer state when opening a task
            setSelectedFile(null); // Clear pending attachment
            setNewComment("");    // Clear pending comment draft
            setTempReferences([]); // Clear creation mode temporary references
            setTempInputs([]);     // Clear creation mode temporary inputs
            setTempComments([]);   // Clear creation mode temporary comments
            setNewRefUrl("");
            setNewRefName("");
            setNewInpUrl("");
            setNewInpName("");
            setEditRefUrl("");
            setEditRefName("");
            setEditInpUrl("");
            setEditInpName("");
            if (isEdition && taskData) {
                // Fetch follow status
                const fetchFollowStatus = async () => {
                    try {
                        const res = await fetch(`${getApiBaseUrl()}/api/tasks/${taskData.id}/follow-status`, {
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                        });
                        const data = await res.json();
                        setIsFollowing(data.isFollowing);
                    } catch (err) {
                        console.error("Error fetching follow status:", err);
                    }
                };
                fetchFollowStatus();
                setIsFollowing(false); // Reset while fetching
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

                const referenceLinks = (taskData.contentItem?.mediaUrl && taskData.contentItem.mediaUrl.length > 0)
                    ? taskData.contentItem.mediaUrl
                    : (taskData.referenceUrl || '');

                setFormData({
                    id: taskData.id,
                    title: taskData.title || '',
                    clientId: cId,
                    assigneeId: taskData.assigneeId || '',
                    status: taskData.status || 'PENDIENTE',
                    originalStatus: taskData.status,
                    dueDate: formattedDate,
                    comments: taskData.comments || '',
                    creatorName: taskData.creator?.name || taskData.creatorName || 'Sistema',
                    isPriority: taskData.isPriority || false,
                    isSpecial: taskData.isSpecial || false,
                    specialType: taskData.specialType || '',
                    hasReference: !!taskData.referenceUrl,
                    referenceUrl: taskData.referenceUrl || '',
                    referenceLinks: referenceLinks,
                    assetsLinks: taskData.contentItem?.assetsLinks || [],
                    taskComments: taskData.taskComments || [],
                    taskAttachments: taskData.taskAttachments || [],
                    creator: taskData.creator || { name: taskData.creatorName || 'Sistema' },
                    plan: taskData.plan,
                    contentItemId: taskData.contentItemId
                });
            } else {
                setIsFollowing(false);
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
                    referenceLinks: [],
                    assetsLinks: [],
                    taskAttachments: []
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
                specialType: formData.isSpecial ? formData.specialType : null,
                followOnCreate: !isEdition ? isFollowing : undefined,
                initial_references: !isEdition ? tempReferences : undefined,
                initial_inputs: !isEdition ? tempInputs : undefined,
                initial_comments: !isEdition ? tempComments.map(c => ({ content: c.content })) : undefined
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

    const handleToggleFollow = async () => {
        if (isTogglingFollow) return;

        if (!isEdition) {
            setIsFollowing(!isFollowing);
            return;
        }

        setIsTogglingFollow(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/tasks/${formData.id}/toggle-follow`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setIsFollowing(data.isFollowing);
                toast({
                    title: data.isFollowing ? "Siguiendo tarea" : "Ya no sigues esta tarea",
                    description: data.isFollowing ? "Recibirás una notificación cuando se complete." : "Ya no recibirás alertas de finalización."
                });
            }
        } catch (err) {
            console.error("Error toggling follow:", err);
        } finally {
            setIsTogglingFollow(false);
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

            // 1. Update status with justification in comments field for backend processing
            const statusRes = await fetch(`${baseUrl}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    status: 'PENDIENTE',
                    comments: reintegrateReason // Backend will pick this up for the system_reintegrate comment
                })
            });

            if (!statusRes.ok) throw new Error("Failed to update status");

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

    const handleCreateAttachment = async (name, url, category) => {
        if (!url || !url.trim()) return;
        let finalUrl = url.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    newAttachment: {
                        name: name.trim() || finalUrl,
                        url: finalUrl,
                        category
                    }
                })
            });

            if (res.ok) {
                const updatedTask = await res.json();
                setFormData(prev => ({
                    ...prev,
                    taskAttachments: updatedTask.taskAttachments || []
                }));
                toast({ title: "Enlace agregado" });
                onSuccess(); // Refresh Kanban board
            } else {
                throw new Error("Failed to add attachment");
            }
        } catch (err) {
            console.error("Error adding attachment:", err);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el enlace." });
        }
    };

    const handleDeleteAttachment = async (attachmentId) => {
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    deleteAttachmentId: attachmentId
                })
            });

            if (res.ok) {
                const updatedTask = await res.json();
                setFormData(prev => ({
                    ...prev,
                    taskAttachments: updatedTask.taskAttachments || []
                }));
                toast({ title: "Enlace eliminado" });
                onSuccess(); // Refresh Kanban board
            } else {
                throw new Error("Failed to delete attachment");
            }
        } catch (err) {
            console.error("Error deleting attachment:", err);
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el enlace." });
        }
    };

    const handleAddComment = async (fileToUpload = null) => {
        // Defensive check: ensure fileToUpload is a File instance, not a React event
        const validFile = (fileToUpload instanceof File) ? fileToUpload : null;
        const file = validFile || selectedFile;

        if (!newComment.trim() && !file) return;

        // If in creation mode, simulate adding comment to local state
        if (!isEdition) {
            if (!newComment.trim()) return;
            const newTempComment = {
                id: `temp-comment-${Date.now()}`,
                content: newComment,
                createdAt: new Date().toISOString(),
                author: {
                    name: "Tú",
                    avatarUrl: null
                }
            };
            setTempComments(prev => [...prev, newTempComment]);
            setNewComment("");
            return;
        }

        if (isSendingComment) return;

        setIsSendingComment(true);
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const commentFormData = new FormData();
            commentFormData.append('content', newComment || "");
            commentFormData.append('type', 'human');
            if (file) {
                commentFormData.append('file', file);
            }

            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments`, {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: commentFormData
            });

            if (res.ok) {
                const comment = await res.json();
                setFormData(prev => ({
                    ...prev,
                    taskComments: [comment, ...(prev.taskComments || [])]
                }));
                setNewComment("");
                setSelectedFile(null);
                toast({ title: "Comentario enviado" });
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo enviar el comentario." });
        } finally {
            setIsSendingComment(false);
        }
    };

    const handleImagePreview = (imgData) => {
        // imgData is { direct, proxy, commentId }
        const accessToken = localStorage.getItem('authToken');
        if (imgData.proxy && imgData.commentId) {
            let downloadUrl = `${getApiBaseUrl()}/api/tasks/${formData.id}/comments/${imgData.commentId}/download`;
            if (accessToken) {
                downloadUrl += `?token=${encodeURIComponent(accessToken)}`;
            }

            setPreviewImage({
                displayUrl: imgData.proxy, // already includes token from linkify
                downloadUrl: downloadUrl
            });
        } else {
            // Fallback for non-proxy images (legacy or external)
            setPreviewImage({
                displayUrl: imgData.direct || imgData,
                downloadUrl: imgData.direct || imgData
            });
        }
    };

    const renderComment = (comment) => {
        const isSystem = comment.type === 'system_return' || comment.type === 'system_reintegrate';
        const contextData = { taskId: formData.id, commentId: comment.id };

        if (isSystem) {
            const isReturn = comment.type === 'system_return';
            const cleanContent = cleanSystemMessage(comment.content);

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
                        <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
                            "{linkify(cleanContent, handleImagePreview, contextData)}"
                        </div>
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
                        <div className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {linkify(comment.content, handleImagePreview, contextData)}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const handleClosePanel = () => {
        setPreviewImage(null);
        onClose();
    };

    const headerIcon = isEdition ? <ClipboardList className="text-primary" size={18} /> : <Plus className="text-primary" size={18} />;

    return (
        <SlideOver
            open={isOpen}
            onOpenChange={(open) => !open && handleClosePanel()}
            title={isEdition ? "Editar Tarea" : "Nueva Tarea"}
            description={isEdition ? `ID: ${formData.id?.split('-')[0]}` : "Crea un nuevo pendiente operativo"}
            icon={headerIcon}
            className="w-[45vw] max-w-3xl"
        >
            <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-transparent">
                {/* Quick Access Toolbar */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        {isEdition && (formData.plan || formData.contentPlanId) && (
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

                        {isEdition && formData.status === 'DEVUELTA' && !showReintegratePrompt && (
                            <button
                                onClick={() => setShowReintegratePrompt(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20"
                            >
                                <RotateCcw size={11} /> Reintegrar Tarea
                            </button>
                        )}

                        <button
                            onClick={handleToggleFollow}
                            disabled={isTogglingFollow}
                            className={cn(
                                "flex items-center justify-center p-1.5 rounded-lg transition-all border shadow-sm",
                                isFollowing
                                    ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400"
                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:bg-zinc-50"
                            )}
                            title={isFollowing ? "Dejar de seguir" : "Seguir tarea"}
                        >
                            <Bell size={14} className={cn(isFollowing && "fill-current animate-in zoom-in-50")} />
                        </button>
                    </div>

                    {isEdition && (
                        <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-inner">
                             <UserAvatarPopover user={formData.creator}>
                                <TeamAvatar
                                    member={formData.creator}
                                    size={18}
                                    className="ring-1 ring-white dark:ring-zinc-800"
                                />
                             </UserAvatarPopover>
                             <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-tighter">De:</span>
                             <span className="text-[9px] text-zinc-900 dark:text-zinc-100 font-black uppercase tracking-tighter truncate max-w-[100px]">{formData.creator?.name || formData.creatorName}</span>
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* Top Form Section (Fixed height/Adaptive scroll) */}
                    <div className="shrink-0 overflow-y-auto max-h-[60%] border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-transparent">
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
                            className="p-5 space-y-4"
                        >
                                {/* Fila 1: Title & Client */}
                                <div className="grid grid-cols-2 gap-4 items-end">
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
                                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-[13px] font-bold focus:ring-2 ring-primary/10 outline-none transition-all shadow-sm h-[38px]"
                                        />
                                    </div>
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
                                </div>

                                {/* Fila 2: Assignee, Deadline & Status */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-1 space-y-1.5">
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
                                    <div className="col-span-1 space-y-1.5">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Deadline</label>
                                        <div className="relative w-full">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none z-10" />
                                            <DatePicker
                                                selected={formData.dueDate ? new Date(`${formData.dueDate.split('T')[0]}T12:00:00.000Z`) : null}
                                                onChange={(date) => {
                                                    const dateStr = date ? date.toISOString().split('T')[0] : '';
                                                    setFormData({...formData, dueDate: dateStr});
                                                }}
                                                dateFormat="dd/MM/yyyy"
                                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-[11px] font-bold focus:ring-2 ring-primary/10 outline-none shadow-sm h-[38px]"
                                                wrapperClassName="w-full"
                                                placeholderText="Elegir fecha..."
                                                isClearable
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-1 space-y-1.5">
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

                                {/* Links Section (Dropdowns for Edition, Interactive list for Creation) */}
                                {isEdition ? (
                                    <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                                Insumos & Referencias
                                            </label>
                                        </div>
                                        <div className="flex gap-2">
                                            {(() => {
                                                const referenceUrls = [];
                                                if (formData.referenceUrl) referenceUrls.push(formData.referenceUrl);
                                                if (Array.isArray(formData.referenceLinks)) {
                                                    formData.referenceLinks.forEach(u => referenceUrls.push(u));
                                                } else if (typeof formData.referenceLinks === 'string' && formData.referenceLinks.trim()) {
                                                    formData.referenceLinks.split(/[\s,\n;]+/).forEach(u => referenceUrls.push(u));
                                                }
                                                if (formData.taskAttachments) {
                                                    formData.taskAttachments
                                                        .filter(a => a.category === 'REFERENCIA')
                                                        .forEach(a => referenceUrls.push(a.url));
                                                }

                                                const uniqueReferences = [...new Set(referenceUrls)].filter(Boolean);

                                                const inputUrls = [];
                                                if (Array.isArray(formData.assetsLinks)) {
                                                    formData.assetsLinks.forEach(u => inputUrls.push(u));
                                                } else if (typeof formData.assetsLinks === 'string' && formData.assetsLinks.trim()) {
                                                    formData.assetsLinks.split(/[\s,\n;]+/).forEach(u => inputUrls.push(u));
                                                }
                                                if (formData.taskAttachments) {
                                                    formData.taskAttachments
                                                        .filter(a => a.category === 'INSUMO')
                                                        .forEach(a => inputUrls.push(a.url));
                                                }

                                                const uniqueInputs = [...new Set(inputUrls)].filter(Boolean);

                                                if (uniqueReferences.length === 0 && uniqueInputs.length === 0) {
                                                    return (
                                                        <div className="text-[10px] text-zinc-400 italic text-center py-2 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 w-full">
                                                            No hay enlaces vinculados a esta tarea.
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <>
                                                        {uniqueReferences.length > 0 && (
                                                            <LinkDropdown
                                                                label="Referencia"
                                                                links={uniqueReferences}
                                                                icon={FileText}
                                                            />
                                                        )}
                                                        {uniqueInputs.length > 0 && (
                                                            <LinkDropdown
                                                                label="Insumo"
                                                                links={uniqueInputs}
                                                                icon={Database}
                                                            />
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                                        {/* Sección de Referencias */}
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">
                                                Referencias iniciales
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Nombre de la referencia (ej: Figma...)"
                                                    value={newRefName}
                                                    onChange={e => setNewRefName(e.target.value)}
                                                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:ring-2 ring-primary/10 shadow-sm"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="URL (https://...)"
                                                        value={newRefUrl}
                                                        onChange={e => setNewRefUrl(e.target.value)}
                                                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:ring-2 ring-primary/10 shadow-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!newRefUrl.trim()) return;
                                                            let finalUrl = newRefUrl.trim();
                                                            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                                                                finalUrl = 'https://' + finalUrl;
                                                            }
                                                            setTempReferences(prev => [...prev, { url: finalUrl, name: newRefName.trim() || finalUrl }]);
                                                            setNewRefUrl("");
                                                            setNewRefName("");
                                                        }}
                                                        className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-xl transition-all shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                                        title="Agregar Referencia"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {tempReferences.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {tempReferences.map((ref, index) => (
                                                        <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm">
                                                            <ExternalLink size={12} className="text-zinc-400 shrink-0" />
                                                            <span className="truncate max-w-[150px]">{ref.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTempReferences(prev => prev.filter((_, i) => i !== index))}
                                                                className="text-zinc-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Sección de Insumos */}
                                        <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/10">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">
                                                Insumos iniciales
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Nombre del insumo (ej: Assets...)"
                                                    value={newInpName}
                                                    onChange={e => setNewInpName(e.target.value)}
                                                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:ring-2 ring-primary/10 shadow-sm"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="URL (https://...)"
                                                        value={newInpUrl}
                                                        onChange={e => setNewInpUrl(e.target.value)}
                                                        className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:ring-2 ring-primary/10 shadow-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!newInpUrl.trim()) return;
                                                            let finalUrl = newInpUrl.trim();
                                                            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                                                                finalUrl = 'https://' + finalUrl;
                                                            }
                                                            setTempInputs(prev => [...prev, { url: finalUrl, name: newInpName.trim() || finalUrl }]);
                                                            setNewInpUrl("");
                                                            setNewInpName("");
                                                        }}
                                                        className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-xl transition-all shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                                        title="Agregar Insumo"
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {tempInputs.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {tempInputs.map((inp, index) => (
                                                        <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm">
                                                            <ExternalLink size={12} className="text-zinc-400 shrink-0" />
                                                            <span className="truncate max-w-[150px]">{inp.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTempInputs(prev => prev.filter((_, i) => i !== index))}
                                                                className="text-zinc-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* General Context / Static Comments */}
                            <div className="space-y-1.5 pb-4">
                                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Descripción / Contexto General</label>
                                <textarea
                                    value={formData.comments}
                                    onChange={e => setFormData({...formData, comments: e.target.value})}
                                    placeholder="Detalles base para el responsable..."
                                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-medium focus:ring-2 ring-primary/10 outline-none transition-all resize-none h-28 shadow-sm"
                                />
                            </div>
                        </form>
                    </div>

                    {/* Bottom Chat Section (Elastic/Independent Scroll) */}
                    <div
                        ref={chatContainerRef}
                        onDragOver={(e) => {
                            if (!isEdition) return;
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => {
                            if (!isEdition) return;
                            setIsDragging(false);
                        }}
                        onDrop={(e) => {
                            if (!isEdition) return;
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files[0];
                            if (file && file.type.startsWith('image/')) {
                                handleAddComment(file);
                            }
                        }}
                        className="flex-1 overflow-y-auto custom-scrollbar relative bg-zinc-50/50 dark:bg-transparent"
                    >
                        {/* Drag & Drop Overlay */}
                        <AnimatePresence>
                            {isDragging && isEdition && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-8 transition-all"
                                >
                                    <div className="w-full h-full border-2 border-dashed border-primary/40 rounded-3xl flex flex-col items-center justify-center gap-4 animate-in zoom-in-95">
                                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                            <ImageIcon size={32} />
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-widest text-primary">Suelta tus imágenes aquí</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="px-5 py-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800/50" />
                                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-full">
                                    <MessageSquare size={10} className="text-zinc-400" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Conversación & Eventos</span>
                                </div>
                                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800/50" />
                            </div>

                            <div className="space-y-3 pb-4">
                                {isEdition ? (
                                    (!formData.taskComments || formData.taskComments.length === 0) ? (
                                        <div className="py-10 flex flex-col items-center justify-center text-center px-8">
                                            <div className="w-10 h-10 bg-zinc-50 dark:bg-zinc-900/50 rounded-full flex items-center justify-center mb-2 text-zinc-200 dark:text-zinc-800">
                                                <MessageSquare size={20} />
                                            </div>
                                            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sin comentarios aún</h4>
                                        </div>
                                    ) : (
                                        formData.taskComments.map(renderComment)
                                    )
                                ) : (
                                    tempComments.length === 0 ? (
                                        <div className="py-10 flex flex-col items-center justify-center text-center px-8">
                                            <div className="w-10 h-10 bg-zinc-50 dark:bg-zinc-900/50 rounded-full flex items-center justify-center mb-2 text-zinc-200 dark:text-zinc-800">
                                                <MessageSquare size={20} />
                                            </div>
                                            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Agrega comentarios iniciales para el equipo...</h4>
                                        </div>
                                    ) : (
                                        tempComments.map(renderComment)
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Actions Area - Split for unified view */}
                <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-[0_-4px_30px_-10px_rgba(0,0,0,0.1)]">
                    <div className="flex flex-col gap-4">
                        {/* Chat Input Field */}
                        <div className="flex flex-col gap-2">
                            {selectedFile && isEdition && (
                                <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in slide-in-from-bottom-1">
                                    <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-primary">
                                        <ImageIcon size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-primary truncate">{selectedFile.name}</p>
                                        <p className="text-[8px] text-primary/60">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedFile(null)}
                                        className="p-1 hover:bg-primary/10 rounded text-primary"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
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
                                    placeholder={isEdition ? "Escribe un mensaje al equipo..." : "Escribe comentarios/mensajes iniciales..."}
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-primary/30 rounded-xl px-12 py-3 pr-12 text-[11px] font-medium outline-none transition-all resize-none h-[48px] no-scrollbar shadow-inner"
                                />
                                <div className="absolute left-1.5 top-1.5">
                                    <input
                                        type="file"
                                        id="task-file-upload"
                                        className="hidden"
                                        accept="image/*"
                                        disabled={!isEdition}
                                        onChange={(e) => setSelectedFile(e.target.files[0])}
                                    />
                                    <label
                                        htmlFor="task-file-upload"
                                        className={cn(
                                            "p-2 rounded-lg text-zinc-400 block transition-all",
                                            isEdition
                                                ? "hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-primary cursor-pointer"
                                                : "opacity-40 cursor-not-allowed"
                                        )}
                                        title={isEdition ? "Adjuntar archivo" : "Los adjuntos de S3 se habilitan una vez creada la tarea."}
                                    >
                                        <Paperclip size={16} />
                                    </label>
                                </div>
                                <button
                                    onClick={() => handleAddComment()}
                                    disabled={isEdition ? ((!newComment.trim() && !selectedFile) || isSendingComment) : !newComment.trim()}
                                    className={cn(
                                        "absolute right-1.5 top-1.5 p-2 rounded-lg transition-all",
                                        (newComment.trim() || (selectedFile && isEdition)) ? "bg-primary text-white shadow-md shadow-primary/10 active:scale-90" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                                    )}
                                >
                                    {isSendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Save/Cancel Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleClosePanel}
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

            {/* Media Viewer Lightbox */}
            {previewImage && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4 md:p-10 animate-in fade-in duration-300">
                    <div className="absolute inset-0" onClick={() => setPreviewImage(null)} />
                    <div className="w-full h-full max-w-6xl flex flex-col z-[105] relative animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between mb-4 bg-zinc-900/50 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
                            <div className="flex items-center gap-3 pl-2">
                                <div className="p-2 bg-primary/20 rounded-xl">
                                    <ImageIcon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white">Vista previa de imagen</span>
                                    <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-tighter">Archivo de tarea</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadImage(previewImage?.downloadUrl)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-white text-xs font-bold transition-all shadow-lg"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    DESCARGAR ARCHIVO
                                </button>
                                <button
                                    onClick={() => setPreviewImage(null)}
                                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all border border-white/10"
                                    title="Cerrar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-white/5 dark:bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden shadow-2xl relative flex items-center justify-center">
                            <img
                                src={previewImage?.displayUrl}
                                alt="Preview"
                                className="max-w-full max-h-full object-contain rounded-xl shadow-xl"
                            />
                        </div>
                    </div>
                </div>
            )}
        </SlideOver>
    );
};

export default TaskSidePanel;
