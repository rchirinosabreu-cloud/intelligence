import React from 'react';

import { getApiBaseUrl } from '@/lib/apiBaseUrl';

/**
 * Utility to convert URLs in text to interactive <a> tags or image previews.
 * Handles http, https, and www prefixes.
 */
export const linkify = (text, onImageClick = null, contextData = {}) => {
    if (!text) return text;

    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    // Regex for common image extensions OR our S3 bucket domain
    const imageRegex = /\.(jpeg|jpg|gif|png|webp)($|\?)/i;
    const isS3Bucket = (url) => url.includes('t3.storageapi.dev');

    const parts = text.split(urlRegex);

    const accessToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

    return parts.map((part, index) => {
        if (part.match(urlRegex)) {
            const isImage = part.match(imageRegex) || isS3Bucket(part);
            let href = part.startsWith('www.') ? `https://${part}` : part;

            // Proxy logic for S3 images if metadata is available
            let displaySrc = href;
            if (isS3Bucket(part) && contextData.taskId && contextData.commentId) {
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
                                    // We pass the direct URL or the proxy?
                                    // Let's pass an object so the handler can decide.
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
        return part;
    });
};

/**
 * Strips system prefixes like [DEVOLUCIÓN - ...] or [REINTEGRADA - ...]
 */
export const cleanSystemMessage = (text) => {
    if (!text) return "";
    return text.replace(/^\[(DEVOLUCIÓN|REINTEGRADA)[^\]]*\]:\s*/i, "").trim();
};
