import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle, CheckCircle2 } from '@/components/ui/icons';

const ConfirmDialogContext = createContext(null);

export const useConfirmDialog = () => {
  const confirm = useContext(ConfirmDialogContext);
  if (!confirm) throw new Error('useConfirmDialog must be used inside ConfirmDialogProvider');
  return confirm;
};
export const ConfirmDialogProvider = ({ children }) => {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    const normalized = typeof options === 'string' ? { description: options } : options;
    setRequest({
      title: normalized.title || 'Confirmar acción',
      description: normalized.description || 'Esta acción no se puede deshacer.',
      confirmLabel: normalized.confirmLabel || 'Eliminar',
      cancelLabel: normalized.cancelLabel || 'Cancelar',
      tone: normalized.tone || 'danger',
      resolve
    });
  }), []);

  const closeDialog = useCallback((accepted) => {
    setRequest((current) => {
      current?.resolve(Boolean(accepted));
      return null;
    });
  }, []);

  const contextValue = useMemo(() => confirm, [confirm]);
  const DialogIcon = request?.tone === 'danger' ? AlertTriangle : CheckCircle2;

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <AlertDialog.Root
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open && request) closeDialog(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${request?.tone === 'danger' ? 'bg-rose-50 text-[#E11D48] dark:bg-rose-500/10' : 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300'}`}>
                <DialogIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialog.Title className="text-base font-semibold text-slate-950 dark:text-slate-50">
                  {request?.title}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {request?.description}
                </AlertDialog.Description>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => closeDialog(false)}
                >
                  {request?.cancelLabel}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${request?.tone === 'danger' ? 'bg-[#E11D48] hover:bg-[#BE123C] focus-visible:ring-rose-500' : 'bg-violet-600 hover:bg-violet-700 focus-visible:ring-violet-500'}`}
                  onClick={() => closeDialog(true)}
                >
                  {request?.confirmLabel}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmDialogContext.Provider>
  );
};
