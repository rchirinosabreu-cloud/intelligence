import React from 'react';
import { cn } from '@/lib/utils';

/**
 * El interruptor COP / USD de la plataforma. Nació en Cotizaciones («Resumen y
 * Ajustes») y vive aquí para que toda elección de moneda sea el mismo control (Rodny,
 * 30 de septiembre de 2026: «usa ese mismo interruptor que ya tenemos, para que sea
 * unificado»).
 *
 * `bordered` le pone el borde fino de los campos de formulario, para cuando va entre
 * ellos, como en la cuenta de cobro. Es un grupo de opciones: se anuncia como tal y se
 * maneja con las flechas.
 */
const CURRENCIES = ['COP', 'USD'];

export default function CurrencyToggle({ value, onChange, bordered = false, ariaLabel = 'Moneda', className, options = CURRENCIES }) {
    const handleKeyDown = (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const next = options[(options.indexOf(value) + step + options.length) % options.length];
        onChange(next);
        event.currentTarget.querySelector(`[data-currency="${next}"]`)?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            onKeyDown={handleKeyDown}
            className={cn(
                'inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800',
                bordered && 'border border-zinc-200 dark:border-white/10',
                className
            )}
        >
            {options.map((currency) => {
                const selected = value === currency;
                return (
                    <button
                        key={currency}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected ? 0 : -1}
                        data-currency={currency}
                        onClick={() => onChange(currency)}
                        className={cn(
                            'rounded-md px-2 py-1 text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                            selected ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500'
                        )}
                    >
                        {currency}
                    </button>
                );
            })}
        </div>
    );
}
