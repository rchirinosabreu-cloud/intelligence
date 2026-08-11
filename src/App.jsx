
import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Login from './components/Login';
import ForcePasswordChange from './components/ForcePasswordChange';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Dashboard = lazy(() => import('./components/modules/Dashboard'));
const NativeTasks = lazy(() => import('./components/modules/NativeTasks'));
const Clients = lazy(() => import('./components/modules/Clients'));
const ClientDetailWrapper = lazy(() => import('./components/modules/ClientDetailWrapper'));
const Team = lazy(() => import('./components/modules/Team'));
const Profile = lazy(() => import('./components/modules/Profile'));
const ContentGrids = lazy(() => import('./components/modules/ContentGrids'));
const ContentPlanDetail = lazy(() => import('./components/modules/ContentPlanDetail'));
const FinancialDashboard = lazy(() => import('./components/modules/FinancialDashboard'));
const TalentRadar = lazy(() => import('./components/modules/TalentRadar'));
const BrainCore = lazy(() => import('./components/modules/BrainCore'));
const Activity = lazy(() => import('./components/modules/Activity'));
const GoogleCalendarCallback = lazy(() => import('./components/modules/Activity/GoogleCalendarCallback'));
const Reports = lazy(() => import('./components/modules/Reports'));
const MoodboardDashboard = lazy(() => import('./components/modules/Moodboard/MoodboardDashboard'));
const MoodboardCanvas = lazy(() => import('./components/modules/Moodboard/MoodboardCanvas'));
const PrivacyPolicy = lazy(() => import('./components/public/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/public/TermsOfService'));
const SharedContentPlan = lazy(() => import('./components/public/SharedContentPlan'));
const QuotationForm = lazy(() => import('./components/modules/Quotations/QuotationForm'));
const QuotationsLayout = lazy(() => import('./components/modules/Quotations/QuotationsLayout'));
const PublicQuotation = lazy(() => import('./components/public/Quotations/PublicQuotation'));
const MinutesLayout = lazy(() => import('./components/modules/Minutes/MinutesLayout'));

const AppLoader = () => (
  <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 flex items-center justify-center text-sm font-medium">
    Cargando...
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    },
  },
});

function ModuleGuard({ module, children }) {
  const { currentUser } = useAuth();

  if (!currentUser) return <Navigate to="/login" replace />;

  // ADMIN has full access bypass
  if (currentUser.role === 'ADMIN') return children;

  const permissions = currentUser.modulePermissions || {};
  if (permissions[module] !== true) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent() {
  const { login, logout, currentUser, isAuthenticated, isLoading } = useAuth();

  // Escuchar errores de permisos (403 Forbidden)
  React.useEffect(() => {
    const handleForbidden = () => {
      toast.error('No tienes permisos para realizar esta acción', {
        id: 'forbidden-error', // Prevenir duplicados
      });
    };

    const handleAiError = () => {
      toast.error('Error de IA: No se pudo procesar la solicitud', {
        id: 'ai-service-error',
      });
    };

    window.addEventListener('auth-forbidden', handleForbidden);
    window.addEventListener('ai-error', handleAiError);
    return () => {
      window.removeEventListener('auth-forbidden', handleForbidden);
      window.removeEventListener('ai-error', handleAiError);
    };
  }, []);

  if (isLoading) {
    return <AppLoader />;
  }

  if (isAuthenticated && currentUser?.mustChangePassword) {
    return (
      <ThemeProvider>
        <Router>
          <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route path="/cambiar-password" element={<ForcePasswordChange />} />
            <Route path="*" element={<Navigate to="/cambiar-password" replace />} />
          </Routes>
          </Suspense>
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 border',
            }}
          />
        </Router>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Router>
        <Suspense fallback={<AppLoader />}>
        <Routes>
          {/* Public Legal Routes */}
          <Route path="/privacidad" element={<PrivacyPolicy />} />
          <Route path="/terminos" element={<TermsOfService />} />
          <Route path="/compartir/:token" element={<SharedContentPlan />} />
          <Route path="/cotizaciones/ver/:slug" element={<PublicQuotation />} />

          {/* Protected App Routes */}
          {!isAuthenticated ? (
            <Route path="*" element={<Login onLogin={login} />} />
          ) : (
            <Route
              path="*"
              element={
                <AppLayout onLogout={logout}>
                  <Routes>
                    {/* Rutas Principales */}
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inicio" element={<Navigate to="/" replace />} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />
                    <Route
                      path="/manager"
                      element={
                        <ModuleGuard module="manager">
                          <BrainCore />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/gestion"
                      element={
                        <ModuleGuard module="gestion">
                          <NativeTasks />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/actividad"
                      element={
                        <ModuleGuard module="actividad">
                          <Activity />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/google-calendar/callback"
                      element={
                        <ModuleGuard module="actividad">
                          <GoogleCalendarCallback />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/reportes"
                      element={
                        <ModuleGuard module="reportes">
                          <Reports />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/parrillas"
                      element={
                        <ModuleGuard module="parrillas">
                          <ContentGrids />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/parrillas/:clientSlug/:period"
                      element={
                        <ModuleGuard module="parrillas">
                          <ContentPlanDetail />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/parrillas/:planId"
                      element={
                        <ModuleGuard module="parrillas">
                          <ContentPlanDetail />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/minutas"
                      element={
                        <ModuleGuard module="minutas">
                          <MinutesLayout />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/cotizaciones"
                      element={
                        <ModuleGuard module="cotizaciones">
                          <QuotationsLayout />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/cotizaciones/nueva"
                      element={
                        <ModuleGuard module="cotizaciones">
                          <QuotationForm />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/cotizaciones/editar/:id"
                      element={
                        <ModuleGuard module="cotizaciones">
                          <QuotationForm />
                        </ModuleGuard>
                      }
                    />

                    <Route
                      path="/moodboard"
                      element={
                        <ModuleGuard module="inspiracion">
                          <MoodboardDashboard />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/moodboard/:boardId"
                      element={
                        <ModuleGuard module="inspiracion">
                          <MoodboardCanvas />
                        </ModuleGuard>
                      }
                    />

                    <Route
                      path="/clientes"
                      element={
                        <ModuleGuard module="clientes">
                          <Clients />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/cliente/:clientId"
                      element={
                        <ModuleGuard module="clientes">
                          <ClientDetailWrapper />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/radar"
                      element={
                        <ModuleGuard module="radar">
                          <TalentRadar />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/financiero"
                      element={
                        <ModuleGuard module="financiero">
                          <FinancialDashboard />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/equipo"
                      element={
                        <ModuleGuard module="equipo">
                          <Team />
                        </ModuleGuard>
                      }
                    />
                    <Route path="/perfil" element={<Profile />} />
                    <Route path="/perfil/:userId" element={<Profile />} />

                    {/* Fallback para rutas no encontradas - redirigir a inicio */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              }
            />
          )}
        </Routes>
        </Suspense>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 border',
          }}
        />
      </Router>
    </ThemeProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
