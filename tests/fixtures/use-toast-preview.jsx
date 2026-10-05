import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { useToast } from '@/components/ui/use-toast';
import '@/index.css';

// Muestra local de los avisos de `useToast()` (4 de octubre de 2026): el mismo visor y las mismas
// opciones que monta `App.jsx`, y los avisos reales que dan el Kanban y el panel de la tarea.
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const Demo = () => {
  const { toast } = useToast();
  return (
    <main className="p-8">
      <button id="error" type="button" className="mr-3 rounded-lg border px-3 py-2 text-sm dark:text-zinc-100" onClick={() => toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reintegrar la tarea.' })}>Error</button>
      <button id="ok" type="button" className="rounded-lg border px-3 py-2 text-sm dark:text-zinc-100" onClick={() => toast({ title: 'Tarea reintegrada', description: 'La tarea volvió a Pendiente para continuar la corrección.' })}>Éxito</button>
    </main>
  );
};

createRoot(document.getElementById('root')).render(
  <>
    <Demo />
    <Toaster position="top-right" toastOptions={{ className: 'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 border' }} />
  </>
);
