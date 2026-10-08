import React from 'react';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import BrainToaster from '@/components/ui/BrainToaster';
import BriaAssistant from '@/components/bria/BriaAssistant';
import '@/index.css';

// Muestra local de «Preguntarle a Bria»: el componente real contra una API simulada que responde según
// la pregunta (scripts/preview-bria.js). `?abierta` abre el panel de entrada, `&dark` para el modo oscuro.
localStorage.setItem('authToken', 'demo-token');
const params = new URLSearchParams(location.search);
const dark = params.has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const user = { id: 'user-kamila', name: 'Kamila Pérez', role: params.get('role') === 'admin' ? 'ADMIN' : 'PROJECT_MANAGER', modulePermissions: { bria: true } };

function Where() {
  const { pathname, search } = useLocation();
  return <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400" data-preview-location>Ruta actual: {pathname}{search}</p>;
}

createRoot(document.getElementById('root')).render(
  <ConfirmDialogProvider><MemoryRouter initialEntries={['/']}>
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/80 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Brainstudio Intelligence · muestra local</span>
      <div className="flex items-center gap-2">
        <BriaAssistant currentUser={user} initialOpen={params.has('abierta')} />
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 pt-24">
      <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Cualquier pantalla</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">El botón de Bria está arriba a la derecha. Las respuestas de esta muestra son simuladas; los enlaces abren el módulo indicado.</p>
      <Routes><Route path="*" element={<Where />} /></Routes>
    </main>
    <BrainToaster />
  </MemoryRouter></ConfirmDialogProvider>
);
