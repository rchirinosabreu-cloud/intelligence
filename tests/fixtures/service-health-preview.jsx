import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import ServiceHealthPanel from '@/components/modules/ServiceHealthPanel';
import '@/index.css';

// Muestra local del semáforo de servicios: el panel real contra la ruta real con datos simulados
// (scripts/preview-service-health.js). `?escenario=bien|problemas`, `&dark` para el modo oscuro.
const demoToken = `demo.${btoa(JSON.stringify({ sub: 'user-rodny', exp: 4102444800 })).replace(/=+$/, '')}.demo`;
localStorage.setItem('authToken', demoToken);
localStorage.setItem('currentUser', JSON.stringify({ id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN' }));
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
        <h1 className="mb-6 text-3xl font-bold text-zinc-950 dark:text-white">Salud Operativa</h1>
        <ServiceHealthPanel />
      </main>
      <Toaster />
    </AuthProvider>
  </QueryClientProvider>
);
