import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// «Compartir solo con»: el control de un pendiente privado, en la fila de la tarea
// (Rodny, 24 de septiembre de 2026). Vive aquí y no copiado en cada pantalla porque lo
// usan el panel de la tarea y el alta desde la ficha del cliente; una copia es una que
// mañana se queda sin un arreglo.
//
// Quien la crea y quien la ejecuta la abren siempre, así que el responsable no sale en
// la lista: marcarlo no significaría nada.

export default function TaskShareControl({ isPrivate, viewerIds = [], members = [], assigneeId = null, onChange }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const chosen = Array.isArray(viewerIds) ? viewerIds : [];

    // Al pulsar fuera: si no se eligió a nadie, el interruptor se apaga —quedaría un
    // privado sin compartir con nadie, que no es lo que se estaba haciendo—; si ya hay
    // alguien elegido, solo se cierra la lista (Rodny, 24 de septiembre de 2026).
    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
            if (containerRef.current?.contains(event.target)) return;
            setOpen(false);
            if (isPrivate && chosen.length === 0) onChange({ isPrivate: false, viewerIds: [] });
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open, isPrivate, chosen.length, onChange]);

    const selectable = members.filter((member) => member.userId && member.id !== assigneeId);

    return (
        <div className="relative" data-task-private-control ref={containerRef}>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <button
                    type="button"
                    onClick={() => isPrivate && setOpen((prev) => !prev)}
                    className={cn(
                        "whitespace-nowrap text-[10px] font-bold uppercase tracking-wider",
                        isPrivate ? "text-primary" : "text-zinc-400"
                    )}
                    title={isPrivate ? "Elegir con quién se comparte" : "Compartir este pendiente solo con algunas personas"}
                >
                    Compartir solo con
                </button>
                <button
                    type="button"
                    role="switch"
                    aria-checked={!!isPrivate}
                    aria-label="Compartir solo con algunas personas"
                    onClick={() => {
                        const encendido = !isPrivate;
                        onChange({ isPrivate: encendido, viewerIds: encendido ? chosen : [] });
                        setOpen(encendido);
                    }}
                    className={cn(
                        "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                        isPrivate ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-600"
                    )}
                >
                    <span className={cn(
                        "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all",
                        isPrivate ? "left-[0.875rem]" : "left-0.5"
                    )} />
                </button>
            </div>

            <AnimatePresence>
                {open && isPrivate && (
                    <motion.div
                        data-task-private-popover
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.14 }}
                        className="brain-popover-surface absolute right-0 top-[calc(100%+6px)] z-[125] w-60 p-2"
                    >
                        <ul className="max-h-56 overflow-y-auto">
                            {selectable.map((member) => {
                                const checked = chosen.includes(member.userId);
                                return (
                                    <li key={member.id}>
                                        <button
                                            type="button"
                                            role="menuitemcheckbox"
                                            aria-checked={checked}
                                            onClick={() => onChange({
                                                isPrivate: true,
                                                viewerIds: checked
                                                    ? chosen.filter((id) => id !== member.userId)
                                                    : [...chosen, member.userId]
                                            })}
                                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                        >
                                            <span className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                checked ? "border-primary bg-primary text-primary-foreground" : "border-zinc-300 dark:border-zinc-600"
                                            )}>
                                                {checked && <Check size={11} />}
                                            </span>
                                            <span className="truncate">{member.name}</span>
                                        </button>
                                    </li>
                                );
                            })}
                            {selectable.length === 0 && (
                                <li className="px-2 py-3 text-sm text-zinc-500">No hay nadie más a quien compartirlo.</li>
                            )}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
