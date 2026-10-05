import React, { useState } from 'react';
import { Toaster, resolveValue, toast as hotToast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { cleanToastText } from '@/lib/toastText';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from '@/components/ui/icons';

/**
 * El único visor de avisos de la plataforma (Rodny, 4 de octubre de 2026: «píldora neutra»).
 *
 * Es la superficie de los menús y popovers (`brain-popover-surface`) en forma de píldora: una sola
 * línea, el color solo en el icono —verde lo que salió bien, el destructivo los errores, cian lo
 * informativo y lo que está cargando— y arriba al centro, debajo del header fijo, para no tapar
 * la campana ni el menú de cuenta. Un texto que no cabe se recorta; al tocarlo se lee entero, y
 * pasando el ratón también. Todo aviso nuevo sale de aquí: no montar otro `<Toaster/>`.
 */

/** El header mide 64 px (`h-16`); el aviso aparece 12 px debajo. */
const TOP_OFFSET_PX = 76;

const KINDS = {
  success: { Icon: CheckCircle2, tone: 'text-status-positive-fg' },
  error: { Icon: AlertCircle, tone: 'text-destructive' },
  loading: { Icon: Loader2, tone: 'text-brand-cyan-deep dark:text-brand-cyan', spin: true },
  blank: { Icon: Info, tone: 'text-brand-cyan-deep dark:text-brand-cyan' }
};

const BrainToast = ({ toast }) => {
  const [expanded, setExpanded] = useState(false);
  const kind = KINDS[toast.type] || KINDS.blank;
  const message = resolveValue(toast.message, toast);
  const text = typeof message === 'string' || typeof message === 'number' ? cleanToastText(message) : null;
  const { Icon } = kind;

  return (
    <div
      {...toast.ariaProps}
      aria-live={toast.ariaProps?.['aria-live']}
      data-toast-type={toast.type}
      className={cn(
        'brain-popover-surface pointer-events-auto flex min-h-11 w-fit max-w-[min(560px,calc(100vw-2rem))] items-center gap-2.5 py-1.5 pl-3.5 pr-1.5 text-sm',
        expanded ? '!rounded-2xl' : '!rounded-full',
        toast.visible ? 'animate-in fade-in slide-in-from-top-2 duration-200' : 'animate-out fade-out duration-150 fill-mode-forwards'
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', kind.tone, kind.spin && 'animate-spin')} aria-hidden="true" />
      <span
        className={cn('min-w-0 flex-1 font-medium text-zinc-800 dark:text-zinc-100', expanded ? 'whitespace-normal py-1 leading-5' : 'truncate')}
        title={text || undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        {text ?? message}
      </span>
      <button
        type="button"
        onClick={() => hotToast.dismiss(toast.id)}
        aria-label="Cerrar aviso"
        className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const BrainToaster = () => (
  <Toaster
    position="top-center"
    gutter={8}
    containerStyle={{ top: TOP_OFFSET_PX }}
    toastOptions={{
      duration: 4000,
      success: { duration: 4000 },
      error: { duration: 6000 }
    }}
  >
    {(toast) => <BrainToast toast={toast} />}
  </Toaster>
);

export default BrainToaster;
