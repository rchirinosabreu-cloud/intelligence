import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Globe, Database, Mail, Layout, Loader2, Link as LinkIcon, ShieldCheck, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SourceManagementModal = ({ isOpen, onClose, onRefresh }) => {
    const [integrations, setIntegrations] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newSource, setNewSource] = useState({
        alias: '',
        type: 'SHEETS',
        externalId: ''
    });

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('authToken');

    const fetchIntegrations = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${baseUrl}/api/integrations/integrations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setIntegrations(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchIntegrations();
    }, [isOpen]);

    const handleAddSource = async (e) => {
        e.preventDefault();
        if (!newSource.alias || !newSource.type) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`${baseUrl}/api/integrations/sources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newSource)
            });

            if (res.ok) {
                toast.success("Fuente vinculada correctamente.");
                setNewSource({ alias: '', type: 'SHEETS', externalId: '' });
                fetchIntegrations();
                if (onRefresh) onRefresh();
            }
        } catch (e) {
            toast.error("Error al vincular fuente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Desconectar esta fuente de datos?')) return;
        try {
            const res = await fetch(`${baseUrl}/api/integrations/integrations/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Fuente desconectada.");
                fetchIntegrations();
                if (onRefresh) onRefresh();
            }
        } catch (e) {
            toast.error("Error al eliminar.");
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-white rounded-3xl w-full max-w-2xl p-0 shadow-2xl border-none overflow-hidden max-h-[90vh] flex flex-col">
                <DialogHeader className="p-8 border-b border-zinc-50 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl font-black text-zinc-900 tracking-tight">Gestionar Fuentes API</DialogTitle>
                            <p className="text-xs text-zinc-500 font-medium mt-1">Configura los conectores vivos de Google Workspace para el BrainCore.</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-50 rounded-xl text-zinc-400 transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* List Area */}
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-6 flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5" /> Conexiones Activas
                            </h3>

                            {isLoading ? (
                                <div className="space-y-3">
                                    {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-50 rounded-2xl animate-pulse" />)}
                                </div>
                            ) : integrations.length === 0 ? (
                                <div className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-3xl">
                                    <Database className="w-8 h-8 text-zinc-200 mx-auto mb-3" />
                                    <p className="text-xs font-bold text-zinc-400">Sin fuentes conectadas.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {integrations.map(source => (
                                        <div key={source.id} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center justify-between group hover:border-primary/20 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-2 rounded-xl",
                                                    source.type === 'GMAIL' ? "bg-red-50 text-red-500" :
                                                    source.type === 'SHEETS' ? "bg-emerald-50 text-emerald-500" : "bg-primary/5 text-primary"
                                                )}>
                                                    {source.type === 'GMAIL' ? <Mail className="w-4 h-4" /> :
                                                     source.type === 'SHEETS' ? <Database className="w-4 h-4" /> : <Layout className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-zinc-900">{source.alias}</p>
                                                    <p className="text-[9px] text-zinc-400 font-medium uppercase tracking-tighter">
                                                        {source.type} {source.externalId ? `• ID: ${source.externalId.substring(0,8)}...` : '• Autorizado'}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(source.id)}
                                                className="p-2 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-8 p-6 bg-primary/5 rounded-3xl border border-primary/10">
                                <div className="flex items-center gap-2 text-primary mb-3">
                                    <Info className="w-4 h-4" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">Guía de Conexión</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-primary border border-primary/20 shrink-0">1</div>
                                        <p className="text-[11px] text-zinc-600 leading-relaxed">
                                            Comparte tu archivo de Google (Sheets/Slides) como <span className="font-bold text-zinc-900">Lector</span> con el correo de nuestra Cuenta de Servicio (asociada en Railway).
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-primary border border-primary/20 shrink-0">2</div>
                                        <p className="text-[11px] text-zinc-600 leading-relaxed">
                                            Registra el ID del documento en el formulario de la derecha.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Form Area */}
                        <div className="bg-zinc-50/50 rounded-3xl p-6 border border-zinc-100">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-900 mb-6">Añadir Nueva Fuente</h3>

                            <form onSubmit={handleAddSource} className="space-y-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-2">Nombre Personalizado</label>
                                    <input
                                        type="text"
                                        required
                                        value={newSource.alias}
                                        onChange={e => setNewSource({...newSource, alias: e.target.value})}
                                        placeholder="Ej: Inventario Artyzza 2026"
                                        className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 ring-primary/20 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-2">Tipo de API</label>
                                    <select
                                        value={newSource.type}
                                        onChange={e => setNewSource({...newSource, type: e.target.value})}
                                        className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 ring-primary/20 outline-none"
                                    >
                                        <option value="SHEETS">Google Sheets</option>
                                        <option value="GMAIL">Gmail Inbox</option>
                                        <option value="SLIDES">Google Slides</option>
                                    </select>
                                </div>

                                {newSource.type !== 'GMAIL' && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                        <label className="block text-[9px] font-black uppercase text-zinc-400 mb-2">ID del Documento (Google ID)</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-300">
                                                <LinkIcon className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="text"
                                                required
                                                value={newSource.externalId}
                                                onChange={e => setNewSource({...newSource, externalId: e.target.value})}
                                                placeholder="Pega el ID largo de la URL..."
                                                className="w-full bg-white border border-zinc-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium focus:ring-2 ring-primary/20 outline-none"
                                            />
                                        </div>
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full mt-4 py-4 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-zinc-200"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Vincular Fuente
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SourceManagementModal;
