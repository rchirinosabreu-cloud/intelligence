import BriaNoticeHeader from '@/components/bria/BriaNoticeHeader';
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, ClockPlus, Lock } from '@/components/ui/icons';
import { bogotaTimeOf } from '@/lib/taskFocus';

/**
 * Aviso que explica el compromiso con hora la primera vez que la persona ve cada uno
 * (Rodny, 22 de septiembre de 2026). Misma forma que el tutorial del cronómetro: cabecera con degradado
 * y mascota, tres puntos y una nota de cierre.
 */
export default function FocusCommitmentNotice({ task, open, onClose }) {
  const time = bogotaTimeOf(task?.focusDeadlineAt);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-focus-commitment-notice
        overlayClassName="z-[190]"
        className="z-[200] max-h-[calc(100vh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-xl"
      >
        <BriaNoticeHeader
          mood="pensando"
          badge="Compromiso"
          title={<>Tienes un compromiso{time ? ` hasta las ${time}` : ''}</>}
          description={task?.title
            ? <>«{task.title}» es tu prioridad hasta que la termines. Así funciona mientras tanto.</>
            : 'Esta tarea es tu prioridad hasta que la termines. Así funciona mientras tanto.'}
        />
        <div className="space-y-4 px-6 pb-5 pt-6">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan"><Clock className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Es lo único que trabajas{time ? ` hasta las ${time}` : ''}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">La verás con un reloj en la tarjeta. Puedes moverla entre Pendiente, En proceso y Realizado con normalidad.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300"><Lock className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Tus demás pendientes esperan</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Se ven atenuados y no se abren ni se mueven. Vuelven solos cuando marques el compromiso como realizado.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Lo que ya tenías en proceso puedes terminarlo</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Si estabas trabajando en algo cuando llegó el compromiso, ciérralo con calma. Después sigues con este.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan"><ClockPlus className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Si ves que no llegas, pide más tiempo</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Con el botón del reloj en la tarea: eliges cuánto tiempo más necesitas y explicas el motivo. El tiempo se añade al momento y avisamos a quien te lo puso.</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Si pasa la hora sin terminarla:</strong> te pediremos el motivo y cuánto tiempo más necesitas antes de que puedas seguir con otra cosa.
          </div>
        </div>
        <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <Button onClick={onClose} className="w-full sm:w-auto">Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
