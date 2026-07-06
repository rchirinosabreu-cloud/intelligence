import React from 'react';

/**
 * Utility to convert URLs in text to interactive <a> tags or image previews.
 * Handles http, https, and www prefixes.
 */
export const linkify = (text, onImageClick = null) => {
    if (!text) return text;

    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    // Regex for common image extensions
    const imageRegex = /\.(jpeg|jpg|gif|png|webp)($|\?)/i;

    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
        if (part.match(urlRegex)) {
            const isImage = part.match(imageRegex);
            const href = part.startsWith('www.') ? `https://${part}` : part;

            if (isImage) {
                return (
                    <div key={index} className="my-2">
                        {onImageClick ? (
                            <img
                                src={href}
                                alt="Shared image"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onImageClick(href);
                                }}
                                className="max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
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
                                    src={href}
                                    alt="Shared image"
                                    className="max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm hover:opacity-90 transition-opacity"
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
