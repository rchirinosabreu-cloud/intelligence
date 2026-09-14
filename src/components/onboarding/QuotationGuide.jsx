import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from '@/components/ui/icons';

const steps = [
  {
    title: 'Empieza con el cliente',
    description: 'Desde «Nueva Cotización», elige quién emite la propuesta y completa los datos de la empresa y del contacto.',
    exampleTitle: 'Datos de la propuesta',
    rows: [['Empresa', 'Cliente de ejemplo'], ['Contacto', 'Andrea · contacto@ejemplo.test'], ['Emisor', 'Brain Studio']],
    tip: 'Revisa los datos antes de avanzar. Serán parte de la propuesta que reciba el cliente.',
  },
  {
    title: 'Define lo que vas a ofrecer',
    description: 'Añade servicios del catálogo o usa «Añadir servicio personalizado». Describe el alcance y el tiempo de cada etapa.',
    exampleTitle: 'Un proyecto, dos etapas',
    rows: [['Diagnóstico y estrategia', '2 semanas'], ['Implementación', '4 semanas']],
    tip: 'Un servicio personalizado solo vive en esa propuesta. No crea un producto en el catálogo.',
  },
  {
    title: 'Organiza los pagos',
    description: 'En «Plan de pagos», define cuotas por porcentaje o importe y cuándo se pagan: en una fecha o al cumplir un hito.',
    exampleTitle: 'Ejemplo de distribución',
    rows: [['Al iniciar', '50 %'], ['Al entregar', '50 %']],
    tip: 'Las cuotas deben sumar el total. Las etapas explican el trabajo; las cuotas, el pago. Definirlas no registra un cobro.',
  },
  {
    title: 'Revisa antes de compartir',
    description: 'Comprueba servicios, total y condiciones. Puedes guardar un borrador y, cuando esté listo, usar «Emitir Propuesta».',
    exampleTitle: 'Antes de enviarla',
    rows: [['Alcance y tiempos', 'Claros para el cliente'], ['Total y cuotas', 'Coinciden'], ['Condiciones y referencias', 'Revisadas']],
    tip: 'Después de emitirse, abre «Ver Propuesta» para revisar la vista del cliente y comparte su enlace. Esta guía no emite ni envía nada.',
  },
];

// Explanatory walkthrough: it never edits or emits a quotation.
export default function QuotationGuide({ open, onDismiss, returnFocusRef, preview = false, busy = false, error = '' }) {
  const [step, setStep] = useState(0);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const current = steps[step];
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);
  return <Dialog open={open} onOpenChange={next => { if (!next && !busy) onDismiss('skipped'); }}>
    <DialogContent showCloseButton={false} data-onboarding-dialog="cotizaciones"
      overlayClassName="z-[70] motion-reduce:!animate-none"
      className="z-[71] flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 text-zinc-900 motion-reduce:!animate-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-xl"
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      onInteractOutside={event => event.preventDefault()}>
      <div className="brain-ai-header relative flex shrink-0 items-center gap-3 px-5 py-5 pr-14 text-white sm:px-6 sm:pr-14">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white" aria-hidden="true"><img src="/brainstudio-mascot-tip.png" alt="" className="h-11 w-11 object-contain" /></span>
        <div className="space-y-1.5">
          <DialogTitle className="text-lg leading-6 text-white">Cotizaciones, paso a paso</DialogTitle>
          <DialogDescription className="text-sm leading-5 text-white/95">Con Bria · 4 pasos para empezar</DialogDescription>
        </div>
        <DialogClose asChild><button disabled={busy} type="button" aria-label="Cerrar guía" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"><X className="h-4 w-4" /></button></DialogClose>
      </div>
      <div ref={bodyRef} className="min-h-0 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">
        {error && <p role="alert" className="mb-3 text-sm leading-6 text-destructive">{error}</p>}
        <div className="flex items-center gap-4">
          <p className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400" aria-live="polite">Paso {step + 1} de {steps.length}</p>
          <div className="flex flex-1 gap-1.5" aria-hidden="true">{steps.map((item, index) => <span key={item.title} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-teal-600 dark:bg-teal-400' : 'bg-zinc-100 dark:bg-zinc-800'}`} />)}</div>
        </div>
        <h2 ref={titleRef} tabIndex={-1} className="mt-5 text-xl font-semibold leading-7 tracking-tight outline-none">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{current.description}</p>
        <section aria-label={current.exampleTitle} className="mt-5 rounded-xl bg-zinc-50 px-4 py-4 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{current.exampleTitle}</h3><span className="text-xs text-zinc-500 dark:text-zinc-400">Ejemplo · no editable</span></div>
          <dl className="mt-3 divide-y divide-zinc-200/70 dark:divide-zinc-800">{current.rows.map(([label, value]) => <div key={label} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><dt className="text-zinc-500 dark:text-zinc-400">{label}</dt><dd className="break-words font-medium sm:text-right">{value}</dd></div>)}</dl>
        </section>
        <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{current.tip}</p>
      </div>
      <footer className="shrink-0 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button disabled={busy} variant="ghost" size="lg" className="px-2 font-medium text-zinc-600 dark:text-zinc-300" onClick={() => onDismiss('skipped')}>Omitir guía</Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="lg" className="px-3" disabled={busy || step === 0} onClick={() => setStep(value => value - 1)}>Atrás</Button>
            <Button disabled={busy} size="lg" className="px-4" onClick={() => step === steps.length - 1 ? onDismiss('completed') : setStep(value => value + 1)}>{step === steps.length - 1 ? 'Finalizar guía' : 'Siguiente'}</Button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Puedes volver a abrirla desde «Ver guía».{preview ? ' Solo es una muestra local.' : ''}</p>
      </footer>
    </DialogContent>
  </Dialog>;
}
