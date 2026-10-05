import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Check, Plus, Search, X } from '@/components/ui/icons';
import { collaboratorCandidates } from '@/lib/taskCollaborators';

/**
 * Co-responsables de una tarea (Rodny, 5 de octubre de 2026: opción A, «cada quien su reloj, un
 * solo responsable que cierra»). Envuelve el campo Responsable: a su lado un «+» que abre la lista
 * del equipo, y debajo una ficha por cada co-responsable elegido.
 *
 * Es selección múltiple, así que lleva su propio control accesible (`menuitemcheckbox`), nunca el
 * `Select` de selección simple. Sin responsable no se puede añadir a nadie: alguien tiene que cerrar.
 */
// El «+» no lleva alto propio: se estira al del campo Responsable, que es el `Select` compartido
// (min-h-11). Con un alto fijo quedaba más bajo que el campo.
export default function TaskCollaboratorsPicker({ members, assigneeId, value, onChange, children }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [position, setPosition] = useState(null);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const searchRef = useRef(null);
    const selected = Array.isArray(value) ? value.map(String) : [];
    const memberById = new Map((members || []).map((member) => [String(member.id), member]));
    const candidates = collaboratorCandidates(members, assigneeId, query);
    const disabled = !assigneeId;

    const close = ({ returnFocus = true } = {}) => {
        setOpen(false);
        setQuery('');
        if (returnFocus) triggerRef.current?.focus();
    };

    // La lista se monta en la ventana del panel y no dentro de su cuerpo: el cuerpo tiene su propio
    // scroll y la cortaba por abajo. Fuera de la ventana no serviría: el diálogo atrapa el foco y los
    // clics. Se ubica respecto a la ventana y se abre hacia arriba si debajo no cabe.
    useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
            const trigger = triggerRef.current;
            const rect = trigger?.getBoundingClientRect();
            if (!rect) return;
            const host = trigger.closest('[role="dialog"]') || document.body;
            const frame = host === document.body
                ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight }
                : host.getBoundingClientRect();
            const right = Math.max(8, frame.right - rect.right);
            const below = frame.bottom - rect.bottom;
            const above = rect.top - frame.top;
            setPosition({
                host,
                fixed: host === document.body,
                right,
                ...(below >= 380 || below >= above
                    ? { top: rect.bottom - frame.top + 8, maxHeight: below - 16 }
                    : { bottom: frame.bottom - rect.top + 8, maxHeight: above - 16 })
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        searchRef.current?.focus();
        const onPointerDown = (event) => {
            if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close({ returnFocus: false });
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const toggle = (id) => {
        const key = String(id);
        onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="flex w-full items-stretch gap-2">
                <div className="min-w-0 flex-1">{children}</div>
                <button
                    ref={triggerRef}
                    type="button"
                    data-task-collaborators-trigger
                    onClick={() => (open ? close() : setOpen(true))}
                    disabled={disabled}
                    aria-label="Añadir co-responsables"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    title={disabled ? 'Elige primero el responsable' : 'Añadir co-responsables'}
                    className={cn(
                        'inline-flex w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200/70 text-zinc-500 transition-colors hover:border-brand-cyan/50 hover:text-brand-cyan-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-200/70 disabled:hover:text-zinc-500 dark:border-zinc-800/70 dark:text-zinc-300 dark:hover:text-brand-cyan sm:w-10',
                        open && 'border-brand-cyan/50 text-brand-cyan-deep dark:text-brand-cyan'
                    )}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            {selected.length > 0 && (
                <ul data-task-collaborators className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Co-responsables">
                    <li className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Con</li>
                    {selected.map((id) => {
                        const member = memberById.get(id);
                        if (!member) return null;
                        return (
                            <li key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white pl-1 pr-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                <TeamAvatar member={member} size={20} showTitle={false} className="h-5 w-5" />
                                <span className="max-w-[9rem] truncate">{member.name.split(' ')[0]}</span>
                                <button
                                    type="button"
                                    onClick={() => toggle(id)}
                                    aria-label={`Quitar a ${member.name}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                                >
                                    <X className="h-3 w-3" aria-hidden="true" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {open && position && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Co-responsables"
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
                    style={{ top: position.top, bottom: position.bottom, right: position.right, maxHeight: position.maxHeight }}
                    className={cn(
                        'brain-popover-surface z-[126] flex w-[min(18rem,calc(100vw-2rem))] flex-col p-2',
                        position.fixed ? 'fixed' : 'absolute'
                    )}
                >
                    <p className="px-2 pb-2 pt-1 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                        Cada co-responsable lleva su propio reloj. Solo el responsable cierra la tarea.
                    </p>
                    <label className="relative block">
                        <span className="sr-only">Buscar en el equipo</span>
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar en el equipo"
                            className="h-9 w-full rounded-lg border border-zinc-200/70 bg-transparent pl-8 pr-2 text-sm text-zinc-900 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:border-zinc-800/70 dark:text-zinc-100"
                        />
                    </label>
                    <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
                        {candidates.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">Nadie coincide con la búsqueda.</p>
                        ) : candidates.map((member) => {
                            const checked = selected.includes(String(member.id));
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={checked}
                                    onClick={() => toggle(member.id)}
                                    className={cn(
                                        'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-white/5 dark:focus-visible:bg-white/5',
                                        checked && 'bg-brand-cyan/10 hover:bg-brand-cyan/15 dark:bg-brand-cyan/10'
                                    )}
                                >
                                    <TeamAvatar member={member} size={28} showTitle={false} className="h-7 w-7" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{member.name}</span>
                                        {member.role && <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{member.role}</span>}
                                    </span>
                                    <span className={cn(
                                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                                        checked ? 'border-brand-cyan bg-brand-cyan text-white' : 'border-zinc-300 dark:border-zinc-600'
                                    )}>
                                        {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-1 flex justify-end border-t border-zinc-100 pt-2 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={() => close()}
                            className="min-h-9 rounded-lg px-3 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan"
                        >
                            Listo
                        </button>
                    </div>
                </div>,
                position.host
            )}
        </div>
    );
}
