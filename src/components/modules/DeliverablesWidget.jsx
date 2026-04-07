import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Download, CloudUpload, FileText, FileVideo, FileAudio, File, Loader2, Trash2, Search, Eye, X, ChevronDown, ChevronRight, Maximize2, ArrowRight, Image } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import SlideOver from '@/components/ui/SlideOver';
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
            const token = localStorage.getItem('authToken');
            const response = await axios.get(`${baseUrl}/api/clients/${clientId}/files?category=Entregable`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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

        // Security check: Block executable files
        const forbiddenExtensions = [
            '.exe', '.js', '.sh', '.php', '.bat', '.cmd', '.msi', '.vbs', '.scr', '.com',
            '.ps1', '.vbe', '.jse', '.reg', '.wsf', '.pif', '.hta', '.jar'
        ];
        const hasForbidden = acceptedFiles.some(file =>
            forbiddenExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
        );

        if (hasForbidden) {
            toast.error("Por seguridad, no se permiten archivos ejecutables (.exe, .js, .sh, etc.)");
            return;
        }

        setIsUploading(true);
        const uploadToast = toast.loading(`Subiendo ${acceptedFiles.length} archivo(s)...`);

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            for (const file of acceptedFiles) {
                try {
                    // Step 1: Request Signed URL
                    const { data: signedData } = await axios.get(
                        `${baseUrl}/api/clients/${clientId}/storage/signed-url`,
                        {
                            params: { fileName: file.name, fileType: file.type || 'application/octet-stream' },
                            headers: { 'Authorization': `Bearer ${token}` }
                        }
                    );

                    const { url, gcsPath } = signedData;

                    // Step 2: Upload directly to GCS via PUT
                    // We use a clean axios instance to avoid global interceptors/headers (like Authorization)
                    // which GCS might reject via CORS.
                    try {
                        const gcsAxios = axios.create();
                        await gcsAxios.put(url, file, {
                            headers: { 'Content-Type': file.type || 'application/octet-stream' },
                            withCredentials: false
                        });
                    } catch (gcsError) {
                        console.error("GCS Direct Upload Failed (CORS or Network):", gcsError);
                        throw new Error(`Error de conexión con Google Storage. Verifica la configuración de CORS.`);
                    }

                    // Step 3: Register in Database
                    await axios.post(
                        `${baseUrl}/api/clients/${clientId}/files`,
                        {
                            category: 'Entregable',
                            isDirectUpload: true,
                            gcsPath,
                            name: file.name,
                            size: file.size,
                            mimeType: file.type || 'application/octet-stream'
                        },
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                } catch (fileError) {
                    console.error(`Error processing file ${file.name}:`, fileError);
                    throw fileError; // Stop the loop and show error to user
                }
            }

            toast.success("Archivos subidos con éxito", { id: uploadToast });
            fetchFiles(); // Refresh list
        } catch (error) {
            console.error("Fatal upload error:", error);
            const errorMessage = error.response?.data?.error || error.message || "Error al subir archivos";
            toast.error(errorMessage, { id: uploadToast });
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
            const token = localStorage.getItem('authToken');
            await axios.delete(`${baseUrl}/api/clients/${clientId}/files/${fileId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
        if (mimeType.includes('image')) return Image;
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
    const filteredFiles = useMemo(() =>
        files.filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase())),
        [files, searchQuery]
    );

    const groupedFiles = useMemo(() => {
        return filteredFiles.reduce((acc, file) => {
            const monthYear = formatMonthYear(file.createdAt);
            if (!acc[monthYear]) acc[monthYear] = [];
            acc[monthYear].push(file);
            return acc;
        }, {});
    }, [filteredFiles]);

    const sortedMonths = useMemo(() => {
        return Object.keys(groupedFiles).sort((a, b) => {
            return new Date(groupedFiles[b][0].createdAt) - new Date(groupedFiles[a][0].createdAt);
        });
    }, [groupedFiles]);

    useEffect(() => {
        if (files.length > 0) {
            const initialExpanded = {};
            if (searchQuery.trim() !== '') {
                sortedMonths.forEach(m => initialExpanded[m] = true);
            } else if (sortedMonths.length > 0) {
                initialExpanded[sortedMonths[0]] = true; // Most recent month
            }
            setExpandedMonths(initialExpanded);
        }
    }, [files, searchQuery, sortedMonths]);

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

    const forceDownload = async (e, fileId, filename) => {
        e.preventDefault();
        e.stopPropagation();

        const toastId = toast.loading("Iniciando descarga...");
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');

            const response = await fetch(`${baseUrl}/api/clients/${clientId}/files/${fileId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error("Download failed");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            toast.success("Descarga completada", { id: toastId });
        } catch (error) {
            console.error("Error downloading file:", error);
            toast.error("Error al descargar el archivo", { id: toastId });
        }
    };

    const renderWidgetContent = (isPanel = false) => (
        <div className="flex flex-col h-full overflow-hidden">
            <div className={isPanel ? "sticky top-0 z-20 bg-white dark:bg-zinc-900 pb-4" : "sticky top-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm pb-4 pt-1"}>
                {!isPanel && (
                    <div className="flex items-center justify-between mb-5 px-1">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                <Download className="w-4 h-4 text-emerald-500" />
                            </div>
                            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">
                                Entregables
                            </h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                                {isLoading ? '...' : `${files.length} Archivos`}
                            </span>
                            <button
                                onClick={() => setIsMaximized(true)}
                                className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                title="Gestionar historial"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group
                        ${isDragActive ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-zinc-200 dark:border-zinc-800 bg-transparent hover:border-emerald-500/50 hover:bg-zinc-50/30 dark:hover:bg-emerald-900/10'}
                        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <input {...getInputProps()} />
                    <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-2 group-hover:scale-110 transition-transform">
                        {isUploading ? (
                            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                        ) : (
                            <CloudUpload className={`w-5 h-5 ${isDragActive ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-emerald-500'}`} />
                        )}
                    </div>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                        {isUploading ? 'Procesando archivos...' : 'Arrastra entregables finales'}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">o haz clic para explorar</p>
                </div>

                {isPanel && (
                    <div className="mt-6 flex items-center justify-between gap-4">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Buscar entregable por nombre..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className={cn(
                "flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar overscroll-contain",
                isPanel ? "space-y-6 pb-6" : "pb-2 max-h-[300px]"
            )}>
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
                                                    {(JSON.parse(localStorage.getItem('currentUser'))?.role === 'ADMIN' || JSON.parse(localStorage.getItem('currentUser'))?.role === 'EDITOR') && (
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
                                                    )}
                                                    <button
                                                        onClick={(e) => forceDownload(e, file.id, file.name)}
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

            {previewFile && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/80 backdrop-blur-xl p-4 md:p-10 animate-in fade-in duration-300">
                    <div className="absolute inset-0" onClick={() => setPreviewFile(null)} />
                    <div className="w-full h-full max-w-6xl flex flex-col z-[65] relative animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between mb-4 bg-zinc-900/50 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
                            <div className="flex items-center gap-3 pl-2">
                                <div className="p-2 bg-emerald-500/20 rounded-lg">
                                    {React.createElement(getFileIcon(previewFile.mimeType), { className: "w-4 h-4 text-emerald-500" })}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white truncate max-w-[300px]">{previewFile.name}</span>
                                    <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-tighter">{formatSize(previewFile.size)} • {formatDate(previewFile.createdAt)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => forceDownload(e, previewFile.id, previewFile.name)}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white text-xs font-bold transition-all shadow-lg"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    DESCARGAR
                                </button>
                                <button
                                    onClick={() => setPreviewFile(null)}
                                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all border border-white/10"
                                    title="Cerrar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-white/5 dark:bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden shadow-2xl relative">
                            {previewFile.mimeType.startsWith('image/') && (
                                <div className="w-full h-full flex items-center justify-center p-4">
                                    <img
                                        src={previewFile.url}
                                        alt={previewFile.name}
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
                                    />
                                </div>
                            )}
                            {previewFile.mimeType.startsWith('video/') && (
                                <div className="w-full h-full flex items-center justify-center bg-black">
                                    <video
                                        src={previewFile.url}
                                        controls
                                        autoPlay
                                        className="max-w-full max-h-full"
                                    />
                                </div>
                            )}
                            {previewFile.mimeType === 'application/pdf' && (
                                <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 flex flex-col">
                                    <iframe
                                        src={`${previewFile.url}#toolbar=0&navpanes=0&view=FitH`}
                                        className="w-full h-full border-none bg-white"
                                        title={previewFile.name}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <Card className="w-full flex flex-col h-full max-h-[550px] p-6 relative overflow-hidden group border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
                {renderWidgetContent(false)}
                <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 shrink-0">
                    <button
                        onClick={() => setIsMaximized(true)}
                        className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        Gestionar todos los entregables
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </Card>

            <SlideOver
                open={isMaximized}
                onOpenChange={setIsMaximized}
                title="Gestión de Entregables"
                description="Historial de archivos y zona de carga"
                icon={<Download className="w-5 h-5 text-emerald-500" />}
                iconBgColor="bg-emerald-500/10"
            >
                <div className="flex-1 overflow-hidden p-6 bg-zinc-50/50 dark:bg-zinc-900/20">
                    {renderWidgetContent(true)}
                </div>
            </SlideOver>
        </>
    );
};

export default DeliverablesWidget;
