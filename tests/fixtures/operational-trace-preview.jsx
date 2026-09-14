import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OperationalTracePanel from '@/components/modules/OperationalTracePanel';
import '@/index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}><BrowserRouter>
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <p className="text-sm text-muted-foreground">Muestra local · Datos simulados, sin conexión a producción.</p>
      <OperationalTracePanel />
    </main>
  </BrowserRouter></QueryClientProvider>
);
