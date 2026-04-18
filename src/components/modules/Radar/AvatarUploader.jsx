import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Camera, Upload, Loader2 } from 'lucide-react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';

const AvatarUploader = ({ member, memberId, onUploadSuccess }) => {
    const queryClient = useQueryClient();
    const [isUploading, setIsUploading] = useState(false);

    const onDrop = useCallback(async (acceptedFiles) => {
        if (acceptedFiles.length === 0 || !memberId) return;

        setIsUploading(true);
        const file = acceptedFiles[0];
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            // Ensure the request target is always the specific memberId profile
            await axios.put(`${baseUrl}/api/talent-radar/member/${memberId}/avatar`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            // Refetch all related data to update UI globally (Radar, Matrix, Profile)
            await queryClient.invalidateQueries({ queryKey: ['talent-radar-summary'] });
            await queryClient.invalidateQueries({ queryKey: ['member-radar-detail'] });
            await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
            await queryClient.invalidateQueries({ queryKey: ['user-data'] }); // For AppLayout Header
            await queryClient.invalidateQueries({ queryKey: ['team-members'] }); // For Team lists
            await queryClient.invalidateQueries({ queryKey: ['user'] }); // For Generic User Lists

            toast.success("Foto de perfil actualizada");
            if (onUploadSuccess) onUploadSuccess();
        } catch (error) {
            console.error("Avatar upload failed:", error);
            toast.error("Error al subir la imagen");
        } finally {
            setIsUploading(false);
        }
    }, [memberId, queryClient, onUploadSuccess]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
        maxFiles: 1,
        disabled: isUploading
    });

    return (
        <div className="space-y-6 min-h-[400px] flex flex-col">
            <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative group shrink-0">
                    <TeamAvatar
                        member={member}
                        className="w-32 h-32 border-4 border-indigo-600/20 shadow-2xl bg-zinc-50 dark:bg-zinc-800"
                        size={128}
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Camera className="w-8 h-8 text-white" />
                    </div>
                </div>

                <div className="text-center space-y-1">
                    <h5 className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[200px]">
                        {member?.avatarUrl ? member?.name : 'Usuario'}
                    </h5>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">{member?.role || 'Miembro de Equipo'}</p>
                </div>
            </div>

            <div
                {...getRootProps()}
                className={cn(
                    "p-8 border-2 border-dashed rounded-3xl transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3",
                    isDragActive ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/10 scale-[0.98]" : "border-zinc-200 dark:border-white/5 hover:border-indigo-600/50",
                    isUploading && "opacity-50 cursor-not-allowed"
                )}
            >
                <input {...getInputProps()} />
                <div className="p-4 bg-indigo-600/10 rounded-2xl">
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    ) : (
                        <Upload className="w-8 h-8 text-indigo-600" />
                    )}
                </div>
                <div>
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">
                        {isUploading ? "Subiendo..." : "Arrastra o selecciona una foto"}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter">
                        JPG, PNG o WEBP (Máx 5MB)
                    </p>
                </div>
            </div>

            <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                    <span className="font-bold">Aviso:</span> Como administrador, estás subiendo la foto oficial que será visible para todo el equipo en el Radar de Talento. Asegúrate de que siga los estándares visuales de la agencia.
                </p>
            </div>
        </div>
    );
};

export default AvatarUploader;
