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
import AdBudgets from '@/components/modules/AdBudgets/AdBudgets';
import ClientAdBudgets from '@/components/modules/AdBudgets/ClientAdBudgets';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '@/lib/taskTiming';
import { dashboardDemoUser } from './dashboardPreviewData';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local de Pautas. Servida solo por scripts/preview-ad-budgets.js: las rutas y el servicio son los de verdad, sobre
// una base en memoria que se pierde al apagar la muestra.
const user = { ...dashboardDemoUser, modulePermissions: { ...dashboardDemoUser.modulePermissions, pautas: true, parrillas: true, clientes: true } };
const previous = localStorage.getItem('authToken');
if (previous && !previous.endsWith('.ad-budgets-local')) throw new Error('Este origen ya tiene una sesión. Usa un puerto distinto para no sustituirla.');
localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 }))}.ad-budgets-local`);
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
                      <Route path="/pautas" element={<AdBudgets />} />
                      <Route path="/cliente" element={<div className="mx-auto max-w-3xl pt-8"><ClientAdBudgets clientId="foobspain" /></div>} />
                      <Route path="*" element={<Navigate to="/pautas" replace />} />
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
