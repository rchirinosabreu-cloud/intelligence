import React from 'react';
import { createRoot } from 'react-dom/client';
import { toast as hotToast } from 'react-hot-toast';
import BrainToaster from '@/components/ui/BrainToaster';
import { useToast } from '@/components/ui/use-toast';
import '@/index.css';

// Muestra local de los avisos (4 de octubre de 2026): el visor real de la plataforma (`BrainToaster`)
// debajo de un header como el de la aplicación, con los avisos que dan el Kanban, Financiero y Minutas.
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const Demo = () => {
  const { toast } = useToast();
  const buttons = [
    ['ok', 'Éxito', () => toast({ title: 'Tarea reintegrada', description: 'La tarea volvió a Pendiente.' })],
    ['error', 'Error', () => toast({ variant: 'destructive', title: 'Error', description: 'No se pudo reintegrar la tarea.' })],
    ['info', 'Informativo', () => hotToast('Este movimiento lo creó un abono: se corrige en Cartera.')],
    ['loading', 'Cargando', () => hotToast.loading('Subiendo la pieza final…')],
    ['long', 'Largo', () => hotToast.error('No se pudo guardar el desglose porque la suma no coincide con el valor del pago registrado en la cuenta.')]
  ];
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/50 px-6 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/50">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Gestión</span>
        <span className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </header>
      <main className="brain-ambient min-h-screen px-6 pb-8" style={{ paddingTop: '22rem' }}>
        <div className="flex flex-wrap gap-2">
          {buttons.map(([id, label, run]) => (
            <button key={id} id={id} type="button" onClick={run} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">{label}</button>
          ))}
        </div>
      </main>
    </>
  );
};

createRoot(document.getElementById('root')).render(
  <>
    <Demo />
    <BrainToaster />
  </>
);
