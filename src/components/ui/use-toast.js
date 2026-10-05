import { createElement } from 'react';
import hotToast from 'react-hot-toast';

/**
 * Avisos con la forma `toast({ title, description, variant })` (4 de octubre de 2026).
 *
 * Siete pantallas —Kanban, panel de la tarea, Perfil, historial de logros y otras— avisan así, pero
 * el `<Toaster/>` propio de este hook nunca se montó en la aplicación: ningún aviso suyo aparecía,
 * tampoco los de error («No se pudo reintegrar la tarea»). La aplicación monta un solo visor de
 * avisos, el de react-hot-toast en `App.jsx`, así que `toast()` le entrega el aviso a ese y todos
 * los avisos de la plataforma se ven igual. Las pantallas no cambian.
 */

const ERROR_DURATION_MS = 6000;
const DEFAULT_DURATION_MS = 4000;

const content = (title, description) => createElement(
  'span',
  { className: 'block min-w-0' },
  title ? createElement('span', { className: 'block font-semibold' }, title) : null,
  description ? createElement('span', { className: 'mt-0.5 block text-sm opacity-80' }, description) : null
);

export const createToastBridge = (hot) => ({ title, description, variant, duration } = {}) => {
  const isError = variant === 'destructive';
  const show = isError ? hot.error : hot.success;
  const id = show(content(title, description), {
    duration: duration ?? (isError ? ERROR_DURATION_MS : DEFAULT_DURATION_MS)
  });
  return {
    id,
    dismiss: () => hot.dismiss(id),
    // Nadie lo usa hoy; se conserva la forma de antes cambiando el contenido del mismo aviso.
    update: (next = {}) => show(content(next.title ?? title, next.description ?? description), { id })
  };
};

export const toast = createToastBridge(hotToast);

export function useToast() {
  return { toast, dismiss: (id) => hotToast.dismiss(id), toasts: [] };
}
