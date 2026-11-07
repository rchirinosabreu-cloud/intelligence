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
import ClientOperationDialog from '@/components/modules/Clients/operations/ClientOperationDialog';
import ClientOperationPage from '@/components/modules/Clients/operations/ClientOperationPage';
import { cycleOf, evaluateClientOperation, summarizeCycle } from '@/lib/clientOperations';
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

// La ficha operativa real con la pauta adentro: cuenta cuántas veces se guardó para comprobar que un formulario de pauta no la envía.
function FichaPreview() {
  return <ClientOperationDialog client={{ id: 'martinez', name: 'Martínez y Nájera', contract: null }} team={[]} onClose={() => {}}
    onSave={async () => { window.__fichaGuardada = (window.__fichaGuardada || 0) + 1; }}
    adBudgetsSection={<ClientAdBudgets clientId="martinez" inDialog className="border-t border-zinc-100 pt-4 dark:border-white/5" />} />;
}

// La página real del cliente, para ver la pauta junto al alcance en la columna angosta de la ficha.
const TODAY = '2026-11-06';
const operationClient = {
  id: 'foobspain', name: 'Foobspain', slug: 'foobspain', agency: 'BRAIN', complexity: 'MEDIA', projectManager: { id: 'm-camila', name: 'Camila' }, communityManager: null,
  contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-10-01', endDate: '2027-03-31', cutDay: 1, deliverables: [{ format: 'Reel', quantity: 4 }], storiesPerWeek: 0, productionDays: 0, monthlyReport: true, notes: '' },
  cycles: { current: { ...summarizeCycle(cycleOf(2026, 11), [], { quota: 4, today: TODAY }), report: null, close: null } }, history: [], observations: [], openTasks: [], work: { openTasks: 0, plans: [] }
};
const nothing = () => {};
function OperationPreview() {
  return <ClientOperationPage client={operationClient} evaluation={evaluateClientOperation(operationClient, { today: TODAY })} today={TODAY} canManage currentUserId="u-keila" isAdmin
    onEditProfile={nothing} onNewTask={nothing} onOpenWorkspace={nothing} onOpenPlan={nothing} onOpenTask={nothing} onAddObservation={nothing} onDeleteObservation={nothing}
    onSaveReport={nothing} onConfirmClose={nothing} onReopenClose={nothing} onMarkPublished={nothing} onUndoPublished={nothing}
    adBudgetsSection={<ClientAdBudgets clientId="foobspain" className="mt-4 border-t border-zinc-100 pt-3 dark:border-white/5" />} />;
}

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
                      <Route path="/cliente" element={<div className="mx-auto max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><ClientAdBudgets clientId="foobspain" /></div>} />
                      <Route path="/ficha" element={<FichaPreview />} />
                      <Route path="/operacion" element={<OperationPreview />} />
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
