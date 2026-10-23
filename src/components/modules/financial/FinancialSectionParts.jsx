import React from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

// Las piezas comunes de las secciones de Financiero (Elisa, 23 de octubre de 2026: «hay inconsistencia
// con los tamaños … en cartera parecen otras fuentes, otros tamaños los textos»). Cada sección usa las
// mismas: un encabezado, las tarjetas de resumen y el selector de vistas dentro de una pestaña. Una
// sección nueva las usa; no vuelve a inventar tamaños.

/** El encabezado de una sección: el mismo de Movimientos. */
export function FinancialSectionHeader({ title, description, children }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
                {description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </div>
    );
}

const TONES = {
    neutral: 'text-zinc-900 dark:text-white',
    danger: 'text-destructive brain-destructive-text',
    warning: 'text-brand-yellow-deep dark:text-brand-yellow',
    positive: 'text-brand-green-deep dark:text-brand-green',
    accent: 'text-brand-cyan-deep dark:text-brand-cyan'
};

/** Una cifra de resumen. Con `onClick` es un filtro: se marca al estar elegida. */
export function FinancialSummaryCard({ label, value, hint, tone = 'neutral', onClick, pressed, className, ...rest }) {
    const body = (
        <>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
            <p className={cn('mt-1 text-xl font-black', TONES[tone] || TONES.neutral)}>{value}</p>
            {hint && <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
        </>
    );
    const surface = 'rounded-2xl border-zinc-200/50 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-zinc-900';
    if (!onClick) return <Card className={cn(surface, className)} {...rest}>{body}</Card>;
    return (
        <button type="button" onClick={onClick} aria-pressed={!!pressed}
            className={cn('min-h-11 rounded-2xl border bg-white p-4 text-left shadow-sm transition dark:bg-zinc-900',
                pressed ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-200/50 hover:border-zinc-300 dark:border-white/5 dark:hover:border-white/15', className)}
            {...rest}>
            {body}
        </button>
    );
}

/** Las vistas de una pestaña: Cuentas y préstamos / Directorio de clientes, Proveedores / Nómina… */
export function FinancialSubTabs({ views, active, onChange, label }) {
    if (!views || views.length < 2) return null;
    return (
        <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-900">
            {views.map((view) => (
                <button key={view.key} type="button" data-financial-view={view.key} aria-pressed={active === view.key} onClick={() => onChange(view.key)}
                    className={cn('min-h-9 rounded-lg px-3 text-sm font-medium transition',
                        active === view.key ? 'bg-primary/10 text-brand-cyan-deep dark:text-brand-cyan' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>
                    {view.label}
                </button>
            ))}
        </div>
    );
}
