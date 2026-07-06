import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/utils/urlHelper';

const LinkDropdown = ({ label, links = [], icon: Icon = LinkIcon }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Normalize links to array and sanitize
    const linkArray = Array.isArray(links) ? links.filter(Boolean) : [links].filter(Boolean);
    const hasMultiple = linkArray.length > 1;
    const hasAny = linkArray.length > 0;

    if (!hasAny) return null;

    const displayLabel = hasMultiple ? `${label}s` : label;

    if (!hasMultiple) {
        return (
            <a
                href={sanitizeUrl(linkArray[0])}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-400 hover:text-primary hover:border-primary/30 transition-all shadow-sm flex-1"
            >
                <Icon size={12} /> {displayLabel} <ExternalLink size={10} />
            </a>
        );
    }

    return (
        <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
            <button
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
                    <div className="fixed inset-0 z-[60]" onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                    }} />
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[70] py-2 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {linkArray.map((url, idx) => (
                            <a
                                key={idx}
                                href={sanitizeUrl(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-between gap-3 px-4 py-2.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b last:border-0 border-zinc-100 dark:border-zinc-800/50"
                            >
                                <span className="truncate flex-1">Enlace #{idx + 1}</span>
                                <ExternalLink size={12} className="shrink-0 opacity-40" />
                            </a>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default LinkDropdown;
