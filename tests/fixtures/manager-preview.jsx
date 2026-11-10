import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import Sidebar from '@/components/layout/Sidebar';
import { ThemeProvider } from '@/context/ThemeContext';
import 'react-datepicker/dist/react-datepicker.css';
import '@/index.css';

// Muestra local de Manager → Decisiones con el marco de la plataforma. `?dark` abre en modo oscuro.
const ManagerTaskAnalytics = lazy(() => import('@/components/modules/ManagerTaskAnalytics'));

const demoToken = `demo.${btoa(JSON.stringify({ sub: 'user-rodny', exp: 4102444800 })).replace(/=+$/, '')}.demo`;
localStorage.setItem('authToken', demoToken);
localStorage.setItem('currentUser', JSON.stringify({ id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { manager: true, gestion: true, clientes: true, bria: true } }));
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
localStorage.setItem('theme', dark ? 'dark' : 'light');

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <ConfirmDialogProvider>
          <BrowserRouter>
            <div className="brain-ambient min-h-screen text-foreground">
              <Sidebar isOpen={false} onClose={() => {}} />
              <main className="min-h-screen lg:ml-64">
                <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Cargando…</div>}>
                  <Routes>
                    <Route path="/manager" element={<ManagerTaskAnalytics />} />
                    <Route path="*" element={<Navigate to="/manager" replace />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
            <BrainToaster />
          </BrowserRouter>
        </ConfirmDialogProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);
