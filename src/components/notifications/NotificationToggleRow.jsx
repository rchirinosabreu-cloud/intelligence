import React from 'react';
import { Loader2, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Una línea, un interruptor (Rodny, 26 de octubre de 2026: «debería ser un switch, y estar
// a una línea, sin descripción»). La describe su propio nombre; el párrafo de ayuda solo
// aparece en Perfil, y solo cuando algo impide encenderlo y hay que explicar por qué.

const NotificationToggleRow = ({
  icon: Icon,
  label,
  checked = false,
  busy = false,
  disabled = false,
  note = null,
  onToggle,
  onDismiss,
  dismissLabel = 'No mostrar esto aquí',
  testId
}) => (
  // `shrink-0`: dentro del panel, que es una columna flexible de alto acotado, una fila sin
  // él se encoge por debajo de su contenido y lo derrama encima de la lista de avisos.
  <div data-notification-toggle={testId} className="shrink-0 border-b border-zinc-100 px-3 dark:border-zinc-800">
    <div className="flex items-center gap-2.5">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-50">{label}</span>
      {onDismiss && (
        <button
          type="button"
          data-notification-toggle-dismiss={testId}
          aria-label={`${dismissLabel}: ${label}`}
          title={dismissLabel}
          onClick={(event) => { event.preventDefault(); onDismiss(); }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        role="switch"
        data-notification-toggle-switch={testId}
        aria-checked={checked}
        aria-label={label}
        disabled={busy || disabled}
        onClick={(event) => { event.preventDefault(); onToggle?.(); }}
        className="flex h-11 w-11 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden="true" />
        ) : (
          <span className={cn(
            'relative h-4 w-7 shrink-0 rounded-full transition-colors',
            checked ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600'
          )}>
            <span className={cn(
              'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all',
              checked ? 'left-3.5' : 'left-0.5'
            )} />
          </span>
        )}
      </button>
    </div>
    {/* Alineada bajo la etiqueta: el icono mide 16 px y el hueco 10. `ml-6.5` no existe
      * en la escala de Tailwind y no genera nada, como `dark:bg-white/2`. */}
    {note && <p data-notification-toggle-note className="-mt-1 mb-2 ml-[26px] text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{note}</p>}
  </div>
);

export default NotificationToggleRow;
