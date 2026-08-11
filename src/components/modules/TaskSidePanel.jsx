import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
    Loader2, Zap, Star, Link as LinkIcon, ExternalLink,
    X, Send, MessageSquare, RotateCcw, CheckCircle2, Bell,
    LayoutGrid, Calendar, User, Trash2, Plus, ClipboardList,
    FileText, Database, Paperclip, ImageIcon, Eye, Download, Check,
    MoreHorizontal
} from '@/components/ui/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { triggerConfetti } from '@/utils/confetti';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { useAuth } from '@/context/AuthContext';
import UserAvatarPopover from '@/components/ui/UserAvatarPopover';
import LinkDropdown from '@/components/ui/LinkDropdown';
import { linkify, cleanSystemMessage } from '@/utils/chatUtils.jsx';
import RichTextEditor from '@/components/ui/RichTextEditor';
import DateDivider from '@/components/ui/DateDivider';
import { APPROVED_EMOJIS } from '@/constants/approvedEmojis';
import RichCommentContent from '@/components/ui/RichCommentContent';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogPortal,
    DialogOverlay,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

// Global in-memory cache for task comments (SWR engine)
const taskCommentsCache = {};

const EMPTY_TASK_FORM = {
    title: '',
    clientId: '',
    assigneeId: '',
    dueDate: '',
    comments: '',
    status: 'PENDIENTE',
    isPriority: false,
    priority: null,
    isSpecial: false,
    hasReference: false,
    referenceUrl: '',
    referenceLinks: [],
    assetsLinks: [],
    taskAttachments: []
};

const hasMeaningfulTaskDraft = (draft) => {
    if (!draft || typeof draft !== 'object') return false;

    const textFields = [
        draft.title,
        draft.assigneeId,
        draft.dueDate,
        draft.newComment,
        draft.newRefUrl,
        draft.newRefName,
        draft.newInpUrl,
        draft.newInpName
    ];

    if (textFields.some(value => typeof value === 'string' && value.trim().length > 0)) {
        return true;
    }

    if (draft.isPriority || draft.isSpecial || draft.isFollowing) return true;

    return [draft.tempReferences, draft.tempInputs, draft.tempComments, draft.tempAttachments]
        .some(value => Array.isArray(value) && value.length > 0);
};

const getManualTaskAttachments = (attachments = []) =>
    (Array.isArray(attachments) ? attachments : []).filter(attachment => !attachment.commentId);

const getFileVisualMeta = (file = {}) => {
    const name = file.name || 'Adjunto de chat';
    const type = file.mimeType || file.type || '';
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : 'ARCHIVO';
    const isImage = type.startsWith('image/') || /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(name);
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);

    return {
        isImage,
        icon: isPdf ? FileText : isImage ? ImageIcon : FileText,
        label: isPdf ? 'PDF - Documento' : isImage ? `${ext} - Imagen` : `${ext} - Archivo`
    };
};

const taskComposerLabelClass = "text-[11px] font-medium text-zinc-500 dark:text-zinc-400";
const taskComposerFieldClass = "w-full rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 bg-transparent px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 shadow-none outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10";
const taskComposerSectionClass = "space-y-4 border-t border-zinc-200/70 dark:border-zinc-800/70 pt-5";
const taskOperationalGridClass = "grid grid-cols-6 gap-x-5 gap-y-4";
const taskCreateLabelClass = taskComposerLabelClass;
const taskCreateFieldClass = taskComposerFieldClass;
const taskCreateSectionClass = taskComposerSectionClass;
const taskPriorityOptions = [
    { value: 'URGENTE', label: 'Urgente', className: 'bg-red-600 text-white border-red-500' },
    { value: 'ALTA', label: 'Alta', className: 'bg-amber-500 text-white border-amber-500' },
    { value: 'NORMAL', label: 'Normal', className: 'bg-blue-600 text-white border-blue-500' }
];

const MediaPreviewModal = ({ isOpen, onClose, previewImage, handleDownloadImage }) => {
    if (!previewImage) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPortal>
                {/* Full-screen Fixed Overlay with adaptive blur background */}
                <DialogOverlay
                    onClick={onClose}
                    className="fixed inset-0 z-[110] bg-white/70 dark:bg-black/80 backdrop-blur-md"
                />

                {/* Centered responsive container utilizing DialogPrimitive.Content */}
                <DialogPrimitive.Content
                    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[111] flex flex-col w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)] max-w-6xl p-0 border-none bg-transparent outline-none focus:outline-none"
                    onPointerDownOutside={onClose}
                    onEscapeKeyDown={onClose}
                >
                    <DialogPrimitive.Title className="sr-only">Vista previa de imagen</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">
                        Vista ampliada del archivo adjunto con opciones para descargarlo o cerrar el visor.
                    </DialogPrimitive.Description>
                    <div
                        className="w-full h-full flex flex-col"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        {/* Toolbar */}
                        <div className="flex items-center justify-between mb-4 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-md p-3 rounded-2xl border border-zinc-200 dark:border-white/10 shadow-2xl shrink-0">
                            <div className="flex items-center gap-3 pl-2">
                                <div className="p-2 bg-primary/20 rounded-xl">
                                    <ImageIcon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-zinc-900 dark:text-white text-left">Vista previa de imagen</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-tighter text-left">Archivo de tarea</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleDownloadImage(previewImage?.downloadUrl);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-white text-xs font-bold transition-all shadow-lg cursor-pointer"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    DESCARGAR ARCHIVO
                                </button>
                                <button
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onClose();
                                    }}
                                    className="p-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/20 rounded-xl text-zinc-700 dark:text-white transition-all border border-zinc-200 dark:border-white/10 cursor-pointer"
                                    title="Cerrar"
                                    aria-label="Cerrar vista previa"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Image Region Contained perfectly inside Viewport */}
                        <div className="flex-1 bg-zinc-100/30 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-white/5 overflow-hidden shadow-2xl relative flex items-center justify-center min-h-0 min-w-0">
                            <img
                                src={previewImage?.displayUrl}
                                alt="Preview"
                                className="max-w-full max-h-full w-auto h-auto object-contain rounded-xl shadow-xl"
                            />
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
};

