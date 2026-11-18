import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import AppLayout from '@/components/layout/AppLayout';
import BrainToaster from '@/components/ui/BrainToaster';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import ClientsSection from '@/components/modules/Clients/operations/ClientsSection';
import DigitalIdentityWidget from '@/components/modules/DigitalIdentityWidget';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '@/lib/taskTiming';
import { dashboardDemoUser } from './dashboardPreviewData';
import '@/index.css';

// Muestra local de Marcas. Servida solo por scripts/preview-brands.js: la pestaña dentro de la sección real de
// Clientes. `?dir` la muestra como la ve dirección (con Operación, Jornadas y Equipo); sin él, como un editor.
const user = { ...dashboardDemoUser, role: 'EDITOR', modulePermissions: { dashboard: true, gestion: true, clientes: true } };
const asManager = new URLSearchParams(location.search).has('dir');
const directory = <p className="brain-type-help">(El directorio de clientes de siempre.)</p>;
const previous = localStorage.getItem('authToken');
if (previous && !previous.endsWith('.brands-local')) throw new Error('Este origen ya tiene una sesión. Usa un puerto distinto para no sustituirla.');
localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 }))}.brands-local`);
localStorage.setItem('currentUser', JSON.stringify(user));
markTaskTimingTutorialSeen(localStorage, user.id);
markTaskTimingTutorialAfternoonSeen(localStorage, user.id);
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
localStorage.setItem('theme', dark ? 'dark' : 'light');

function SignedIn({ children }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading || !currentUser) return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Cargando…</div>;
  return children;
}

// Como en main.jsx: el fetch de la plataforma lleva la sesión; una <img> o un <a> no. La muestra exige el
// token igual que producción, así que un archivo pedido sin él falla aquí también.
const originalFetch = window.fetch;
window.fetch = (resource, config = {}) => {
    const url = typeof resource === 'string' ? resource : resource.url;
    if (url.includes('/api/')) {
        const headers = new Headers(config.headers || {});
        headers.set('Authorization', 'Bearer muestra');
        return originalFetch(resource, { ...config, headers });
    }
    return originalFetch(resource, config);
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <ConfirmDialogProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Routes>
                <Route path="*" element={<SignedIn>
                  <AppLayout>
                    <Routes>
                      <Route path="/clientes" element={<ClientsSection canManage={asManager} evaluated={[]} team={[]} directory={directory} onOpenClient={() => {}} />} />
                      <Route path="/widget" element={<div className="mx-auto max-w-sm pt-8"><DigitalIdentityWidget client={{ id: 'c1', name: 'Aristea', slug: 'aristea' }} /></div>} />
                      <Route path="*" element={<Navigate to="/clientes?tab=marcas" replace />} />
                    </Routes>
                  </AppLayout>
                </SignedIn>} />
              </Routes>
              <BrainToaster />
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ConfirmDialogProvider>
  </MotionConfig>
);
