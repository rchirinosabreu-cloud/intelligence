
import React, { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SlideOver Component
 *
 * Reusable slide-over modal component that implements key UX fixes:
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
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
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
                        "fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col focus:outline-none overscroll-contain",
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
                            <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors">
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
