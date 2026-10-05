import hotToast from 'react-hot-toast';
import { toastLine } from '../../lib/toastText.js';

/**
 * Avisos con la forma `toast({ title, description, variant })` (4 de octubre de 2026).
 *
 * Siete pantallas —Kanban, panel de la tarea, Perfil, historial de logros y otras— avisan así, pero
 * el visor propio de este hook nunca se montó: ningún aviso suyo aparecía. `toast()` le
 * entrega el aviso al único visor de la plataforma, `BrainToaster`, en una sola línea
 * (`toastLine`: «Error» y otros títulos de relleno se omiten). Las pantallas no cambian.
 */

const ERROR_DURATION_MS = 6000;
const DEFAULT_DURATION_MS = 4000;

export const createToastBridge = (hot) => ({ title, description, variant, duration } = {}) => {
  const isError = variant === 'destructive';
  const show = isError ? hot.error : hot.success;
  const id = show(toastLine({ title, description }), {
    duration: duration ?? (isError ? ERROR_DURATION_MS : DEFAULT_DURATION_MS)
  });
  return {
    id,
    dismiss: () => hot.dismiss(id),
    update: (next = {}) => show(toastLine({ title: next.title ?? title, description: next.description ?? description }), { id })
  };
};

export const toast = createToastBridge(hotToast);

export function useToast() {
  return { toast, dismiss: (id) => hotToast.dismiss(id), toasts: [] };
}
