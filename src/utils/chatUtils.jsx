import React from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { FileText, Music, FileSpreadsheet, File, Download } from 'lucide-react';

/**
 * Helper to determine file type based on extension
 */
const getFileType = (url) => {
    // Strip query parameters
    const cleanUrl = url.split('?')[0].toLowerCase();

    if (/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i.test(cleanUrl)) {
        return 'image';
    } else if (/\.pdf($|\?)/i.test(cleanUrl)) {
        return 'pdf';
    } else if (/\.(mp3|wav|ogg|aac)($|\?)/i.test(cleanUrl)) {
        return 'audio';
    } else if (/\.(doc|docx|rtf|txt)($|\?)/i.test(cleanUrl)) {
        return 'document';
    } else if (/\.(xls|xlsx|csv)($|\?)/i.test(cleanUrl)) {
        return 'spreadsheet';
    } else if (/\.(ppt|pptx)($|\?)/i.test(cleanUrl)) {
        return 'presentation';
    }

    return 'other';
};

/**
 * Helper to extract filename and extension from URL
 */
const getFileNameAndExtension = (url) => {
    try {
        const cleanPath = url.split('?')[0];
        const segment = cleanPath.split('/').pop();
        if (segment) {
            const decoded = decodeURIComponent(segment);
            const dotIndex = decoded.lastIndexOf('.');
            if (dotIndex !== -1) {
                const name = decoded.substring(0, dotIndex);
                const ext = decoded.substring(dotIndex + 1).toUpperCase();
                return { name, ext, fullName: decoded };
            }
            return { name: decoded, ext: 'ARCHIVO', fullName: decoded };
        }
    } catch (e) {
        console.error(e);
    }
    return { name: 'archivo', ext: 'ARCHIVO', fullName: 'archivo' };
};

/**
 * Component for rendering non-image attachments in Chat
 */
export const AttachmentCard = ({ url, fileType, fileName, fileExt, downloadUrl }) => {
    let Icon = File;
    let iconBgColor = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    let typeLabel = `${fileExt} • Archivo`;

    if (fileType === 'pdf') {
        Icon = FileText;
        iconBgColor = 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400';
        typeLabel = 'PDF • Documento';
    } else if (fileType === 'audio') {
        Icon = Music;
        iconBgColor = 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400';
        typeLabel = `${fileExt} • Audio`;
    } else if (fileType === 'document') {
        Icon = FileText;
        iconBgColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
        typeLabel = `${fileExt} • Documento`;
    } else if (fileType === 'spreadsheet') {
        Icon = FileSpreadsheet;
        iconBgColor = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
        typeLabel = `${fileExt} • Hoja de cálculo`;
    } else if (fileType === 'presentation') {
        Icon = FileText;
        iconBgColor = 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400';
        typeLabel = `${fileExt} • Presentación`;
    }

    return (
        <div className="flex items-center justify-between gap-4 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl my-2 max-w-md shadow-sm transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800/80">
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBgColor}`}>
                    <Icon size={20} />
                </div>
                <div className="min-w-0">
                    <h5 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate" title={fileName}>
                        {fileName}
                    </h5>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
                        {typeLabel}
                    </p>
                </div>
            </div>

            <a
                href={downloadUrl}
                download={fileName}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-lg shadow-sm transition-colors cursor-pointer shrink-0"
                title="Descargar archivo"
            >
                <Download size={14} />
            </a>
        </div>
    );
};

/**
 * Utility to convert URLs in text to interactive <a> tags, image previews, or attachment cards.
 * Handles http, https, and www prefixes.
 */
export const linkify = (text, onImageClick = null, contextData = {}) => {
    if (!text) return text;

    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

    const parts = text.split(urlRegex);

    const accessToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

    return parts.map((part, index) => {
        if (part.match(urlRegex)) {
            let href = part.startsWith('www.') ? `https://${part}` : part;

            const fileType = getFileType(href);
            const isImage = fileType === 'image';
            const isS3Bucket = href.includes('t3.storageapi.dev');

            // Proxy logic for S3 images if metadata is available
            let displaySrc = href;
            if (isS3Bucket && contextData.taskId && contextData.commentId) {
                displaySrc = `${getApiBaseUrl()}/api/tasks/${contextData.taskId}/comments/${contextData.commentId}/file`;
                if (accessToken) {
                    displaySrc += `?token=${encodeURIComponent(accessToken)}`;
                }
            }

            if (isImage) {
                return (
                    <div key={index} className="my-2">
                        {onImageClick ? (
                            <img
                                src={displaySrc}
                                alt="Shared image"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onImageClick({ direct: href, proxy: displaySrc, commentId: contextData.commentId });
                                }}
                                className="max-w-[160px] max-h-[120px] object-cover rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.style.display = 'none';
                                }}
                            />
                        ) : (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <img
                                    src={displaySrc}
                                    alt="Shared image"
                                    className="max-w-[160px] max-h-[120px] object-cover rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm hover:opacity-90 transition-opacity"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.style.display = 'none';
                                    }}
                                />
                            </a>
                        )}
                    </div>
                );
            }

            // Render non-image files or S3 uploaded files as AttachmentCard
            const { name, ext } = getFileNameAndExtension(href);

            if (fileType !== 'other' || isS3Bucket) {
                let downloadUrl = href;
                if (isS3Bucket && contextData.taskId && contextData.commentId) {
                    downloadUrl = `${getApiBaseUrl()}/api/tasks/${contextData.taskId}/comments/${contextData.commentId}/download`;
                    if (accessToken) {
                        downloadUrl += `?token=${encodeURIComponent(accessToken)}`;
                    }
                }

                return (
                    <AttachmentCard
                        key={index}
                        url={href}
                        fileType={fileType}
                        fileName={name}
                        fileExt={ext}
                        downloadUrl={downloadUrl}
                    />
                );
            }

            return (
                <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-bold break-all"
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }

        // If it's plain text, parse mentions
        const mentionRegex = /(@[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_.-]+(?:\s+[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_.-]+)?)/g;
        const subParts = part.split(mentionRegex);
        return subParts.map((subPart, subIndex) => {
            if (subPart.match(mentionRegex)) {
                return (
                    <span key={subIndex} className="inline-block px-2 py-0.5 mx-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-full font-bold text-xs select-all shadow-sm">
                        {subPart}
                    </span>
                );
            }
            return subPart;
        });
    });
};

/**
 * Strips system prefixes like [DEVOLUCIÓN - ...] or [REINTEGRADA - ...]
 */
export const cleanSystemMessage = (text) => {
    if (!text) return "";
    return text.replace(/^\[(DEVOLUCIÓN|REINTEGRADA)[^\]]*\]:\s*/i, "").trim();
};
