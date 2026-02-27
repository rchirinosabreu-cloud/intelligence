import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Plus, Link as LinkIcon, Trash2, Loader2, ExternalLink } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const KeyLinksWidget = ({ clientId }) => {
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [newTitle, setNewTitle] = useState('');
    const [newUrl, setNewUrl] = useState('');

    const fetchLinks = async () => {
        try {
            setLoading(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/db/clients/${clientId}/links`);
            if (res.ok) {
                const data = await res.json();
                setLinks(data);
            }
        } catch (error) {
            console.error("Error loading links:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (clientId) fetchLinks();
    }, [clientId]);

    const handleAddLink = async (e) => {
        e.preventDefault();
        if (!newTitle || !newUrl) return;

        try {
            setIsSubmitting(true);
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/api/db/clients/${clientId}/links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle, url: newUrl })
            });

            if (!res.ok) {
                const errorData = await res.json();
                alert(errorData.error || "Error al crear enlace");
                return;
            }

            // Success
            await fetchLinks();
            setNewTitle('');
            setNewUrl('');
            setIsModalOpen(false);

        } catch (error) {
            console.error("Error creating link:", error);
            alert("Error de conexión");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteLink = async (linkId) => {
        if (!confirm("¿Eliminar este enlace?")) return;

        try {
            const baseUrl = getApiBaseUrl();
            await fetch(`${baseUrl}/api/db/links/${linkId}`, {
                method: 'DELETE'
            });
            // Optimistic update or refetch
            setLinks(links.filter(l => l.id !== linkId));
        } catch (error) {
             console.error("Error deleting link:", error);
             alert("No se pudo eliminar el enlace");
        }
    };

    const isLimitReached = links.length >= 5;

    const ensureAbsoluteUrl = (url) => {
        if (!url) return '#';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        return `https://${url}`;
    };

    return (
        <Card className="w-full flex flex-col h-full min-h-[200px]">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-indigo-500" />
                    Enlaces Clave
                </h3>

                {!isLimitReached && (
                    <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
                        <Dialog.Trigger asChild>
                            <button
                                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-indigo-600 transition-colors"
                                title="Añadir enlace"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </Dialog.Trigger>

                        <Dialog.Portal>
                            <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                            <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl z-50 animate-in zoom-in-95 duration-200">
                                <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
                                    Nuevo Enlace
                                </Dialog.Title>

                                <form onSubmit={handleAddLink} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-500 mb-1">Nombre</label>
                                        <input
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            placeholder="Ej. Sitio Web"
                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-500 mb-1">URL</label>
                                        <input
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            placeholder="https://..."
                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Dialog.Close asChild>
                                            <button type="button" className="px-3 py-2 text-zinc-500 hover:text-zinc-900 text-sm">Cancelar</button>
                                        </Dialog.Close>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !newTitle || !newUrl}
                                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                                        >
                                            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                                        </button>
                                    </div>
                                </form>
                            </Dialog.Content>
                        </Dialog.Portal>
                    </Dialog.Root>
                )}
            </div>

            <div className="space-y-2">
                {loading ? (
                    <div className="space-y-2">
                        {[1,2,3].map(i => <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg animate-pulse" />)}
                    </div>
                ) : links.length === 0 ? (
                    <div className="text-center py-6 text-zinc-400 text-sm">
                        No hay enlaces guardados.
                    </div>
                ) : (
                    links.map(link => (
                        <div
                            key={link.id}
                            className="group flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-zinc-100 dark:hover:border-white/5 transition-all"
                        >
                            <a
                                href={ensureAbsoluteUrl(link.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 flex-1 min-w-0"
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                                    <ExternalLink className="w-4 h-4 text-indigo-500" />
                                </div>
                                <div className="truncate">
                                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate group-hover:text-indigo-600 transition-colors">
                                        {link.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        {link.url}
                                    </p>
                                </div>
                            </a>

                            <button
                                onClick={() => handleDeleteLink(link.id)}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Eliminar"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {isLimitReached && (
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/5 text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                        Límite de enlaces alcanzado (5/5)
                    </p>
                </div>
            )}
        </Card>
    );
};

export default KeyLinksWidget;
