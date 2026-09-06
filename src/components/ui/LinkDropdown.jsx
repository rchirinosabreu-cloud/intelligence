import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Link as LinkIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/utils/urlHelper';
import { useNavigate } from 'react-router-dom';
import { openPlatformLink } from '@/lib/platformNavigation';

const LinkDropdown = ({ label, links = [], icon: Icon = LinkIcon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();

    // Normalize links to array and sanitize
    let linkArray = [];
    if (Array.isArray(links)) {
        linkArray = links.filter(Boolean);
    } else if (typeof links === 'string' && links.trim()) {
        // Split by common separators (comma, newline, semicolon)
        linkArray = links.split(/[\s,\n;]+/).filter(Boolean);
    }

    const hasMultiple = linkArray.length > 1;
    const hasAny = linkArray.length > 0;

    if (!hasAny) return null;

    const displayLabel = hasMultiple ? `${label}s` : label;

    if (!hasMultiple) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    openPlatformLink(sanitizeUrl(linkArray[0]), { navigate });
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-primary hover:border-primary/30 transition-all shadow-sm flex-1"
            >
                <Icon size={12} /> {displayLabel} <ExternalLink size={10} />
            </button>
        );
    }

    return (
        <div
            className="relative flex-1"
            data-side-panel-ignore="true"
            onClick={(e) => e.stopPropagation()}
        >
            <button
                data-side-panel-ignore="true"
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm",
                    isOpen ? "border-primary text-primary ring-2 ring-primary/10" : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                )}
            >
                <Icon size={12} /> {displayLabel} ({linkArray.length}) <ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[60]"
                        data-side-panel-ignore="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                        }}
                    />
                    <div
                        className="brain-popover-surface absolute bottom-full left-0 right-0 z-[70] mb-2 overflow-y-auto py-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
                        data-side-panel-ignore="true"
                    >
                        {linkArray.map((url, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openPlatformLink(sanitizeUrl(url), { navigate });
                                }}
                                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                                <span className="truncate flex-1 text-left">Enlace #{idx + 1}</span>
                                <ExternalLink size={12} className="shrink-0 opacity-40" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default LinkDropdown;
