
import React, { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * SlideOver Component (historical name kept for its callers).
 *
 * Since 18 September 2026 every modal of the platform opens centred on screen (decision of Rodny):
 * this panel no longer slides in from the right. It keeps the same API and the same internal
 * flex structure so the content of each caller still scrolls inside the panel.
 *
 * UX fixes preserved:
 * 1. Overscroll Behavior: Prevents scroll chaining to the body.
 * 2. Auto-Focus: Automatically focuses the container on mount to enable immediate keyboard scrolling.
 */
const SlideOver = ({
    open,
    onOpenChange,
    title,
    description,
    icon,
    iconBgColor = "bg-zinc-100 dark:bg-zinc-800",
    iconColor = "text-zinc-900 dark:text-white",
    children,
    className
}) => {
    const contentRef = useRef(null);

    // UX Fix: Auto-focus on mount to enable immediate scrolling with keyboard keys
    useEffect(() => {
        if (open && contentRef.current) {
            const timer = setTimeout(() => {
                contentRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [open]);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] animate-in fade-in duration-200" />
                <Dialog.Content
                    ref={contentRef}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onPointerDownOutside={(e) => {
                        if (e.target.closest('[data-side-panel-ignore="true"]') || e.target.closest('.ignore-panel-close')) {
                            e.preventDefault();
                        }
                    }}
                    onInteractOutside={(e) => {
                        if (e.target.closest('[data-side-panel-ignore="true"]') || e.target.closest('.ignore-panel-close')) {
                            e.preventDefault();
                        }
                    }}
                    tabIndex={-1}
                    className={cn(
                        "fixed left-1/2 top-1/2 z-[101] flex h-[min(90dvh,860px)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl focus:outline-none overscroll-contain animate-in fade-in zoom-in-95 duration-200 dark:border-zinc-800 dark:bg-zinc-950",
                        className
                    )}
                >
                    <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3">
                            {icon && (
                                <div className={cn("p-2 rounded-xl", iconBgColor)}>
                                    {icon}
                                </div>
                            )}
                            <div>
                                <Dialog.Title className="text-lg font-bold text-zinc-900 dark:text-white">
                                    {title}
                                </Dialog.Title>
                                {description && (
                                    <p className="text-xs text-zinc-500">{description}</p>
                                )}
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <button aria-label="Cerrar" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800">
                                <X className="w-5 h-5" />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {children}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default SlideOver;
