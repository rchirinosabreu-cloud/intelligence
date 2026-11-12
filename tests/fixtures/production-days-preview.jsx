import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrainToaster from '@/components/ui/BrainToaster';
import TaskProductionEvidence from '@/components/tasks/TaskProductionEvidence';
import ProductionDaysSection from '@/components/modules/Clients/operations/ProductionDaysSection';
import ProductionDaysBoard from '@/components/modules/Clients/operations/ProductionDaysBoard';
import '@/index.css';

// Muestra local de las jornadas de producción (10–11 de noviembre de 2026): el bloque del pendiente en Gestión y la
// sección de la página del cliente. La API la simula el recorrido de navegador; no hay servidor de negocio.
const production = {
  label: 'Noviembre', start: '2026-11-01', end: '2026-11-30', contracted: 2, scheduled: 3, done: 1,
  items: [
    { id: 'a', eventId: 'ev-a', taskId: 'task-a', date: '2026-11-03', title: 'Jornada de producción Multik', state: 'REALIZADA', evidenceUrl: 'https://drive.google.com/drive/folders/muestra' },
    { id: 'b', eventId: 'ev-b', taskId: 'task-b', date: '2026-11-06', title: 'Jornada de producción Multik | Casa de Francisco', state: 'SIN_EVIDENCIA' },
    { id: 'c', eventId: 'ev-c', taskId: 'task-c', date: '2026-11-24', title: 'Jornada Multik', state: 'AGENDADA' },
  ],
  missingEvidence: [{ id: 'b', eventId: 'ev-b', date: '2026-11-06' }],
};
const CARD = 'rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:p-6';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}><BrowserRouter>
    <main className="min-h-screen space-y-6 bg-background p-6 text-foreground">
      {new URLSearchParams(window.location.search).has('mes') ? <ProductionDaysBoard /> : null}
      <div className="mx-auto max-w-3xl space-y-6" hidden={new URLSearchParams(window.location.search).has('mes')}>
        <div className={CARD}><TaskProductionEvidence taskId="task-b" /></div>
        <ProductionDaysSection production={production} cardClassName={CARD} titleClassName="text-base font-semibold" />
      </div>
    </main>
    <BrainToaster />
  </BrowserRouter></QueryClientProvider>
);
