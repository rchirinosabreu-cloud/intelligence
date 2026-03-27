import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Download, CloudUpload, FileText, FileVideo, FileAudio, File, Loader2, Trash2, Search, Eye, X, ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
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
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedMonths, setExpandedMonths] = useState({});
    const [previewFile, setPreviewFile] = useState(null);
    const [isMaximized, setIsMaximized] = useState(false);

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

    const formatMonthYear = (dateString) => {
        const date = new Date(dateString);
        const monthYear = format(date, "MMMM yyyy", { locale: es });
        return monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
    };

    // Filter and Group Logic
    const filteredFiles = files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groupedFiles = filteredFiles.reduce((acc, file) => {
        const monthYear = formatMonthYear(file.createdAt);
        if (!acc[monthYear]) acc[monthYear] = [];
        acc[monthYear].push(file);
        return acc;
    }, {});

    const sortedMonths = Object.keys(groupedFiles).sort((a, b) => {
        // Simple string parsing for sorting months back to date is tricky in Spanish,
        // better use the first file's createdAt in each group
        return new Date(groupedFiles[b][0].createdAt) - new Date(groupedFiles[a][0].createdAt);
    });

    useEffect(() => {
        if (files.length > 0) {
            const currentMonth = formatMonthYear(new Date());
            const initialExpanded = {};

            // Expand current month OR expand all if searching
            if (searchQuery.trim() !== '') {
                sortedMonths.forEach(m => initialExpanded[m] = true);
            } else if (sortedMonths.length > 0) {
                initialExpanded[sortedMonths[0]] = true; // Most recent month
            }
            setExpandedMonths(initialExpanded);
        }
    }, [files, searchQuery, sortedMonths.length]);

    const toggleMonth = (month) => {
        setExpandedMonths(prev => ({ ...prev, [month]: !prev[month] }));
    };

    const canPreview = (mimeType) => {
        if (!mimeType) return false;
        return mimeType.startsWith('image/') ||
               mimeType.startsWith('video/') ||
               mimeType === 'application/pdf';
    };

    const handlePreview = (e, file) => {
        e.preventDefault();
        e.stopPropagation();
        setPreviewFile(file);
    };

    const renderWidgetContent = (containerClass = "h-full") => (
        <div className={`flex flex-col ${containerClass}`}>
            <div className="sticky top-0 z-20 bg-white dark:bg-zinc-900 pb-4 pt-1">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                            <Download className="w-4 h-4 text-emerald-500" />
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">
                            {isMaximized ? 'Gestión de Entregables' : 'Entregables'}
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Buscar archivo..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 w-40 transition-all outline-none"
                            />
                        </div>
                        <span className="text-xs text-zinc-400 font-medium">
                            {isLoading ? '...' : `${files.length} Archivos`}
                        </span>
                        {!isMaximized && (
                            <button
                                onClick={() => setIsMaximized(true)}
                                className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                title="Maximizar"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        )}
                        {isMaximized && (
                            <button
                                onClick={() => setIsMaximized(false)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                title="Cerrar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Dropzone */}
                <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer group
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
            </div>

            {/* File List grouped by month */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pb-4 custom-scrollbar">
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
                ) : filteredFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50">
                        <Search className="w-8 h-8 text-zinc-300" />
                        <p className="text-xs mt-2">No se encontraron archivos con "{searchQuery}"</p>
                    </div>
                ) : (
                    sortedMonths.map((month) => (
                        <div key={month} className="space-y-2">
                            <button
                                onClick={() => toggleMonth(month)}
                                className="flex items-center gap-2 w-full text-left py-1 group"
                            >
                                {expandedMonths[month] ? (
                                    <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                                )}
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                                    {month}
                                </span>
                                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800 ml-2" />
                            </button>

                            {expandedMonths[month] && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {groupedFiles[month].map((file) => {
                                        const Icon = getFileIcon(file.mimeType);
                                        return (
                                            <div
                                                key={file.id}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors group"
                                            >
                                                <div
                                                    className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                                                    onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
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
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {canPreview(file.mimeType) && (
                                                        <button
                                                            onClick={(e) => handlePreview(e, file)}
                                                            className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                                            title="Vista rápida"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    )}
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
                                                    <button
                                                        onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                                                        className="p-2 text-zinc-300 hover:text-emerald-500 transition-colors"
                                                        title="Descargar"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Quick Look Modal */}
            {previewFile && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-white/40 dark:bg-zinc-900/40 backdrop-blur-3xl p-4 animate-in fade-in duration-200">
                    <button
                        onClick={() => setPreviewFile(null)}
                        className="absolute top-6 right-6 p-2 bg-zinc-800/10 hover:bg-zinc-800/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-full text-zinc-800 dark:text-white transition-all z-[70]"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <div className="w-full h-full flex items-center justify-center max-w-6xl max-h-[90vh]">
                        {previewFile.mimeType.startsWith('image/') && (
                            <img
                                src={previewFile.url}
                                alt={previewFile.name}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            />
                        )}
                        {previewFile.mimeType.startsWith('video/') && (
                            <video
                                src={previewFile.url}
                                controls
                                autoPlay
                                className="max-w-full max-h-full rounded-lg shadow-2xl"
                            />
                        )}
                        {previewFile.mimeType === 'application/pdf' && (
                            <iframe
                                src={`${previewFile.url}#toolbar=0`}
                                className="w-full h-full rounded-lg shadow-2xl bg-white border-none"
                                title={previewFile.name}
                            />
                        )}
                    </div>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/80 dark:bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white text-sm">
                        {previewFile.name}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <Card className="w-full flex flex-col h-full min-h-[500px] p-6 relative">
            {renderWidgetContent()}

            {/* Maximized View Modal */}
            {isMaximized && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[50] flex items-center justify-center bg-zinc-900/40 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-300">
                    <Card className="w-full h-full max-w-7xl flex flex-col p-8 bg-white dark:bg-zinc-900 shadow-2xl border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        {renderWidgetContent("flex-1")}
                    </Card>
                </div>
            )}
        </Card>
    );
};

export default DeliverablesWidget;
