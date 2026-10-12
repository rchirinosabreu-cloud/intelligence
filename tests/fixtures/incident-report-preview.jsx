import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AuthProvider } from '../../src/context/AuthContext';
import SidebarProfile from '../../src/components/layout/SidebarProfile';
import BrainToaster from '../../src/components/ui/BrainToaster';
import { getNotificationDisplayParts } from '../../src/utils/notificationUtils';
import '../../src/index.css';
import { startPreviewSession } from './previewSession.js';

// Muestra local de «Reportar un incidente» (12 de octubre de 2026): el menú de cuenta real, la ruta y el
// servicio reales sobre la base sintética. Los avisos a administración se listan aquí en vez de enviarse.
const params = new URLSearchParams(window.location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
startPreviewSession({ id: 'gov-editor', name: 'Prueba Editor', role: 'EDITOR' });
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function AdminNotices() {
  const { data = [] } = useQuery({ queryKey: ['preview-notifications'], queryFn: () => fetch('/api/preview/notifications').then((r) => r.json()), refetchInterval: 1000 });
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900" data-preview-admin-notices>
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Avisos que recibiría administración (campana y celular)</h2>
      {data.length === 0 ? <p className="mt-2 text-zinc-500 dark:text-zinc-400">Todavía ninguno.</p> : (
        <ul className="mt-2 space-y-2">{data.map((n, i) => {
          const parts = getNotificationDisplayParts(n);
          return <li key={i} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><p className="font-medium text-zinc-900 dark:text-zinc-50">{parts.title}</p><p className="text-zinc-600 dark:text-zinc-300">{parts.body}</p><p className="text-xs text-zinc-500 dark:text-zinc-400">Para {n.userId} · abre {n.url}</p></li>;
        })}</ul>
      )}
    </section>
  );
}

function Preview() {
  return (
    <QueryClientProvider client={cache}>
      <BrowserRouter>
        <AuthProvider>
          <BrainToaster />
          <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <aside className="w-64 shrink-0 border-r border-zinc-200 pt-6 dark:border-white/5"><SidebarProfile /></aside>
            <main className="min-w-0 flex-1 space-y-4 p-6">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Muestra local · Base de datos sintética · Sin correos, push ni proveedores externos. Entra como «Prueba Editor», sin acceso a Gobierno de IA.</p>
              <AdminNotices />
            </main>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')).render(<Preview />);
