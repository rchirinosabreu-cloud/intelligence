import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock } from '@/components/ui/icons';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { DECLARED_TIME_EVENT, DECLARED_TIME_OPTIONS } from '@/lib/declaredTime';

// «¿Cuánto te tomó?» al cerrar una tarea sin cronómetro (Rodny, 9 de octubre de 2026). Uno solo para toda la
// aplicación: el tablero o el panel avisan con `askDeclaredTimeIfNeeded` cuando el servidor lo pide. No frena a
// nadie: «No lo sé» lo cierra y la tarea sigue cerrada. Lo que se elige queda como tiempo declarado, distinto del
// cronometrado, y Ritmo lo dice.
export default function DeclaredTimeDialog() {
  const [task, setTask] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const open = (event) => { setTask(event.detail); setError(''); setSaving(null); };
    window.addEventListener(DECLARED_TIME_EVENT, open);
    return () => window.removeEventListener(DECLARED_TIME_EVENT, open);
  }, []);

  const declare = async (option) => {
    setSaving(option.minutes); setError('');
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/tasks/${encodeURIComponent(task.id)}/declared-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ minutes: option.minutes })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el tiempo.');
      toast.success(`Tiempo registrado: ${option.label}`);
      setTask(null);
    } catch (failure) {
      console.error('[DeclaredTimeDialog] No se pudo guardar el tiempo:', failure.message);
      setError(failure.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => { if (!open && saving == null) setTask(null); }}>
      <DialogContent className="max-w-md" data-declared-time-dialog>
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan"><Clock className="h-5 w-5" /></div>
          <DialogTitle className="text-zinc-950 dark:text-zinc-50">¿Cuánto te tomó?</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Cerraste «{task?.title}» sin el cronómetro. Un estimado ayuda a entender tu carga y lo que toma cada tipo de trabajo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tiempo que te tomó">
          {DECLARED_TIME_OPTIONS.map((option) => (
            <button key={option.minutes} type="button" disabled={saving != null} onClick={() => declare(option)}
              className="min-h-11 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition-colors hover:border-primary hover:text-brand-cyan-deep disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:text-brand-cyan">
              {saving === option.minutes ? 'Guardando…' : option.label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="button" disabled={saving != null} onClick={() => setTask(null)} className="min-h-11 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100">
          No lo sé
        </button>
      </DialogContent>
    </Dialog>
  );
}
