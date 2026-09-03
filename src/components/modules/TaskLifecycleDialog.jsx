import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const toneStyles = {
  cyan: {
    icon: 'text-[#009EB9] dark:text-[#29B8CF]',
    focus: 'focus:border-[#009EB9] focus:ring-[#009EB9]/20',
    button: 'bg-[#009EB9] hover:bg-[#008CA4] shadow-[#009EB9]/20',
  },
  red: {
    icon: 'text-destructive',
    focus: 'focus:border-destructive focus:ring-destructive/20',
    button: 'bg-destructive hover:bg-destructive/90 shadow-destructive/20',
  },
  emerald: {
    icon: 'text-emerald-600 dark:text-emerald-400',
    focus: 'focus:border-emerald-500 focus:ring-emerald-500/20',
    button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20',
  },
};

export default function TaskLifecycleDialog({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  tone = 'cyan',
  reasons = [],
  reasonLabel,
  reasonValue,
  onReasonChange,
  noteLabel,
  noteValue,
  onNoteChange,
  notePlaceholder,
  submitLabel,
  onSubmit,
  isSubmitting = false,
}) {
  const styles = toneStyles[tone] || toneStyles.cyan;
  const hasReasons = reasons.length > 0;
  const isDisabled = isSubmitting || !String(noteValue || '').trim() || (hasReasons && !reasonValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[130]"
        className="z-[131] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-md sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
            {Icon && <Icon aria-hidden="true" className={cn('h-5 w-5 shrink-0', styles.icon)} />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {hasReasons && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{reasonLabel}</span>
              <select
                autoFocus
                value={reasonValue}
                onChange={(event) => onReasonChange?.(event.target.value)}
                className={cn(
                  'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition-shadow focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white',
                  styles.focus
                )}
              >
                {reasons.map(reason => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{noteLabel}</span>
            <textarea
              autoFocus={!hasReasons}
              value={noteValue}
              onChange={(event) => onNoteChange?.(event.target.value)}
              placeholder={notePlaceholder}
              className={cn(
                'min-h-24 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 outline-none transition-shadow focus:ring-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500',
                styles.focus
              )}
            />
          </label>
        </div>

        <DialogFooter className="gap-3 sm:justify-between">
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isDisabled}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500',
              !isDisabled && styles.button
            )}
          >
            {isSubmitting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