const TaskSidePanel = ({ isOpen, onClose, onSuccess, clientsList, taskData = null, defaultClientId = null }) => {
    const { toast } = useToast();
    const confirm = useConfirmDialog();
    const { currentUser } = useAuth();
    const isEdition = !!taskData?.id;

    const [commentPopover, setCommentPopover] = useState({ commentId: null, view: null }); // view: 'quick-actions' | 'all-emojis' | null
    const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingContent, setEditingContent] = useState("");
    const [showToolbar, setShowToolbar] = useState(false);
    const [showEditToolbar, setShowEditToolbar] = useState(false);
    const [showPriorityPopover, setShowPriorityPopover] = useState(false);

    // Local state for atomic inline editing
    const [editingField, setEditingField] = useState(null); // 'title' | 'assigneeId' | 'dueDate' | 'status' | null
    const [inlineVal, setInlineVal] = useState("");
    const isDraftHydratedRef = useRef(false);

    const hasStoredMeaningfulDraft = () => {
        const saved = sessionStorage.getItem('task_focus_draft');
        if (!saved) return false;
        try {
            return hasMeaningfulTaskDraft(JSON.parse(saved));
        } catch (e) {
            return false;
        }
    };

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
        priority: null,
        isSpecial: false,
        hasReference: false,
        referenceUrl: '',
        referenceLinks: [],
        assetsLinks: []
    });

    const [newComment, setNewComment] = useState("");
    const [newCommentText, setNewCommentText] = useState("");
    const [editingCommentText, setEditingCommentText] = useState("");
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
    const [tempAttachments, setTempAttachments] = useState([]); // Array of { url, name, category }

    const [isUploadingTemp, setIsUploadingTemp] = useState(false);
    const [isLoadingComments, setIsLoadingComments] = useState(false);

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
    const mainEditorRef = useRef(null);
    const scrollRef = useRef(null);
    const chatContainerRef = useRef(null);

    const handleDownloadImage = async (url) => {
        if (!url) return;
        try {
            const token = localStorage.getItem('authToken');
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`Servidor respondió con código ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            // Extract filename from Content-Disposition header with safe fallback
            let fileName = 'descarga_archivo';
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) {
                    fileName = decodeURIComponent(matches[1].replace(/['"]/g, ''));
                }
            } else {
                try {
                    const parsedUrl = new URL(url, window.location.href);
                    const filenameParam = parsedUrl.searchParams.get('filename');
                    if (filenameParam) {
                        fileName = filenameParam;
                    } else {
                        const urlPath = url.split('?')[0];
                        const segment = urlPath.split('/').pop();
                        if (segment && segment !== 'download') {
                            fileName = decodeURIComponent(segment);
                        } else {
                            fileName = 'adjunto_tarea.jpg';
                        }
                    }
                } catch(e) {
                    const urlPath = url.split('?')[0];
                    const segment = urlPath.split('/').pop();
                    if (segment && segment !== 'download') {
                        fileName = decodeURIComponent(segment);
                    } else {
                        fileName = 'adjunto_tarea.jpg';
                    }
                }
            }

            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
            }, 5000); // Increased to 5000ms safe margin for slower browsers

            toast({ title: "Descarga exitosa", description: "El archivo se ha descargado correctamente." });
        } catch (err) {
            console.error("Error downloading file:", err);
            toast({
                variant: "destructive",
                title: "Error de descarga",
                description: err.message || "No se pudo descargar el archivo."
            });
        }
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

    useEffect(() => {
        if (!isOpen || !isEdition || !taskData?.id || !currentUser?.id) return;

        fetch(`${getApiBaseUrl()}/api/tasks/${taskData.id}/trace-open`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
            keepalive: true
        }).then((response) => {
            if (!response.ok) {
                console.error('[TaskSidePanel] Task open trace failed:', response.status);
            }
        }).catch((error) => {
            console.error('[TaskSidePanel] Task open trace failed:', error);
        });
    }, [isOpen, isEdition, taskData?.id, currentUser?.id]);

    // Decoupled chat/comments polling while focus modal is open
    useEffect(() => {
        if (!isOpen || !isEdition || !formData.id) {
            setIsLoadingComments(false);
            return;
        }

        let isMounted = true;

        const fetchComments = async (isInitial = false) => {
            if (isInitial && isMounted) {
                if (taskCommentsCache[formData.id]) {
                    setIsLoadingComments(false);
                } else {
                    setIsLoadingComments(true);
                }
            }
            try {
                const baseUrl = getApiBaseUrl();
                const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                });
                if (res.ok && isMounted) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        taskCommentsCache[formData.id] = data;
                        setFormData(prev => {
                            const hasChanged = JSON.stringify(prev.taskComments) !== JSON.stringify(data);
                            if (hasChanged) {
                                return { ...prev, taskComments: data };
                            }
                            return prev;
                        });
                    }
                }
            } catch (err) {
                console.error("Error polling task comments:", err);
            } finally {
                if (isInitial && isMounted) {
                    setIsLoadingComments(false);
                }
            }
        };

        // Call immediately for initial fetch
        fetchComments(true);

        const interval = setInterval(() => {
            if (!document.hidden) fetchComments(false);
        }, 10000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isOpen, isEdition, formData.id]);

    // Save draft to sessionStorage on formData changes (Creation mode)
    useEffect(() => {
        if (isOpen && !isEdition) {
            if (!isDraftHydratedRef.current) return; // Guard clause: avoid overwriting with empty initial form
            const draftData = {
                title: formData.title,
                clientId: formData.clientId,
                assigneeId: formData.assigneeId,
                dueDate: formData.dueDate,
                isPriority: formData.isPriority,
                priority: formData.priority,
                isSpecial: formData.isSpecial,
                status: formData.status,
                tempReferences,
                tempInputs,
                tempComments,
                tempAttachments,
                // Include in-progress fields in sessionStorage snapshot!
                newComment,
                newRefUrl,
                newRefName,
                newInpUrl,
                newInpName
            };
            if (hasMeaningfulTaskDraft(draftData)) {
                sessionStorage.setItem('task_focus_draft', JSON.stringify(draftData));
            } else {
                sessionStorage.removeItem('task_focus_draft');
            }
        }
    }, [
        formData, tempReferences, tempInputs, tempComments, tempAttachments,
        newComment, newRefUrl, newRefName, newInpUrl, newInpName,
        isOpen, isEdition
    ]);

    const handleCleanDraftOnly = () => {
        sessionStorage.removeItem('task_focus_draft');
        setFormData({
            ...EMPTY_TASK_FORM,
            clientId: defaultClientId || ''
        });
        setTempReferences([]);
        setTempInputs([]);
        setTempComments([]);
        setTempAttachments([]);
        setNewComment("");
        setNewCommentText("");
        setNewRefUrl("");
        setNewRefName("");
        setNewInpUrl("");
        setNewInpName("");
        setSelectedFile(null);
        toast({ title: "Borrador limpiado", description: "Los campos han sido reiniciados." });
    };

    const handleDiscardAndCloseDraft = () => {
        sessionStorage.removeItem('task_focus_draft');
        setFormData({
            ...EMPTY_TASK_FORM,
            clientId: defaultClientId || ''
        });
        setTempReferences([]);
        setTempInputs([]);
        setTempComments([]);
        setTempAttachments([]);
        setNewComment("");
        setNewCommentText("");
        setNewRefUrl("");
        setNewRefName("");
        setNewInpUrl("");
        setNewInpName("");
        setSelectedFile(null);
        toast({ title: "Borrador descartado" });
        onClose();
    };

    const handlePassiveClose = () => {
        setShowToolbar(false);
        setShowEditToolbar(false);
        setShowPriorityPopover(false);
        setShowInputEmojiPicker(false);
        setCommentPopover({ commentId: null, view: null });
        onClose();
    };

    const clearDraft = handleDiscardAndCloseDraft;

    // Populate or Reset Form (Consolidated Logic Flow)
    useEffect(() => {
        if (isOpen) {
            setPreviewImage(null); // Clear image viewer state when opening a task
            setSelectedFile(null); // Clear pending attachment
            setNewComment("");    // Clear pending comment draft
            setNewCommentText("");
            setEditingCommentText("");
            setEditingField(null);
            setShowToolbar(false);
            setShowEditToolbar(false);
            setShowPriorityPopover(false);
            setShowInputEmojiPicker(false);
            setCommentPopover({ commentId: null, view: null });
            setNewRefUrl("");
            setNewRefName("");
            setNewInpUrl("");
            setNewInpName("");
            setEditRefUrl("");
            setEditRefName("");
            setEditInpUrl("");
            setEditInpName("");

            // Sychronously lock draft saving during initialization
            isDraftHydratedRef.current = false;

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
                    priority: taskData.priority || null,
                    isSpecial: taskData.isSpecial || false,
                    hasReference: !!taskData.referenceUrl,
                    referenceUrl: taskData.referenceUrl || '',
                    referenceLinks: referenceLinks,
                    assetsLinks: taskData.contentItem?.assetsLinks || [],
                    taskComments: taskCommentsCache[taskData.id] || taskData.taskComments || [],
                    taskAttachments: taskData.taskAttachments || [],
                    creator: taskData.creator || { name: taskData.creatorName || 'Sistema' },
                    plan: taskData.plan,
                    contentItemId: taskData.contentItemId
                });

                // Completed loading task, no draft hydration needed
                isDraftHydratedRef.current = true;
            } else if (!isEdition) {
                // Restoration flow for "Nueva Tarea" (isCreationMode)
                const savedDraft = sessionStorage.getItem('task_focus_draft');
                if (savedDraft) {
                    try {
                        const parsed = JSON.parse(savedDraft);
                        if (!hasMeaningfulTaskDraft(parsed)) {
                            sessionStorage.removeItem('task_focus_draft');
                            setIsFollowing(false);
                            setFormData({
                                ...EMPTY_TASK_FORM,
                                clientId: defaultClientId || ''
                            });
                            setTempReferences([]);
                            setTempInputs([]);
                            setTempComments([]);
                            setTempAttachments([]);
                            isDraftHydratedRef.current = true;
                            return;
                        }
                        setFormData({
                            ...EMPTY_TASK_FORM,
                            title: parsed.title || '',
                            clientId: parsed.clientId || defaultClientId || '',
                            assigneeId: parsed.assigneeId || '',
                            dueDate: parsed.dueDate || '',
                            isPriority: parsed.isPriority || false,
                            priority: parsed.priority || null,
                            isSpecial: parsed.isSpecial || false,
                            status: parsed.status || 'PENDIENTE'
                        });

                        if (Array.isArray(parsed.tempReferences)) setTempReferences(parsed.tempReferences);
                        else setTempReferences([]);

                        if (Array.isArray(parsed.tempInputs)) setTempInputs(parsed.tempInputs);
                        else setTempInputs([]);

                        if (Array.isArray(parsed.tempComments)) setTempComments(parsed.tempComments);
                        else setTempComments([]);

                        if (Array.isArray(parsed.tempAttachments)) setTempAttachments(parsed.tempAttachments);
                        else setTempAttachments([]);

                        // Restore fields in progress!
                        if (parsed.newComment !== undefined) setNewComment(parsed.newComment);
                        if (parsed.newRefUrl !== undefined) setNewRefUrl(parsed.newRefUrl);
                        if (parsed.newRefName !== undefined) setNewRefName(parsed.newRefName);
                        if (parsed.newInpUrl !== undefined) setNewInpUrl(parsed.newInpUrl);
                        if (parsed.newInpName !== undefined) setNewInpName(parsed.newInpName);

                        toast({
                            title: "Borrador restaurado",
                            description: "Hemos recuperado los datos de tu última sesión.",
                        });
                    } catch (e) {
                        console.error("Error parsing task focus draft:", e);
                        sessionStorage.removeItem('task_focus_draft');
                    } finally {
                        isDraftHydratedRef.current = true;
                    }
                } else {
                    // Start clean if no draft exists
                    setIsFollowing(false);
                    setFormData({
                        ...EMPTY_TASK_FORM,
                        clientId: defaultClientId || ''
                    });
                    setTempReferences([]);
                    setTempInputs([]);
                    setTempComments([]);
                    setTempAttachments([]);
                    setNewComment("");
                    setNewRefUrl("");
                    setNewRefName("");
                    setNewInpUrl("");
                    setNewInpName("");

                    isDraftHydratedRef.current = true;
                }
            }
            setShowReintegratePrompt(false);
            setReintegrateReason("");
        } else {
            isDraftHydratedRef.current = false;
        }
    }, [isOpen, taskData, isEdition, defaultClientId, clientsList, toast]);

    // Handle Inline Hot PATCH saving
    const saveInlineField = async (fieldName, finalValue) => {
        setIsSubmitting(true);
        try {
            const baseUrl = getApiBaseUrl();
            let processedVal = finalValue;
            if (fieldName === 'dueDate' && finalValue) {
                let cleanDate = finalValue.split('T')[0];
                processedVal = `${cleanDate}T12:00:00.000Z`;
            }

            const payload = {
                [fieldName]: processedVal
            };
            if (fieldName === 'priority') {
                payload.isPriority = finalValue === 'URGENTE' || finalValue === 'ALTA';
                payload.priority = finalValue === 'NONE' || !finalValue ? null : finalValue;
            }

            const token = localStorage.getItem('authToken');
            const url = `${baseUrl}/api/tasks/${formData.id}`;

            if (fieldName === 'status' && finalValue === 'REALIZADA' && formData.originalStatus !== 'REALIZADA') {
                triggerConfetti();
            }

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
                toast({ title: 'Campo actualizado', description: 'La propiedad se guardó correctamente en caliente.' });

                // Update local state with fresh data
                let formattedDate = '';
                if (updatedTask.dueDate) {
                    try {
                        formattedDate = new Date(updatedTask.dueDate).toISOString().split('T')[0];
                    } catch(e) {}
                }

                setFormData(prev => ({
                    ...prev,
                    title: updatedTask.title || prev.title,
                    assigneeId: updatedTask.assigneeId || '',
                    status: updatedTask.status || 'PENDIENTE',
                    priority: updatedTask.priority || null,
                    isPriority: updatedTask.isPriority || false,
                    dueDate: formattedDate,
                    originalStatus: updatedTask.status,
                    taskComments: updatedTask.taskComments || prev.taskComments,
                    taskAttachments: updatedTask.taskAttachments || prev.taskAttachments
                }));

                setEditingField(null);
                onSuccess(); // Refresh Kanban board
            } else {
                throw new Error("Failed to patch task");
            }
        } catch (err) {
            console.error("Inline patch failed:", err);
            toast({ title: 'Error', description: 'No se pudo guardar la modificación.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();

        if (!formData.title || !formData.clientId) {
            toast({ variant: "destructive", title: "Faltan campos", description: "El título y el cliente son obligatorios." });
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
                comments: '', // Removed general comments description completely
                status: formData.status,
                isPriority: formData.isPriority,
                priority: formData.isPriority ? (formData.priority || 'NORMAL') : null,
                isSpecial: formData.isSpecial,
                followOnCreate: !isEdition ? isFollowing : undefined,
                initial_references: !isEdition ? tempReferences : undefined,
                initial_inputs: !isEdition ? tempInputs : undefined,
                tempAttachments: !isEdition ? tempAttachments : undefined,
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

                // Clear sessionStorage draft on successful task creation
                if (!isEdition) {
                    sessionStorage.removeItem('task_focus_draft');
                }

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

    const handleTaskAttachmentOpen = (item) => {
        if (!item?.url) return;
        const isManagedUpload = item.id && /storageapi\.dev|\/chat-evidence\//i.test(item.url);
        if (isManagedUpload) {
            const downloadUrl = `${getApiBaseUrl()}/api/tasks/${formData.id}/attachments/${item.id}/download`;
            handleDownloadImage(downloadUrl);
            return;
        }

        const openedWindow = window.open(item.url, '_blank', 'noopener,noreferrer');
        if (openedWindow) openedWindow.opener = null;
    };

    const handleToggleSpecial = async () => {
        const nextIsSpecial = !formData.isSpecial;

        if (!isEdition) {
            setFormData(prev => ({ ...prev, isSpecial: nextIsSpecial }));
            return;
        }

        setFormData(prev => ({ ...prev, isSpecial: nextIsSpecial }));
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${getApiBaseUrl()}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ isSpecial: nextIsSpecial })
            });

            if (!res.ok) throw new Error('Failed to update special flag');

            toast({
                title: nextIsSpecial ? 'Tarea marcada como especial' : 'Tarea sin marca especial',
                description: nextIsSpecial ? 'Se resaltará con borde morado en el tablero.' : 'La tarea vuelve a su estilo normal.'
            });
            onSuccess();
        } catch (err) {
            console.error('Error toggling special flag:', err);
            setFormData(prev => ({ ...prev, isSpecial: !nextIsSpecial }));
            toast({ title: 'Error', description: 'No se pudo actualizar la marca especial.', variant: 'destructive' });
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

            const statusRes = await fetch(`${baseUrl}/api/tasks/${formData.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    status: 'PENDIENTE',
                    reintegrateReason: reintegrateReason
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
                setFormData(prev => {
                    const updatedComments = [...(prev.taskComments || []), comment];
                    taskCommentsCache[formData.id] = updatedComments;
                    return {
                        ...prev,
                        taskComments: updatedComments
                    };
                });
                setNewComment("");
                setSelectedFile(null);
                toast({ title: "Comentario enviado" });
                setTimeout(scrollToBottomSmooth, 50);
            }
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo enviar el comentario." });
        } finally {
            setIsSendingComment(false);
        }
    };

    const handleToggleReaction = async (commentId, emoji) => {
        const userId = currentUser?.id;
        if (!userId) return;

        let originalComments = [...(formData.taskComments || [])];
        setFormData(prev => {
            const updated = (prev.taskComments || []).map(comment => {
                if (comment.id !== commentId) return comment;

                let rx = [...(comment.reactions || [])];
                const existingIndex = rx.findIndex(r => r.emoji === emoji);

                if (existingIndex !== -1) {
                    const existing = rx[existingIndex];
                    if (existing.userReacted) {
                        const newCount = existing.count - 1;
                        if (newCount <= 0) {
                            rx.splice(existingIndex, 1);
                        } else {
                            rx[existingIndex] = { ...existing, count: newCount, userReacted: false };
                        }
                    } else {
                        rx[existingIndex] = { ...existing, count: existing.count + 1, userReacted: true };
                    }
                } else {
                    rx.push({ emoji, count: 1, userReacted: true });
                }

                return { ...comment, reactions: rx };
            });

            taskCommentsCache[formData.id] = updated;
            return { ...prev, taskComments: updated };
        });

        try {
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments/${commentId}/reactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ emoji })
            });

            if (!res.ok) {
                throw new Error("Failed to toggle reaction");
            }
        } catch (err) {
            console.error("Error toggling reaction:", err);
            setFormData(prev => {
                taskCommentsCache[formData.id] = originalComments;
                return { ...prev, taskComments: originalComments };
            });
            toast({ variant: "destructive", title: "Error", description: "No se pudo reaccionar al comentario." });
        }
    };

    const handleUpdateComment = async (commentId) => {
        if (!editingContent.trim()) {
            return toast({ variant: "destructive", title: "Contenido vacío", description: "El contenido del comentario no puede estar vacío." });
        }

        const originalComments = [...(formData.taskComments || [])];
        setFormData(prev => {
            const updated = (prev.taskComments || []).map(comment => {
                if (comment.id === commentId) {
                    return { ...comment, content: editingContent, isEdited: true };
                }
                return comment;
            });
            taskCommentsCache[formData.id] = updated;
            return { ...prev, taskComments: updated };
        });

        setEditingCommentId(null);

        try {
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments/${commentId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ content: editingContent })
            });

            if (!res.ok) {
                throw new Error("Failed to update comment");
            }

            const updatedComment = await res.json();
            setFormData(prev => {
                const updated = (prev.taskComments || []).map(comment => {
                    if (comment.id === commentId) {
                        return { ...comment, ...updatedComment };
                    }
                    return comment;
                });
                taskCommentsCache[formData.id] = updated;
                return { ...prev, taskComments: updated };
            });

            toast({ title: "Comentario actualizado" });
        } catch (err) {
            console.error("Error updating comment:", err);
            setFormData(prev => {
                taskCommentsCache[formData.id] = originalComments;
                return { ...prev, taskComments: originalComments };
            });
            toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el comentario." });
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!(await confirm({
            title: 'Eliminar comentario',
            description: 'El comentario y sus adjuntos asociados se eliminarán permanentemente.',
            confirmLabel: 'Eliminar'
        }))) return;

        const originalComments = [...(formData.taskComments || [])];
        setFormData(prev => {
            const updated = (prev.taskComments || []).filter(comment => comment.id !== commentId);
            taskCommentsCache[formData.id] = updated;
            return { ...prev, taskComments: updated };
        });

        try {
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/tasks/${formData.id}/comments/${commentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!res.ok) {
                throw new Error("Failed to delete comment");
            }

            toast({ title: "Comentario eliminado" });
        } catch (err) {
            console.error("Error deleting comment:", err);
            setFormData(prev => {
                taskCommentsCache[formData.id] = originalComments;
                return { ...prev, taskComments: originalComments };
            });
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el comentario." });
        }
    };

    const handleUploadTempFile = async (file) => {
        if (!file) return;
        setIsUploadingTemp(true);
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const fileFormData = new FormData();
            fileFormData.append('file', file);

            const res = await fetch(`${baseUrl}/api/tasks/upload-temp`, {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: fileFormData
            });

            if (res.ok) {
                const data = await res.json();
                setTempAttachments(prev => [...prev, { url: data.url, name: data.name, size: data.size, mimeType: data.mimeType, category: 'INSUMO' }]);
                toast({ title: "Archivo adjuntado al borrador", description: data.name });
            } else {
                throw new Error("Failed to upload temp file");
            }
        } catch (err) {
            console.error("Temp upload failed:", err);
            toast({ variant: "destructive", title: "Error de carga", description: "No se pudo subir el archivo temporal." });
        } finally {
            setIsUploadingTemp(false);
        }
    };

    const handleChatFileSelected = (file) => {
        if (!file) return;
        if (isEdition) {
            setSelectedFile(file);
        } else {
            handleUploadTempFile(file);
        }
    };

    const handleDroppedChatFiles = (files) => {
        const [file] = Array.from(files || []);
        handleChatFileSelected(file);
    };

    const handleImagePreview = async (imgData) => {
        if (imgData.proxy && imgData.commentId) {
            let downloadUrl = `${getApiBaseUrl()}/api/tasks/${formData.id}/comments/${imgData.commentId}/download`;
            const params = [];
            if (imgData.name) {
                params.push(`filename=${encodeURIComponent(imgData.name)}`);
            }
            if (params.length > 0) {
                downloadUrl += `?${params.join('&')}`;
            }

            try {
                const response = await fetch(imgData.proxy);
                if (!response.ok) throw new Error(`Preview failed with status ${response.status}`);
                const displayUrl = URL.createObjectURL(await response.blob());
                setPreviewImage({ displayUrl, downloadUrl });
            } catch (error) {
                console.error('Image preview failed:', error);
                toast({ variant: 'destructive', title: 'No se pudo abrir la vista previa' });
            }
        } else {
            setPreviewImage({
                displayUrl: imgData.direct || imgData,
                downloadUrl: imgData.direct || imgData
            });
        }
    };

    // Auto-scroll chat to bottom smoothly on user comment addition
    const scrollToBottomSmooth = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    const renderCommentsWithDividers = () => {
        const rendered = [];
        let lastDateStr = null;

        displayComments.forEach((comment) => {
            if (!comment.createdAt) {
                rendered.push(renderComment(comment));
                return;
            }

            const dateObj = new Date(comment.createdAt);
            const dateStr = dateObj.toISOString().split('T')[0];

            if (dateStr !== lastDateStr) {
                rendered.push(<DateDivider key={`divider-${dateStr}`} date={comment.createdAt} />);
                lastDateStr = dateStr;
            }

            rendered.push(renderComment(comment));
        });

        return rendered;
    };

    const renderCommentAttachment = (attachment, commentId) => {
        const visualMeta = getFileVisualMeta({ name: attachment.name, mimeType: attachment.mimeType });
        const FileIcon = visualMeta.icon;
        const params = [];
        if (attachment.name) params.push(`filename=${encodeURIComponent(attachment.name)}`);
        const suffix = params.length > 0 ? `?${params.join('&')}` : '';
        const fileUrl = `${getApiBaseUrl()}/api/tasks/${formData.id}/comments/${commentId}/file${suffix}`;
        const downloadUrl = `${getApiBaseUrl()}/api/tasks/${formData.id}/comments/${commentId}/download${suffix}`;

        return (
            <div key={attachment.id || attachment.url} className="mt-2 flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                        <FileIcon size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate" title={attachment.name || 'Adjunto de chat'}>
                            {attachment.name || 'Adjunto de chat'}
                        </p>
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
                            {visualMeta.label}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {visualMeta.isImage && (
                        <button
                            type="button"
                            onClick={() => handleImagePreview({ proxy: fileUrl, commentId, name: attachment.name })}
                            className="p-2 bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-primary rounded-lg border border-zinc-200 dark:border-zinc-800 transition-colors"
                            title="Vista previa"
                        >
                            <Eye size={14} />
                            <span className="sr-only">Vista previa</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => handleDownloadImage(downloadUrl)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-lg shadow-sm transition-colors"
                        title="Descargar archivo"
                        aria-label="Descargar archivo"
                    >
                        <Download size={14} />
                    </button>
                </div>
            </div>
        );
    };

    const renderComment = (comment) => {
        const isSystem = comment.type === 'system_return' || comment.type === 'system_reintegrate';
        const contextData = { taskId: formData.id, commentId: comment.id };

        if (isSystem) {
            const isReturn = comment.type === 'system_return';
            const cleanContent = cleanSystemMessage(comment.content);

            return (
                <div key={comment.id} className={cn(
                    "p-3.5 rounded-2xl mb-3 border flex gap-3.5 items-start shadow-sm",
                    isReturn ? "bg-red-50/40 border-red-100 dark:bg-red-900/10 dark:border-red-900/20" : "bg-emerald-50/40 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/20"
                )}>
                    <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                        isReturn ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400"
                    )}>
                        {isReturn ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn("text-[10px] font-black uppercase tracking-wider", isReturn ? "text-red-600" : "text-emerald-600")}>
                                {isReturn ? "Evento: Devolución" : "Evento: Reintegración"}
                            </span>
                            <span className="text-[10px] text-zinc-400">•</span>
                            <span className="text-[10px] text-zinc-400 font-medium">{new Date(comment.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short'})}</span>
                        </div>
                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed italic">
                            "<RichCommentContent
                                content={cleanContent}
                                contextData={contextData}
                                onImageClick={handleImagePreview}
                            />"
                        </div>
                    </div>
                </div>
            );
        }

        const isAuthor = comment.authorId === currentUser?.id;
        const isEditingThis = editingCommentId === comment.id;

        return (
            <div key={comment.id} className="flex gap-4 mb-3 group relative">
                <TeamAvatar
                    member={{ name: comment.author?.name, avatarUrl: comment.author?.avatarUrl }}
                    size={36}
                    className="shrink-0 ring-2 ring-white dark:ring-zinc-900 shadow-md shadow-zinc-200/50 dark:shadow-none"
                />
                <div className="flex-1 min-w-0 relative">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-black text-zinc-900 dark:text-zinc-100">{comment.author?.name || "Usuario"}</span>
                        <span className="text-[11px] text-zinc-400 font-medium">
                            {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {comment.isEdited && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium ml-1.5 italic">(editado)</span>}
                        </span>
                    </div>

                    {isEditingThis ? (
                        <div className="w-full flex flex-col gap-2 mt-1 relative">
                            <RichTextEditor
                                value={editingContent}
                                onChange={setEditingContent}
                                onSend={() => handleUpdateComment(comment.id)}
                                onTextChange={setEditingCommentText}
                                teamMembers={teamMembers}
                                className="pr-12"
                            />
                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingCommentId(null);
                                        setShowEditToolbar(false);
                                        setEditingCommentText("");
                                    }}
                                    className="px-2.5 py-1 text-[10px] font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUpdateComment(comment.id)}
                                    disabled={!editingCommentText}
                                    className={cn(
                                        "px-2.5 py-1 text-[10px] font-bold rounded-lg shadow-md transition-all active:scale-95",
                                        editingCommentText ? "bg-primary text-white shadow-primary/10" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                                    )}
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="relative inline-block max-w-[80%] md:max-w-3xl mr-6 pr-6">
                            <div className="bg-white dark:bg-zinc-900 p-3.5 pr-10 rounded-2xl rounded-tl-none block shadow-sm border border-zinc-100 dark:border-zinc-800 relative group/card">
                                <div className="pb-1">
                                    <RichCommentContent
                                        content={comment.content}
                                        contextData={contextData}
                                        onImageClick={handleImagePreview}
                                    />
                                    {Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            {comment.attachments.map(attachment => renderCommentAttachment(attachment, comment.id))}
                                        </div>
                                    )}
                                </div>

                                {/* Basecamp Action Menu inside message card */}
                                {isEdition && (
                                    <div className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity z-50">
                                        <DropdownMenu
                                            open={commentPopover.commentId === comment.id}
                                            onOpenChange={(isOpen) => setCommentPopover(isOpen ? { commentId: comment.id, view: 'quick-actions' } : { commentId: null, view: null })}
                                        >
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-650 transition-all select-none focus:outline-none outline-none"
                                                    aria-label="Abrir acciones del comentario"
                                                >
                                                    <MoreHorizontal size={14} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                side="bottom"
                                                collisionPadding={16}
                                                className="z-[120] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-2.5 w-56 flex flex-col gap-2 focus:outline-none outline-none animate-in zoom-in-95 duration-100"
                                            >
                                                {commentPopover.view === 'all-emojis' ? (
                                                    <div className="flex flex-col gap-1.5 p-1 animate-in zoom-in-95 duration-100">
                                                        <div className="flex items-center justify-between px-1 mb-1">
                                                            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400">Reaccionar</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCommentPopover({ commentId: comment.id, view: 'quick-actions' });
                                                                }}
                                                                className="text-[8px] font-black uppercase tracking-wider text-primary hover:underline"
                                                            >
                                                                Atrás
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-5 gap-1 max-h-36 overflow-y-auto">
                                                            {APPROVED_EMOJIS.map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleToggleReaction(comment.id, emoji);
                                                                        setCommentPopover({ commentId: null, view: null });
                                                                    }}
                                                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-xl transition-all active:scale-90"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Reacciones Rápidas */}
                                                        <div className="flex items-center justify-between gap-1 px-1 py-0.5">
                                                            {['🧠', '🚀', '👍', '😄', '💯'].map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleToggleReaction(comment.id, emoji);
                                                                        setCommentPopover({ commentId: null, view: null });
                                                                    }}
                                                                    className="hover:scale-125 transition-transform p-0.5 text-xl active:scale-95 animate-in zoom-in-50 duration-75"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCommentPopover({ commentId: comment.id, view: 'all-emojis' });
                                                                }}
                                                                className="w-6 h-6 rounded-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 text-[10px] font-bold transition-all"
                                                            >
                                                                +
                                                            </button>
                                                        </div>

                                                        {/* Autor Acciones */}
                                                        {(isAuthor || currentUser?.role === 'ADMIN') && (
                                                            <>
                                                                <div className="h-px bg-zinc-150 dark:bg-zinc-800 my-0.5" />
                                                                <div className="flex flex-col gap-0.5">
                                                                    {isAuthor && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingCommentId(comment.id);
                                                                                setEditingContent(comment.content);
                                                                                setCommentPopover({ commentId: null, view: null });
                                                                            }}
                                                                            className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2"
                                                                        >
                                                                            Editar comentario
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            handleDeleteComment(comment.id);
                                                                            setCommentPopover({ commentId: null, view: null });
                                                                        }}
                                                                        className="w-full text-left px-2.5 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg text-xs font-bold text-red-600 flex items-center gap-2"
                                                                    >
                                                                        Eliminar comentario
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}

                                {/* Reactions Pills Inside Message Card Boundary */}
                                {comment.reactions && comment.reactions.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-3">
                                        {comment.reactions.map((reaction) => (
                                            <button
                                                key={reaction.emoji}
                                                type="button"
                                                onClick={() => handleToggleReaction(comment.id, reaction.emoji)}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-extrabold border transition-all active:scale-90",
                                                    reaction.userReacted
                                                        ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                                        : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-750"
                                                )}
                                            >
                                                <span className="text-xl leading-none select-none">{reaction.emoji}</span>
                                                <span className="text-[11px] font-black">{reaction.count}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const handleClosePanel = () => {
        setPreviewImage(null);
        setShowToolbar(false);
        setShowEditToolbar(false);
        setShowInputEmojiPicker(false);
        setCommentPopover({ commentId: null, view: null });
        onClose();
    };

    // Prepare comments list in ascending chronological order (oldest top, newest bottom)
    const displayComments = isEdition
        ? [...(formData.taskComments || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        : [...tempComments].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && (isEdition ? handleClosePanel() : handlePassiveClose())}>
            <DialogContent
                className="w-[92vw] max-w-6xl h-[85vh] max-h-[92dvh] p-0 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 flex flex-col rounded-2xl shadow-2xl z-[100] overflow-hidden"
                onPointerDownOutside={(e) => {
                    const target = e.target;
                    const isToolbar = target && (target.closest('[data-task-format-toolbar]') || target.hasAttribute('data-task-format-toolbar'));
                    if (previewImage || isToolbar) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    const target = e.target;
                    const isToolbar = target && (target.closest('[data-task-format-toolbar]') || target.hasAttribute('data-task-format-toolbar'));
                    if (previewImage || isToolbar) {
                        e.preventDefault();
                    }
                }}
                onEscapeKeyDown={(e) => {
                    if (previewImage) {
                        e.preventDefault();
                    }
                }}
            >

                {/* Header Section */}
                <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-primary">
                            {isEdition ? <ClipboardList size={20} /> : <Plus size={20} />}
                        </div>
                        <div>
                            <DialogTitle className={cn(
                                "text-zinc-900 dark:text-white",
                                "text-base font-semibold"
                            )}>
                                {isEdition ? `Tarea #${formData.id?.split('-')[0] || ''}` : "Nueva tarea"}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-zinc-500 font-medium mt-0.5">
                                {isEdition ? `ID: ${formData.id?.split('-')[0]} • Gestiona los metadatos y la conversación en tiempo real` : "Crea un nuevo pendiente operativo en el tablero Kanban"}
                            </DialogDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-3.5">
                        {!isEdition && hasStoredMeaningfulDraft() && (
                            <div
                                data-task-draft-status-pill
                                className="flex items-center gap-2 rounded-full border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-900/15 px-3 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 shadow-sm"
                            >
                                <span>Borrador creado</span>
                                <span className="text-amber-400 dark:text-amber-500">|</span>
                                <button
                                    type="button"
                                    onClick={handleCleanDraftOnly}
                                    className="text-[10px] font-semibold text-amber-800 dark:text-amber-200 hover:underline"
                                >
                                    Limpiar
                                </button>
                            </div>
                        )}

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
                            type="button"
                            onClick={handleToggleSpecial}
                            aria-pressed={formData.isSpecial}
                            className={cn(
                                "flex items-center justify-center p-1.5 rounded-lg transition-all border shadow-sm",
                                formData.isSpecial
                                    ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-300"
                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-purple-500"
                            )}
                            title={formData.isSpecial ? "Quitar especial" : "Marcar como especial"}
                        >
                            <Star size={14} fill={formData.isSpecial ? "currentColor" : "none"} />
                        </button>

                        <button
                            onClick={handleToggleFollow}
                            disabled={isTogglingFollow}
                            className={cn(
                                "flex items-center justify-center p-1.5 rounded-lg transition-all border shadow-sm",
                                isFollowing
                                    ? "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-300"
                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-sky-500"
                            )}
                            title={isFollowing ? "Dejar de seguir" : "Seguir tarea"}
                        >
                            <Bell size={14} className={cn(isFollowing && "fill-current animate-in zoom-in-50")} />
                        </button>

                        {isEdition && (
                            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-inner">
                                <UserAvatarPopover user={formData.creator}>
                                    <TeamAvatar
                                        member={formData.creator}
                                        size={18}
                                        className="ring-1 ring-white dark:ring-zinc-800"
                                    />
                                </UserAvatarPopover>
                                <span className="text-[10px] text-zinc-400 font-medium">De:</span>
                                <span className="text-[10px] text-zinc-900 dark:text-zinc-100 font-semibold truncate max-w-[120px]">{formData.creator?.name || formData.creatorName}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Single Column Layout (Basecamp Style) */}
                <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-zinc-50 dark:bg-zinc-950 flex flex-col"
                >

                    {/* Metadata Grid Area - Full Width compact top section */}
                    {/* TaskComposerUnifiedV2 */}
                    {/* TaskCreateComposerV2 */}
                    <div className="w-full flex flex-col gap-5 border-b border-zinc-200/70 dark:border-zinc-800/70 pb-6">

                        {showReintegratePrompt && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl shadow-xl"
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

                        {/* Title Section */}
                        <div className="space-y-2">
                            <label className={taskComposerLabelClass}>
                                {isEdition ? "Título de la tarea" : "Nombre de la tarea"}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.title || ''}
                                onChange={e => setFormData({...formData, title: e.target.value})}
                                placeholder={isEdition ? "Ej: Revisión de artes para campaña..." : "Escribe el nombre de la tarea"}
                                className="w-full bg-transparent border-0 border-b border-zinc-200/80 dark:border-zinc-800/80 rounded-none px-0 py-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:ring-0 focus:border-primary/50 outline-none transition-colors"
                            />
                        </div>

                        {/* Metadata Grid */}
                        <div className={taskOperationalGridClass}>

                            {/* Cliente Selector */}
                            <div className="col-span-3 space-y-1">
                                <label className={taskComposerLabelClass}>Cliente</label>
                                <select
                                    required
                                    value={formData.clientId}
                                    onChange={e => setFormData({...formData, clientId: e.target.value})}
                                    disabled={isEdition || !!defaultClientId}
                                    className={`${taskComposerFieldClass} h-[38px] cursor-pointer disabled:opacity-80`}
                                >
                                    <option value="">Seleccionar cliente...</option>
                                    {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* Responsable */}
                            <div className="col-span-3 space-y-1">
                                <label className={taskComposerLabelClass}>Responsable</label>
                                <select
                                    value={formData.assigneeId || ''}
                                    onChange={e => setFormData({...formData, assigneeId: e.target.value})}
                                    className={`${taskComposerFieldClass} h-[38px] cursor-pointer`}
                                >
                                    <option value="">Sin asignar</option>
                                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            {/* Deadline / Fecha Entrega */}
                            <div className="col-span-2 space-y-1">
                                <label className={taskComposerLabelClass}>Deadline</label>
                                <div className="relative w-full">
                                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none z-10" />
                                    <DatePicker
                                        selected={formData.dueDate ? new Date(`${formData.dueDate.split('T')[0]}T12:00:00.000Z`) : null}
                                        onChange={(date) => {
                                            const dateStr = date ? date.toISOString().split('T')[0] : '';
                                            setFormData({...formData, dueDate: dateStr});
                                        }}
                                        dateFormat="dd/MM/yyyy"
                                        className={`${taskComposerFieldClass} h-[38px] pl-10 cursor-pointer`}
                                        wrapperClassName="w-full"
                                        {...brainDatePickerProps}
                                        placeholderText="Elegir fecha..."
                                        isClearable
                                    />
                                </div>
                            </div>

                            {/* Estado Actual */}
                            <div className="col-span-2 space-y-1">
                                <label className={taskComposerLabelClass}>Estado actual</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({...formData, status: e.target.value})}
                                    className={`${taskComposerFieldClass} h-[38px] cursor-pointer`}
                                >
                                    <option value="PENDIENTE">PENDIENTE</option>
                                    <option value="EN_CURSO">EN PROCESO</option>
                                    <option value="REALIZADA">REALIZADO</option>
                                    <option value="DEVUELTA">DEVUELTO</option>
                                </select>
                            </div>

                            {/* Prioridad */}
                            <div className="col-span-2 space-y-1">
                                <label className={taskComposerLabelClass}>Prioridad</label>
                                <div className={cn(
                                    "relative rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 bg-transparent transition-colors",
                                    formData.isPriority && "border-red-500/30 bg-red-500/5"
                                )}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPriorityPopover(prev => !prev);
                                        }}
                                        aria-expanded={showPriorityPopover}
                                        className={cn(
                                            "flex h-[38px] w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                                            formData.isPriority
                                                ? "text-red-600 font-semibold"
                                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                                        )}
                                    >
                                        <Zap size={12} fill={formData.isPriority ? "currentColor" : "none"} />
                                        <span className="text-sm font-medium">Prioridad</span>
                                    </button>

                                    <AnimatePresence>
                                        {showPriorityPopover && (
                                            <motion.div
                                                data-task-priority-popover
                                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                transition={{ duration: 0.14 }}
                                                className="absolute left-0 right-0 top-[calc(100%+6px)] z-[125] grid grid-cols-3 gap-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 p-1.5 shadow-xl shadow-zinc-950/10 backdrop-blur"
                                                role="radiogroup"
                                                aria-label="Nivel de prioridad"
                                            >
                                                {taskPriorityOptions.map((option) => {
                                                    const selected = formData.isPriority && (formData.priority || 'NORMAL') === option.value;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={selected}
                                                            onClick={() => {
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    priority: option.value,
                                                                    isPriority: true
                                                                }));
                                                                setShowPriorityPopover(false);
                                                            }}
                                                            className={cn(
                                                                "inline-flex h-[30px] min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-all",
                                                                selected ? option.className : "border-zinc-200/70 dark:border-zinc-800/70 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/70"
                                                            )}
                                                        >
                                                            <Zap size={11} fill={selected ? "currentColor" : "none"} />
                                                            {option.label}
                                                        </button>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>

                        {/* Attachments Section (Interactive Insumos & Referencias) */}
                        {isEdition ? (
                            <div className={taskComposerSectionClass}>
                                <div className="flex items-center justify-between">
                                    <label className={`${taskComposerLabelClass} block`}>
                                        Insumos & referencias vinculadas
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-4">

                                    {/* Referencias en Edición */}
                                    <div className="space-y-2">
                                        <span className={taskComposerLabelClass}>Referencias</span>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                placeholder="https://..."
                                                value={editRefUrl}
                                                onChange={e => setEditRefUrl(e.target.value)}
                                                className={`${taskComposerFieldClass} flex-1 h-[38px]`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleCreateAttachment(editRefUrl, editRefUrl, 'REFERENCIA');
                                                    setEditRefUrl("");
                                                }}
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        {(() => {
                                            const refUrls = [];
                                            if (formData.referenceUrl) refUrls.push({ id: 'ref-legacy', url: formData.referenceUrl, name: 'Referencia Original' });
                                            if (Array.isArray(formData.referenceLinks)) {
                                                formData.referenceLinks.forEach((u, i) => refUrls.push({ id: `ref-link-${i}`, url: u, name: `Enlace de Parrilla ${i+1}` }));
                                            }
                                            getManualTaskAttachments(formData.taskAttachments)
                                                    .filter(a => a.category === 'REFERENCIA')
                                                    .forEach(a => refUrls.push({ id: a.id, url: a.url, name: a.name }));

                                            if (refUrls.length === 0) {
                                                return null;
                                            }

                                            return (
                                                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                    {refUrls.map((item) => (
                                                        <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-transparent border border-zinc-200/70 dark:border-zinc-800/70 rounded-lg text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                                                            <button type="button" onClick={() => handleTaskAttachmentOpen(item)} className="min-w-0 truncate hover:underline text-indigo-600 flex items-center gap-1 text-left">
                                                                <ExternalLink size={10} /> {item.name}
                                                            </button>
                                                            {item.id !== 'ref-legacy' && !item.id.startsWith('ref-link-') && (
                                                            <button onClick={() => handleDeleteAttachment(item.id)} className="text-zinc-400 hover:text-red-500" aria-label="Eliminar adjunto">
                                                                    <X size={10} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Insumos en Edición */}
                                    <div className="space-y-2">
                                        <span className={taskComposerLabelClass}>Insumos</span>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                placeholder="https://..."
                                                value={editInpUrl}
                                                onChange={e => setEditInpUrl(e.target.value)}
                                                className={`${taskComposerFieldClass} flex-1 h-[38px]`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleCreateAttachment(editInpUrl, editInpUrl, 'INSUMO');
                                                    setEditInpUrl("");
                                                }}
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        {(() => {
                                            const inpUrls = [];
                                            if (Array.isArray(formData.assetsLinks)) {
                                                formData.assetsLinks.forEach((u, i) => inpUrls.push({ id: `inp-link-${i}`, url: u, name: `Insumo de Parrilla ${i+1}` }));
                                            }
                                            getManualTaskAttachments(formData.taskAttachments)
                                                    .filter(a => a.category === 'INSUMO')
                                                    .forEach(a => inpUrls.push({ id: a.id, url: a.url, name: a.name }));

                                            if (inpUrls.length === 0) {
                                                return null;
                                            }

                                            return (
                                                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                    {inpUrls.map((item) => (
                                                        <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-transparent border border-zinc-200/70 dark:border-zinc-800/70 rounded-lg text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                                                            <button type="button" onClick={() => handleTaskAttachmentOpen(item)} className="min-w-0 truncate hover:underline text-indigo-600 flex items-center gap-1 text-left">
                                                                <ExternalLink size={10} /> {item.name}
                                                            </button>
                                                            {!item.id.startsWith('inp-link-') && (
                                                            <button onClick={() => handleDeleteAttachment(item.id)} className="text-zinc-400 hover:text-red-500" aria-label="Eliminar adjunto">
                                                                    <X size={10} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                </div>
                            </div>
                        ) : (
                            <div className={taskCreateSectionClass}>

                                {/* Sección de Referencias */}
                                <div className="space-y-2">
                                    <label className={`${taskCreateLabelClass} block`}>
                                        Referencias iniciales
                                    </label>
                                    <div className="grid grid-cols-2 gap-3 items-center">
                                        <input
                                            type="text"
                                            placeholder="Nombre de la referencia (ej: Figma...)"
                                            value={newRefName}
                                            onChange={e => setNewRefName(e.target.value)}
                                            className={taskCreateFieldClass}
                                        />
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="URL (https://...)"
                                                value={newRefUrl}
                                                onChange={e => setNewRefUrl(e.target.value)}
                                                className={`${taskCreateFieldClass} flex-1`}
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
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-all shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                                title="Agregar Referencia"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {tempReferences.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {tempReferences.map((ref, index) => (
                                                <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-zinc-200/70 dark:border-zinc-800/70 rounded-lg text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
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
                                <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/40">
                                    <label className={`${taskCreateLabelClass} block`}>
                                        Insumos iniciales
                                    </label>
                                    <div className="grid grid-cols-2 gap-3 items-center">
                                        <input
                                            type="text"
                                            placeholder="Nombre del insumo (ej: Assets...)"
                                            value={newInpName}
                                            onChange={e => setNewInpName(e.target.value)}
                                            className={taskCreateFieldClass}
                                        />
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="URL (https://...)"
                                                value={newInpUrl}
                                                onChange={e => setNewInpUrl(e.target.value)}
                                                className={`${taskCreateFieldClass} flex-1`}
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
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-all shrink-0 flex items-center justify-center h-[38px] w-[38px]"
                                                title="Agregar Insumo"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {tempInputs.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {tempInputs.map((inp, index) => (
                                                <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-zinc-200/70 dark:border-zinc-800/70 rounded-lg text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
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

                        {/* Footer Creation Actions */}
                        {!isEdition && (
                            <div className="mt-auto pt-6 border-t border-zinc-200/70 dark:border-zinc-800/70 flex gap-3">
                                <button
                                    onClick={clearDraft}
                                    type="button"
                                    className="flex-1 px-4 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                                >
                                    Descartar borrador
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSubmitting}
                                    className="flex-[2] bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-xs font-semibold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Crear tarea
                                </button>
                            </div>
                        )}

                        {isEdition && (
                            <div className="mt-auto pt-6 border-t border-zinc-200/70 dark:border-zinc-800/70 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleClosePanel}
                                    className="px-6 py-2.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSave()}
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Guardar cambios
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Bottom Section: Full Width Chronological Chat */}
                    <div className="w-full flex flex-col bg-zinc-50/50 dark:bg-zinc-950/20">

                        {/* Chat Container */}
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => {
                                setIsDragging(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                handleDroppedChatFiles(e.dataTransfer.files);
                            }}
                            className="w-full p-6 md:p-8 relative"
                        >
                            {/* Drag & Drop Overlay */}
                            <AnimatePresence>
                                {isDragging && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-6 transition-all"
                                    >
                                        <div className="w-full h-full border-2 border-dashed border-primary/40 rounded-3xl flex flex-col items-center justify-center gap-3 animate-in zoom-in-95">
                                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                                <Paperclip size={24} />
                                            </div>
                                            <p className={cn(isEdition ? "text-xs font-black uppercase tracking-widest text-primary" : "text-xs font-medium text-primary")}>Suelta tus archivos aqui</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex items-center gap-4 mb-5">
                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                                <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full shadow-sm">
                                    <MessageSquare size={11} className="text-zinc-400" />
                                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Conversación & eventos</span>
                                </div>
                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                            </div>

                            <div className="space-y-4 pb-4">
                                {isLoadingComments ? (
                                    <div className="space-y-4">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="flex gap-4 mb-3 animate-pulse">
                                                <div className="w-9 h-9 bg-zinc-200 dark:bg-zinc-800 rounded-full shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
                                                        <div className="h-2 w-10 bg-zinc-200 dark:bg-zinc-800 rounded" />
                                                    </div>
                                                    <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl rounded-tl-none inline-block w-2/3 border border-zinc-100 dark:border-zinc-800">
                                                        <div className="space-y-2">
                                                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6" />
                                                            <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : displayComments.length === 0 ? (
                                    <div className="py-16 flex flex-col items-center justify-center text-center px-6">
                                        <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center mb-3 text-zinc-300 dark:text-zinc-700 border border-zinc-200/50 dark:border-zinc-800 shadow-sm">
                                            <MessageSquare size={22} />
                                        </div>
                                        <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Aún no hay comentarios</h4>
                                        <p className="text-[10px] text-zinc-400 font-medium max-w-[200px] mt-1">Escribe o suelta un archivo abajo para iniciar la conversacion</p>
                                    </div>
                                ) : (
                                    renderCommentsWithDividers()
                                )}
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="shrink-0 bg-transparent">
                            <div className="flex flex-col gap-2">
                                {selectedFile && isEdition && (
                                    (() => {
                                        const visualMeta = getFileVisualMeta(selectedFile);
                                        const FileIcon = visualMeta.icon;
                                        return (
                                            <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in slide-in-from-bottom-1">
                                                <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-primary">
                                                    <FileIcon size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-bold text-primary truncate">{selectedFile.name}</p>
                                                    <p className="text-[8px] text-primary/60">{visualMeta.label} - {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                                {visualMeta.isImage && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const localUrl = URL.createObjectURL(selectedFile);
                                                            setPreviewImage({ displayUrl: localUrl, downloadUrl: localUrl });
                                                        }}
                                                        className="p-1 hover:bg-primary/10 rounded text-primary"
                                                        title="Vista previa"
                                                    >
                                                        <Eye size={14} />
                                                        <span className="sr-only">Vista previa</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedFile(null)}
                                                    className="p-1 hover:bg-primary/10 rounded text-primary"
                                                    aria-label="Quitar archivo seleccionado"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        );
                                    })()
                                )}

                                {/* Temp attachments for creation mode */}
                                {!isEdition && tempAttachments.length > 0 && (
                                    <div className="flex flex-col gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-[120px] overflow-y-auto">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-450 px-1">Adjuntos en borrador</span>
                                        {tempAttachments.map((file, i) => (
                                            (() => {
                                                const visualMeta = getFileVisualMeta(file);
                                                const FileIcon = visualMeta.icon;
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 p-1.5 bg-primary/5 border border-primary/10 rounded-lg">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center text-primary shrink-0">
                                                                <FileIcon size={12} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate">{file.name}</p>
                                                                <p className="text-[8px] text-zinc-400 uppercase tracking-wider">{visualMeta.label}</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setTempAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/10 rounded text-red-500 shrink-0"
                                                            aria-label="Quitar adjunto del borrador"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })()
                                        ))}
                                    </div>
                                )}

                                <div className="relative group">
                                    <RichTextEditor
                                        ref={mainEditorRef}
                                        value={newComment}
                                        onChange={setNewComment}
                                        onSend={handleAddComment}
                                        onTextChange={setNewCommentText}
                                        placeholder={isEdition ? "Escribe un mensaje al equipo..." : "Escribe un mensaje inicial..."}
                                        showToolbar={showToolbar}
                                        onToggleToolbar={setShowToolbar}
                                        teamMembers={teamMembers}
                                        className="pl-4 pr-44"
                                        attachmentAction={
                                                <div className="w-9 h-9 flex items-center justify-center">
                                                    <input
                                                        type="file"
                                                        id="task-file-upload-focus"
                                                        className="hidden"
                                                        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files[0];
                                                            if (!file) return;
                                                            handleChatFileSelected(file);
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <label
                                                        htmlFor="task-file-upload-focus"
                                                        className={cn(
                                                            "w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 transition-all hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-primary cursor-pointer select-none"
                                                        )}
                                                        title="Adjuntar archivo"
                                                    >
                                                        {isUploadingTemp ? (
                                                            <Loader2 size={16} className="animate-spin text-primary" />
                                                        ) : (
                                                            <Paperclip size={16} />
                                                        )}
                                                    </label>
                                                </div>
                                        }
                                        emojiAction={
                                                <button
                                                    type="button"
                                                    onClick={() => setShowInputEmojiPicker(!showInputEmojiPicker)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-455 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-primary transition-all select-none"
                                                    title="Insertar emoji"
                                                >
                                                    😀
                                                </button>
                                        }
                                        sendAction={
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddComment()}
                                                    disabled={isEdition ? ((!newCommentText && !selectedFile) || isSendingComment) : !newCommentText}
                                                    aria-label="Enviar comentario"
                                                    className={cn(
                                                        "w-9 h-9 flex items-center justify-center rounded-lg transition-all",
                                                        (newCommentText || (selectedFile && isEdition)) ? "bg-primary text-white shadow-md shadow-primary/10 active:scale-90" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                                                    )}
                                                >
                                                    {isSendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                                </button>
                                        }
                                    />
                                    {showInputEmojiPicker && (
                                        <div className="absolute bottom-[105%] right-4 z-[90] w-[298px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-2 animate-in slide-in-from-bottom-2 duration-150">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-2 px-1">
                                                Emojis aprobados
                                            </div>
                                            <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto pr-1">
                                                {APPROVED_EMOJIS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={() => {
                                                            mainEditorRef.current?.insertEmoji(emoji);
                                                            setShowInputEmojiPicker(false);
                                                        }}
                                                        className="w-9 h-9 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-xl transition-all active:scale-90"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>

                </div>

            </DialogContent>

            {/* Media Viewer Lightbox wrapped in an inner controlled Radix Dialog overlay */}
            <MediaPreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                previewImage={previewImage}
                handleDownloadImage={handleDownloadImage}
            />
        </Dialog>
    );
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Algo salió mal al cargar el panel de tareas</h3>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80">{this.state.error?.message}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="mt-2 self-start px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold transition-all"
                    >
                        Reintentar
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const TaskSidePanelWithErrorBoundary = (props) => (
    <ErrorBoundary>
        <TaskSidePanel {...props} />
    </ErrorBoundary>
);

export default TaskSidePanelWithErrorBoundary;
