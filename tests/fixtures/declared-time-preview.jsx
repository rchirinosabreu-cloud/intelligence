import React from 'react';
import { createRoot } from 'react-dom/client';
import BrainToaster from '@/components/ui/BrainToaster';
import DeclaredTimeDialog from '@/components/tasks/DeclaredTimeDialog';
import { askDeclaredTimeIfNeeded } from '@/lib/declaredTime';
import '@/index.css';

// Muestra local de «¿Cuánto te tomó?» (9 de octubre de 2026), con la API simulada. `&dark` modo oscuro.
const params = new URLSearchParams(location.search);
localStorage.setItem('authToken', 'demo');
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => (String(input).includes('/declared-time')
  ? Promise.resolve(new Response(JSON.stringify({ taskId: 't1', declaredMs: 3600000 }), { headers: { 'content-type': 'application/json' } }))
  : realFetch(input, init));

createRoot(document.getElementById('root')).render(<>
  <main className="mx-auto max-w-xl p-8 text-zinc-700 dark:text-zinc-200">
    <p>Tablero de ejemplo: la tarea se acaba de mover a Realizada.</p>
    <button type="button" className="mt-4 min-h-11 rounded-xl border px-4" onClick={() => askDeclaredTimeIfNeeded({ id: 't1', title: '[Producción] Post: Octubre de ejemplo', needsDeclaredTime: true })}>Cerrar otra vez</button>
  </main>
  <DeclaredTimeDialog />
  <BrainToaster />
</>);
setTimeout(() => askDeclaredTimeIfNeeded({ id: 't1', title: '[Producción] Post: Octubre de ejemplo', needsDeclaredTime: true }), 300);
