
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useToast } from '@/components/ui/use-toast';
import TeamAvatar from '@/components/ui/TeamAvatar';
import AvatarUploader from './Radar/AvatarUploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import { User, Key, StickyNote, ClipboardList, TrendingUp, Loader2, Save, Plus, Trash2, Edit2, X, Check, Calendar, Target, Award, Info, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const Card = ({ children, className }) => (
    <div className={cn("bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden", className)}>
        {children}
    </div>
);

const CardHeader = ({ children, className }) => (
    <div className={cn("px-6 py-4 border-b border-zinc-100 dark:border-zinc-800", className)}>
        {children}
    </div>
);

const CardTitle = ({ children, className }) => (
    <h3 className={cn("text-lg font-bold text-zinc-900 dark:text-zinc-100", className)}>
        {children}
    </h3>
);

const CardDescription = ({ children, className }) => (
    <p className={cn("text-sm text-zinc-500 dark:text-zinc-400", className)}>
        {children}
    </p>
);

const CardContent = ({ children, className }) => (
    <div className={cn("p-6", className)}>
        {children}
    </div>
);

const Profile = () => {
    const { currentUser } = useAuth();
    const { userId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [profileData, setProfileData] = useState({ id: '', name: '', bio: '', email: '', role: '', avatarUrl: '' });
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [notes, setNotes] = useState([]);
    const [isNotesLoading, setIsNotesLoading] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const [isCreatingNote, setIsCreatingNote] = useState(false);
    const [newNote, setNewNote] = useState({ title: '', content: '' });

    // Performance / Feedback state
    const [feedback, setFeedback] = useState([]);
    const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
    const [isCreatingFeedback, setIsCreatingFeedback] = useState(false);
    const [newFeedback, setNewFeedback] = useState({
        type: 'ESCRITO',
        date: new Date().toISOString().split('T')[0],
        strengths: '',
        improvementAreas: '',
        actionItems: '',
        privateNote: ''
    });

    const isOwnProfile = !userId || userId === currentUser?.id;
    const isAdmin = currentUser?.role === 'ADMIN';

    // Fetch initial data
    useEffect(() => {
        fetchProfile();
        if (isOwnProfile) {
            fetchNotes();
        }
        fetchFeedback();
    }, [userId]);

    const fetchProfile = async () => {
        try {
            const endpoint = userId ? `/api/user/profile/${userId}` : `/api/user/profile`;
            const res = await fetch(`${getApiBaseUrl()}${endpoint}`);
            if (res.ok) {
                const data = await res.json();
                setProfileData({
                    id: data.id || '',
                    name: data.name || '',
                    bio: data.bio || '',
                    email: data.email || '',
                    role: data.role || 'EDITOR',
                    avatarUrl: data.avatarUrl || ''
                });
            } else if (res.status === 403) {
                toast({ title: "Acceso denegado", description: "No tienes permiso para ver este perfil.", variant: "destructive" });
                navigate('/perfil');
            }
        } catch (err) {
            console.error("Error fetching profile:", err);
        }
    };

    const fetchFeedback = async () => {
        setIsFeedbackLoading(true);
        try {
            const targetId = userId || currentUser?.id;
            const res = await fetch(`${getApiBaseUrl()}/api/feedback/${targetId}`);
            if (res.ok) {
                const data = await res.json();
                setFeedback(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Error fetching feedback:", err);
        } finally {
            setIsFeedbackLoading(false);
        }
    };

    const handleCreateFeedback = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newFeedback,
                    collaboratorId: profileData.id
                })
            });
            if (res.ok) {
                toast({ title: "Feedback registrado", description: "El registro ha sido guardado exitosamente." });
                setIsCreatingFeedback(false);
                setNewFeedback({
                    type: 'ESCRITO',
                    date: new Date().toISOString().split('T')[0],
                    strengths: '',
                    improvementAreas: '',
                    actionItems: '',
                    privateNote: ''
                });
                fetchFeedback();
            } else {
                const err = await res.json();
                throw new Error(err.error || "Error al registrar feedback");
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteFeedback = async (id) => {
        if (!confirm("¿Estás seguro de que quieres eliminar este registro de feedback?")) return;
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/feedback/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast({ title: "Registro eliminado" });
                fetchFeedback();
            }
        } catch (err) {
            toast({ title: "Error", description: "No se pudo eliminar el registro", variant: "destructive" });
        }
    };

    const fetchNotes = async () => {
        setIsNotesLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Error fetching notes:", err);
        } finally {
            setIsNotesLoading(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: profileData.name, bio: profileData.bio })
            });
            if (res.ok) {
                toast({ title: "Perfil actualizado", description: "Tus datos se han guardado correctamente." });
            } else {
                throw new Error("Error al actualizar");
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passwordData.currentPassword,
                    newPassword: passwordData.newPassword
                })
            });
            if (res.ok) {
                toast({ title: "Contraseña actualizada", description: "Tu contraseña ha sido cambiada." });
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                const errData = await res.json();
                throw new Error(errData.error || "Error al actualizar contraseña");
            }
        } catch (err) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNote = async (e) => {
        e.preventDefault();
        if (!newNote.title || !newNote.content) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newNote)
            });
            if (res.ok) {
                toast({ title: "Nota creada", description: "Tu nota personal ha sido guardada." });
                setNewNote({ title: '', content: '' });
                setIsCreatingNote(false);
                fetchNotes();
            }
        } catch (err) {
            toast({ title: "Error", description: "No se pudo crear la nota", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateNote = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/notes/${editingNote.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editingNote.title, content: editingNote.content })
            });
            if (res.ok) {
                toast({ title: "Nota actualizada" });
                setEditingNote(null);
                fetchNotes();
            }
        } catch (err) {
            toast({ title: "Error", description: "No se pudo actualizar la nota", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteNote = async (id) => {
        if (!confirm("¿Estás seguro de que quieres eliminar esta nota?")) return;
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/user/notes/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast({ title: "Nota eliminada" });
                fetchNotes();
            }
        } catch (err) {
            toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-6">
                    <div className="relative group">
                        <TeamAvatar
                            member={{ name: profileData.name || 'Usuario', avatarUrl: profileData.avatarUrl }}
                            className="w-24 h-24 text-3xl shadow-xl ring-4 ring-white dark:ring-zinc-900"
                            size={96}
                        />
                        {isOwnProfile && (
                            <button
                                onClick={() => setIsAvatarModalOpen(true)}
                                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer border-none"
                            >
                                <Camera className="w-6 h-6 text-white" />
                            </button>
                        )}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {isOwnProfile ? 'Mi Espacio' : `Perfil de ${profileData.name.split(' ')[0]}`}
                        </h1>
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                            {isOwnProfile
                                ? 'Gestiona tu perfil personal, notas y desempeño laboral.'
                                : `Gestión de talento y seguimiento de desempeño para ${profileData.name}.`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                    </div>
                </div>
            </div>

            <Tabs defaultValue={isOwnProfile ? "general" : "performance"} className="w-full">
                <TabsList className={cn(
                    "grid w-full h-auto p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-8",
                    isOwnProfile ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"
                )}>
                    <TabsTrigger value="general" className="rounded-xl py-3 flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-md transition-all">
                        <User className="w-4 h-4" /> {isOwnProfile ? 'General' : 'Info Pública'}
                    </TabsTrigger>
                    {isOwnProfile && (
                        <TabsTrigger value="notes" className="rounded-xl py-3 flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-md transition-all">
                            <StickyNote className="w-4 h-4" /> Mis Notas
                        </TabsTrigger>
                    )}
                    {isOwnProfile && (
                        <TabsTrigger value="hr" className="rounded-xl py-3 flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-md transition-all">
                            <ClipboardList className="w-4 h-4" /> Solicitudes
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="performance" className="rounded-xl py-3 flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:shadow-md transition-all">
                        <TrendingUp className="w-4 h-4" /> {isOwnProfile ? 'Mi Desempeño' : 'Desempeño'}
                    </TabsTrigger>
                </TabsList>

                {/* --- TAB: GENERAL --- */}
                <TabsContent value="general" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Profile Info Form */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl overflow-hidden">
                                <CardHeader className="bg-zinc-50/50 dark:bg-zinc-800/20 border-b border-zinc-100 dark:border-zinc-800">
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <User className="w-5 h-5 text-primary" /> Información de Perfil
                                    </CardTitle>
                                    <CardDescription>Actualiza tu información pública y biografía.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Nombre Completo</label>
                                                <input
                                                    type="text"
                                                    disabled={!isOwnProfile}
                                                    value={profileData.name}
                                                    onChange={e => setProfileData({...profileData, name: e.target.value})}
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Email Corporativo</label>
                                                <input
                                                    type="email"
                                                    value={profileData.email}
                                                    disabled
                                                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-400 cursor-not-allowed"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Biografía / Acerca de mí</label>
                                            <textarea
                                                rows={4}
                                                disabled={!isOwnProfile}
                                                value={profileData.bio}
                                                onChange={e => setProfileData({...profileData, bio: e.target.value})}
                                                placeholder={isOwnProfile ? "Cuéntanos un poco sobre ti, tu rol o tus intereses..." : "Este usuario no ha escrito una biografía todavía."}
                                                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white resize-none disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                                            />
                                        </div>
                                        {isOwnProfile && (
                                            <div className="flex justify-end pt-4">
                                                <button
                                                    type="submit"
                                                    disabled={isLoading}
                                                    className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    Guardar Cambios
                                                </button>
                                            </div>
                                        )}
                                    </form>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Password Form (Only for own profile) */}
                        <div className="space-y-6">
                            {isOwnProfile ? (
                                <Card className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl overflow-hidden">
                                    <CardHeader className="bg-zinc-50/50 dark:bg-zinc-800/20 border-b border-zinc-100 dark:border-zinc-800">
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <Key className="w-5 h-5 text-amber-500" /> Seguridad
                                        </CardTitle>
                                        <CardDescription>Cambia tu contraseña de acceso.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8">
                                        <form onSubmit={handleUpdatePassword} className="space-y-5">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Contraseña Actual</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={passwordData.currentPassword}
                                                    onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})}
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Nueva Contraseña</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={passwordData.newPassword}
                                                    onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Confirmar Nueva Contraseña</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={passwordData.confirmPassword}
                                                    onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isLoading}
                                                className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 mt-2"
                                            >
                                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Actualizar Contraseña'}
                                            </button>
                                        </form>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="bg-primary/5 border-primary/20 rounded-2xl p-8 text-center">
                                    <Info className="w-10 h-10 text-primary mx-auto mb-4 opacity-50" />
                                    <h4 className="font-bold text-zinc-900 dark:text-white mb-2">Modo Administrador</h4>
                                    <p className="text-sm text-zinc-500">Estás viendo el perfil de un colaborador. Puedes gestionar su desempeño en la pestaña correspondiente.</p>
                                </Card>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* --- TAB: NOTES --- */}
                <TabsContent value="notes" className="space-y-6 outline-none">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Mis Notas</h2>
                            <p className="text-sm text-zinc-500">Tus pensamientos e ideas privadas.</p>
                        </div>
                        <button
                            onClick={() => setIsCreatingNote(true)}
                            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Nota
                        </button>
                    </div>

                    {isNotesLoading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <AnimatePresence>
                                {/* Create Form Card */}
                                {isCreatingNote && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                    >
                                        <Card className="border-2 border-dashed border-primary/30 bg-primary/5 dark:bg-primary/10 rounded-2xl overflow-hidden h-full">
                                            <CardContent className="p-6 space-y-4">
                                                <input
                                                    placeholder="Título de la nota..."
                                                    autoFocus
                                                    value={newNote.title}
                                                    onChange={e => setNewNote({...newNote, title: e.target.value})}
                                                    className="w-full bg-transparent border-none text-lg font-bold focus:ring-0 placeholder:text-primary/40 dark:text-white"
                                                />
                                                <textarea
                                                    placeholder="Escribe algo increíble..."
                                                    rows={5}
                                                    value={newNote.content}
                                                    onChange={e => setNewNote({...newNote, content: e.target.value})}
                                                    className="w-full bg-transparent border-none text-sm resize-none focus:ring-0 placeholder:text-primary/40 dark:text-white"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setIsCreatingNote(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"><X className="w-4 h-4 text-zinc-500" /></button>
                                                    <button onClick={handleCreateNote} className="bg-primary text-white p-2 rounded-lg shadow-md"><Check className="w-4 h-4" /></button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )}

                                {notes.map(note => (
                                    <motion.div
                                        key={note.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all rounded-2xl h-full flex flex-col group overflow-hidden">
                                            {editingNote?.id === note.id ? (
                                                <div className="p-6 space-y-4 h-full flex flex-col">
                                                     <input
                                                        value={editingNote.title}
                                                        onChange={e => setEditingNote({...editingNote, title: e.target.value})}
                                                        className="w-full bg-transparent border-none text-lg font-bold focus:ring-0 dark:text-white"
                                                    />
                                                    <textarea
                                                        rows={5}
                                                        value={editingNote.content}
                                                        onChange={e => setEditingNote({...editingNote, content: e.target.value})}
                                                        className="w-full bg-transparent border-none text-sm resize-none focus:ring-0 dark:text-white flex-1"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => setEditingNote(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"><X className="w-4 h-4" /></button>
                                                        <button onClick={handleUpdateNote} className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-2 rounded-lg"><Check className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <CardHeader className="pb-3">
                                                        <div className="flex justify-between items-start">
                                                            <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{note.title}</CardTitle>
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => setEditingNote(note)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-primary transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                                                <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        </div>
                                                        <CardDescription className="text-xs">{new Date(note.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</CardDescription>
                                                    </CardHeader>
                                                    <CardContent className="flex-1">
                                                        <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-6 whitespace-pre-wrap">{note.content}</p>
                                                    </CardContent>
                                                </>
                                            )}
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {notes.length === 0 && !isCreatingNote && (
                                <div className="col-span-full h-64 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/20">
                                    <StickyNote className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="font-medium">No tienes notas personales aún.</p>
                                    <button onClick={() => setIsCreatingNote(true)} className="mt-2 text-primary font-bold text-sm hover:underline">Crear mi primera nota</button>
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>

                {/* --- TAB: PLACEHOLDERS --- */}
                <TabsContent value="hr" className="outline-none">
                    <Card className="h-96 border-dashed bg-transparent rounded-2xl flex flex-col items-center justify-center text-zinc-400 p-12 text-center">
                        <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-6">
                            <ClipboardList className="w-10 h-10 opacity-30" />
                        </div>
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Próximamente: Gestión de Permisos</h3>
                        <p className="max-w-sm">Aquí podrás gestionar solicitudes de vacaciones, permisos médicos y otros trámites de Recursos Humanos.</p>
                    </Card>
                </TabsContent>

                <TabsContent value="performance" className="space-y-8 outline-none">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Historial de Feedback</h2>
                            <p className="text-sm text-zinc-500">Seguimiento de crecimiento, fortalezas y áreas de mejora.</p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => setIsCreatingFeedback(!isCreatingFeedback)}
                                className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                            >
                                {isCreatingFeedback ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                {isCreatingFeedback ? 'Cancelar' : 'Registrar Feedback'}
                            </button>
                        )}
                    </div>

                    <AnimatePresence>
                        {isCreatingFeedback && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <Card className="border-2 border-primary/20 bg-primary/5 dark:bg-primary/10 rounded-2xl mb-8">
                                    <CardContent className="p-8">
                                        <form onSubmit={handleCreateFeedback} className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Tipo de Sesión</label>
                                                    <select
                                                        value={newFeedback.type}
                                                        onChange={e => setNewFeedback({...newFeedback, type: e.target.value})}
                                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                                    >
                                                        <option value="ESCRITO">📝 Feedback Escrito</option>
                                                        <option value="UNO_A_UNO">🤝 Sesión 1-on-1</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Fecha de la Sesión</label>
                                                    <input
                                                        type="date"
                                                        value={newFeedback.date}
                                                        onChange={e => setNewFeedback({...newFeedback, date: e.target.value})}
                                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                                        <Award className="w-3.5 h-3.5 text-emerald-500" /> Fortalezas y Logros
                                                    </label>
                                                    <textarea
                                                        rows={4}
                                                        required
                                                        value={newFeedback.strengths}
                                                        onChange={e => setNewFeedback({...newFeedback, strengths: e.target.value})}
                                                        placeholder="¿Qué hizo bien el colaborador este mes?"
                                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white resize-none"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" /> Áreas de Mejora
                                                    </label>
                                                    <textarea
                                                        rows={4}
                                                        required
                                                        value={newFeedback.improvementAreas}
                                                        onChange={e => setNewFeedback({...newFeedback, improvementAreas: e.target.value})}
                                                        placeholder="¿En qué competencias debe enfocarse para crecer?"
                                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white resize-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                                    <Target className="w-3.5 h-3.5 text-primary" /> Acuerdos y Siguientes Pasos
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    required
                                                    value={newFeedback.actionItems}
                                                    onChange={e => setNewFeedback({...newFeedback, actionItems: e.target.value})}
                                                    placeholder="Compromisos concretos para el próximo periodo..."
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white resize-none"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                                    <Key className="w-3.5 h-3.5 text-zinc-400" /> Nota Privada (Solo Admins)
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={newFeedback.privateNote}
                                                    onChange={e => setNewFeedback({...newFeedback, privateNote: e.target.value})}
                                                    placeholder="Notas internas que el colaborador no verá..."
                                                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white resize-none"
                                                />
                                            </div>

                                            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCreatingFeedback(false)}
                                                    className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isLoading}
                                                    className="bg-primary text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2"
                                                >
                                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                    Guardar Registro
                                                </button>
                                            </div>
                                        </form>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {isFeedbackLoading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {feedback.map(item => (
                                <Card key={item.id} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden group">
                                    <CardHeader className="bg-zinc-50/50 dark:bg-zinc-800/20 py-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center",
                                                    item.type === 'UNO_A_UNO' ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                )}>
                                                    {item.type === 'UNO_A_UNO' ? <User className="w-5 h-5" /> : <StickyNote className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base font-bold">
                                                        {item.type === 'UNO_A_UNO' ? 'Sesión 1-on-1' : 'Feedback Mensual'}
                                                    </CardTitle>
                                                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                                        <Calendar className="w-3 h-3" />
                                                        {new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        <span className="mx-1">•</span>
                                                        <span>Escrito por {item.author?.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleDeleteFeedback(item.id)}
                                                    className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                                <Award className="w-3.5 h-3.5" /> Fortalezas
                                            </h4>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                                {item.strengths}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                                <TrendingUp className="w-3.5 h-3.5" /> Oportunidades
                                            </h4>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                                {item.improvementAreas}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                                <Target className="w-3.5 h-3.5" /> Acuerdos
                                            </h4>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                                {item.actionItems}
                                            </p>
                                        </div>

                                        {item.privateNote && isAdmin && (
                                            <div className="col-span-full mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/10 -mx-6 px-6 mb-0 pb-6">
                                                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2 mb-2">
                                                    <Key className="w-3.5 h-3.5" /> Nota Privada Administrativa
                                                </h4>
                                                <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                                                    {item.privateNote}
                                                </p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}

                            {feedback.length === 0 && (
                                <div className="h-64 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/20 text-center px-8">
                                    <TrendingUp className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="font-medium">No hay registros de desempeño disponibles aún.</p>
                                    <p className="text-sm max-w-xs mt-1">El historial de feedback y sesiones 1-on-1 aparecerá aquí una vez que sean registradas.</p>
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Avatar Upload Modal */}
            <AnimatePresence>
                {isAvatarModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAvatarModalOpen(false)}
                            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-white/5"
                        >
                            <div className="p-6 border-b border-zinc-100 dark:border-white/5 flex justify-between items-center">
                                <h3 className="font-bold">Actualizar Foto</h3>
                                <button onClick={() => setIsAvatarModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-8">
                                <AvatarUploader
                                    member={{ ...profileData, avatarUrl: profileData.avatarUrl }}
                                    memberId={profileData.id}
                                    onUploadSuccess={() => {
                                        setIsAvatarModalOpen(false);
                                        fetchProfile();
                                    }}
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Profile;
