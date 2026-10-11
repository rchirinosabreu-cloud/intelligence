import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import MailboxConnections from '@/components/modules/Activity/MailboxConnections';
import '@/index.css';

// Muestra local de «Buzones que lee Bria» (11 de octubre de 2026): la tarjeta real contra la API simulada de
// scripts/preview-bria.js. `?pm` la muestra como la ve un project manager (sin conectar), `&dark` en oscuro.
localStorage.setItem('authToken', 'demo-token');
const params = new URLSearchParams(location.search);
const dark = params.has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient()}><ConfirmDialogProvider><MemoryRouter initialEntries={['/']}>
    <main className="mx-auto max-w-2xl px-4 pt-10">
      <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Actividad · conexiones</h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">La tarjeta vive junto a las cuentas de Google Calendar. Las respuestas son simuladas.</p>
      <MailboxConnections isAdmin={!params.has('pm')} />
    </main>
    <BrainToaster />
  </MemoryRouter></ConfirmDialogProvider></QueryClientProvider>
);
