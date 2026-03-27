import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Download, CloudUpload, FileText, FileVideo, FileAudio, File, Loader2, Trash2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const DeliverablesWidget = ({ clientId }) => {
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(null); // stores fileId being deleted

    // Fetch Files from Backend
    const fetchFiles = useCallback(async () => {
        if (!clientId) return;
        try {
            const baseUrl = getApiBaseUrl();
            const response = await axios.get(`${baseUrl}/api/clients/${clientId}/files?category=Entregable`);
            setFiles(response.data);
        } catch (error) {
            console.error("Error fetching client files:", error);
            toast.error("No se pudieron cargar los entregables");
        } finally {
            setIsLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    // Handle File Drop & Upload
    const onDrop = useCallback(async (acceptedFiles) => {
        if (!clientId || acceptedFiles.length === 0) return;

        setIsUploading(true);
        const uploadToast = toast.loading(`Subiendo ${acceptedFiles.length} archivo(s)...`);

        try {
            const baseUrl = getApiBaseUrl();
            for (const file of acceptedFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', 'Entregable');

                await axios.post(`${baseUrl}/api/clients/${clientId}/files`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }
            toast.success("Archivos subidos con éxito", { id: uploadToast });
            fetchFiles(); // Refresh list
        } catch (error) {
            console.error("Error uploading files:", error);
            toast.error("Error al subir uno o más archivos", { id: uploadToast });
        } finally {
            setIsUploading(false);
        }
    }, [clientId, fetchFiles]);

    const handleDelete = async (e, fileId) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm("¿Estás seguro de que quieres eliminar este entregable? El archivo se borrará permanentemente de Google Cloud Storage.")) {
            return;
        }

        setIsDeleting(fileId);
        const deleteToast = toast.loading("Eliminando archivo...");

        try {
            const baseUrl = getApiBaseUrl();
            await axios.delete(`${baseUrl}/api/clients/${clientId}/files/${fileId}`);
            toast.success("Archivo eliminado", { id: deleteToast });
            fetchFiles(); // Refresh list
        } catch (error) {
            console.error("Error deleting file:", error);
            toast.error("No se pudo eliminar el archivo", { id: deleteToast });
        } finally {
            setIsDeleting(null);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        disabled: isUploading
    });

    // File Helpers
    const getFileIcon = (mimeType) => {
        if (!mimeType) return File;
        if (mimeType.includes('pdf')) return FileText;
        if (mimeType.includes('video')) return FileVideo;
        if (mimeType.includes('audio')) return FileAudio;
        if (mimeType.includes('image')) return File; // You could add an Image icon
        return File;
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString) => {
        return format(new Date(dateString), "d 'de' MMMM", { locale: es });
    };

    return (
        <Card className="w-full flex flex-col h-full min-h-[400px] p-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                        <Download className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Entregables</h3>
                </div>
                <span className="text-xs text-zinc-400 font-medium">
                    {isLoading ? '...' : `${files.length} Archivos`}
                </span>
            </div>

            {/* Dropzone */}
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 mb-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group
                    ${isDragActive ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'}
                    ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <input {...getInputProps()} />
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-3 group-hover:scale-110 transition-transform">
                    {isUploading ? (
                        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    ) : (
                        <CloudUpload className={`w-6 h-6 ${isDragActive ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-emerald-500'}`} />
                    )}
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {isUploading ? 'Procesando archivos...' : 'Arrastra entregables finales'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">o haz clic para explorar</p>
            </div>

            {/* File List */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                        <p className="text-xs mt-2">Cargando archivos...</p>
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50 border border-zinc-100 dark:border-zinc-800 rounded-xl">
                        <File className="w-8 h-8 text-zinc-300" />
                        <p className="text-xs mt-2">No hay archivos entregados</p>
                    </div>
                ) : (
                    files.map((file) => {
                        const Icon = getFileIcon(file.mimeType);
                        return (
                            <a
                                key={file.id}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors group cursor-pointer"
                            >
                                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 group-hover:border-emerald-200 transition-colors">
                                    <Icon className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                        {file.name}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        <span>{formatSize(file.size)}</span>
                                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                                        <span>{formatDate(file.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleDelete(e, file.id)}
                                        disabled={isDeleting === file.id}
                                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                        title="Eliminar permanentemente"
                                    >
                                        {isDeleting === file.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                    <Download className="w-4 h-4 text-zinc-300 group-hover:text-emerald-500 transition-colors" />
                                </div>
                            </a>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default DeliverablesWidget;
