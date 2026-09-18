import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import Sidebar from '@/components/layout/Sidebar';
import { ThemeProvider } from '@/context/ThemeContext';
import 'react-datepicker/dist/react-datepicker.css';
import '@/index.css';

const CrmLayout = lazy(() => import('@/components/modules/Crm/CrmLayout'));
const CrmLeadDetail = lazy(() => import('@/components/modules/Crm/CrmLeadDetail'));

// A never-expiring demo token so AuthProvider treats the session as valid; the preview API ignores it.
const demoToken = `demo.${btoa(JSON.stringify({ sub: 'user-rodny', exp: 4102444800 })).replace(/=+$/, '')}.demo`;
localStorage.setItem('authToken', demoToken);
localStorage.setItem('currentUser', JSON.stringify({ id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { crm: true } }));
if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
if (new URLSearchParams(location.search).has('dark')) localStorage.setItem('theme', 'dark'); else localStorage.setItem('theme', 'light');

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <ConfirmDialogProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-zinc-50 text-foreground dark:bg-zinc-950">
              <Sidebar isOpen={false} onClose={() => {}} />
              <main className="min-h-screen px-4 pb-16 pt-4 sm:px-6 lg:ml-64 lg:px-10">
                <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Cargando…</div>}>
                  <Routes>
                    <Route path="/crm" element={<CrmLayout />} />
                    <Route path="/crm/oportunidades/:leadId" element={<CrmLeadDetail />} />
                    <Route path="*" element={<Navigate to="/crm" replace />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
            <Toaster position="top-right" />
          </BrowserRouter>
        </ConfirmDialogProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);
