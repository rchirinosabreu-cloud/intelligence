import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import AutomaticMinutesPanel from '@/components/modules/Minutes/AutomaticMinutesPanel';
import '@/index.css';

// Muestra local del archivo de minutas (14 de octubre de 2026): el panel real contra la API simulada de
// scripts/preview-bria.js, con una reunión cuyos compromisos ya son pendientes en parte. `?dark` en oscuro.
localStorage.setItem('authToken', 'demo-token');
const params = new URLSearchParams(location.search);
const dark = params.has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient()}><ConfirmDialogProvider><MemoryRouter initialEntries={['/minutas']}>
    <main className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Minutas</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">Las respuestas son simuladas. «Preparar pendientes con Bria» deja la petición escrita en el chat de Bria.</p>
      <AutomaticMinutesPanel />
    </main>
    <BrainToaster />
  </MemoryRouter></ConfirmDialogProvider></QueryClientProvider>
);
