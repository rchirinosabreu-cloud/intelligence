import React, { createContext, useContext, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import ClientAvatar from '@/components/ui/ClientAvatar';
import ClientsSection from '@/components/modules/Clients/operations/ClientsSection';
import ClientOperationPage from '@/components/modules/Clients/operations/ClientOperationPage';
import ClientOperationDialog from '@/components/modules/Clients/operations/ClientOperationDialog';
import { CLIENT_AGENCIES, OPERATION_LEVELS, evaluateClientOperation, labelOf } from '@/lib/clientOperations';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '@/lib/taskTiming';
import { dashboardDemoUser } from './dashboardPreviewData';
import { TODAY, clients as demoClients, team } from './clientOperationsPreviewData';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local de «Operación de clientes» (2 de octubre de 2026). Servida solo por
// scripts/preview-client-operations.js. Lo que se toca aquí vive en memoria y no se guarda.

const previousToken = localStorage.getItem('authToken');
if (previousToken && !previousToken.endsWith('.client-operations-local')) {
  throw new Error('Este origen ya tiene una sesión. Usa un puerto distinto para no sustituirla.');
}
localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 }))}.client-operations-local`);
localStorage.setItem('currentUser', JSON.stringify(dashboardDemoUser));
markTaskTimingTutorialSeen(localStorage, dashboardDemoUser.id);
markTaskTimingTutorialAfternoonSeen(localStorage, dashboardDemoUser.id);
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
localStorage.setItem('theme', dark ? 'dark' : 'light');

const ClientsContext = createContext(null);

function ClientsStore({ children }) {
  const [clients, setClients] = useState(demoClients);
  const evaluated = useMemo(() => clients
    .map((client) => ({ client, evaluation: evaluateClientOperation(client, { today: TODAY }) }))
    .sort((a, b) => OPERATION_LEVELS.indexOf(a.evaluation.level) - OPERATION_LEVELS.indexOf(b.evaluation.level)
      || b.evaluation.reasons.length - a.evaluation.reasons.length
      || a.client.name.localeCompare(b.client.name, 'es')), [clients]);
  const update = (id, change) => setClients((list) => list.map((c) => (c.id === id ? change(c) : c)));
  return <ClientsContext.Provider value={{ evaluated, update }}>{children}</ClientsContext.Provider>;
}

// El directorio de siempre (hoy la tabla de Clientes, sin la columna de salud).
function Directory({ evaluated, onOpen }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <ul className="divide-y divide-zinc-100 dark:divide-white/5">
        {[...evaluated].sort((a, b) => a.client.name.localeCompare(b.client.name, 'es')).map(({ client }) => (
          <li key={client.id}>
            <button type="button" onClick={() => onOpen(client)} className="flex min-h-11 w-full items-center gap-3 px-6 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <ClientAvatar client={client} size={32} className="rounded-lg border border-zinc-200 dark:border-white/10" />
              <span className="min-w-0 flex-1 truncate font-semibold">{client.name}</span>
              <span className="text-xs text-zinc-500">{labelOf(CLIENT_AGENCIES, client.agency)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClientsPage() {
  const { evaluated } = useContext(ClientsContext);
  const navigate = useNavigate();
  const open = (client) => navigate(`/clientes/operacion/${client.slug}`);
  return (
    <ClientsSection canManage evaluated={evaluated} team={team} onOpenClient={open}
      directory={<Directory evaluated={evaluated} onOpen={() => toast('Abriría el espacio de trabajo del cliente, como hoy.')} />}
      onNewClient={() => toast('En la muestra no se crean clientes.')} />
  );
}

function ClientPage() {
  const { slug } = useParams();
  const { evaluated, update } = useContext(ClientsContext);
  const [editing, setEditing] = useState(false);
  const found = evaluated.find(({ client }) => client.slug === slug);
  if (!found) return <Navigate to="/clientes" replace />;
  const { client, evaluation } = found;

  const markPublished = (piece) => update(client.id, (c) => {
    const pieces = c.cycles.current.pieces.map((p) => (p.id === piece.id ? { ...p, status: 'PUBLICADO' } : p));
    const published = pieces.filter((p) => p.status === 'PUBLICADO').length;
    const overdue = pieces.filter((p) => p.date < TODAY && p.status !== 'PUBLICADO').length;
    const r = c.cycles.current.reached;
    const lift = (n) => Math.max(n, published);
    return { ...c, cycles: { ...c.cycles, current: { ...c.cycles.current, pieces, overdueItems: overdue, reached: { redactada: lift(r.redactada), disenada: lift(r.disenada), aprobada: lift(r.aprobada), programada: lift(r.programada), publicada: published } } } };
  });
  const markReport = (month) => update(client.id, (c) => {
    const report = { deliveredAt: TODAY, by: dashboardDemoUser.name };
    const history = c.history.map((m) => (m.label === month.label ? { ...m, report } : m));
    const previous = c.cycles.previous?.label === month.label ? { ...c.cycles.previous, report } : c.cycles.previous;
    return { ...c, history, cycles: { ...c.cycles, previous } };
  });

  return (
    <>
      <ClientOperationPage client={client} evaluation={evaluation} today={TODAY} canManage
        onEditProfile={() => setEditing(true)}
        onMarkPublished={(piece) => { markPublished(piece); toast.success(`«${piece.title}» quedó como publicada.`); }}
        onMarkReport={(month) => { markReport(month); toast.success(`Informe de ${month.label.toLowerCase()} marcado como entregado.`); }}
        onOpenPlan={() => toast(`Abriría la parrilla de ${client.name}.`)}
        onNewTask={() => toast(`Abriría «Nueva tarea» con ${client.name} ya elegido.`)}
        onOpenWorkspace={() => toast('Abriría el espacio de trabajo del cliente, como hoy.')} />
      {editing && (
        <ClientOperationDialog client={client} team={team} onClose={() => setEditing(false)}
          onSave={async ({ projectManagerId, communityManagerId, renew: _renew, contract, ...profile }) => {
            const member = (id) => team.find((m) => m.id === id) || null;
            update(client.id, (c) => ({ ...c, ...profile, contract, projectManager: member(projectManagerId), communityManager: member(communityManagerId) }));
            setEditing(false);
            toast.success('Ficha guardada (solo en la muestra).');
          }} />
      )}
    </>
  );
}

// Como en App.jsx: la plataforma solo se pinta con la sesión ya cargada.
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
              <ClientsStore>
                <Routes>
                  <Route path="*" element={<SignedIn>
                    <AppLayout>
                      <Routes>
                        <Route path="/clientes" element={<ClientsPage />} />
                        <Route path="/clientes/operacion/:slug" element={<ClientPage />} />
                        <Route path="*" element={<Navigate to="/clientes" replace />} />
                      </Routes>
                    </AppLayout>
                  </SignedIn>} />
                </Routes>
              </ClientsStore>
              <Toaster position="top-right" toastOptions={{ className: 'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 border' }} />
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ConfirmDialogProvider>
  </MotionConfig>
);
