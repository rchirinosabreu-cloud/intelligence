import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import ChaosMeter from '@/components/layout/ChaosMeter';
import ClientTasksWidget from '@/components/modules/ClientTasksWidget';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="always">
      <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-xl font-semibold">Espacio del cliente</h1>
          <p className="text-sm text-muted-foreground">Muestra local · API simulada · Sin conexión a producción</p>
          <div className="grid items-start gap-6 sm:grid-cols-[240px_1fr]">
            <aside aria-label="Racha de calidad"><ChaosMeter /></aside>
            <section aria-label="Tareas del cliente"><ClientTasksWidget clientId="streak-preview-client" /></section>
          </div>
        </div>
      </main>
    </MotionConfig>
  </QueryClientProvider>
);
