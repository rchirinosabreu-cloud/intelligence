
import React, { Suspense } from 'react';
// Todo módulo se carga con la recuperación de versión: tras un despliegue, un archivo viejo
// recarga la página en silencio en vez de mostrar la pantalla de error (5 de octubre de 2026).
import { lazyWithRecovery } from '@/pwa/preloadRecovery';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Login from './components/Login';
import ForcePasswordChange from './components/ForcePasswordChange';
import ForceMfaEnrollment from './components/ForceMfaEnrollment';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { toast } from 'react-hot-toast';
import BrainToaster from '@/components/ui/BrainToaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Dashboard = lazyWithRecovery(() => import('./components/modules/Dashboard'));
const NativeTasks = lazyWithRecovery(() => import('./components/modules/NativeTasks'));
const Clients = lazyWithRecovery(() => import('./components/modules/Clients'));
const ClientDetailWrapper = lazyWithRecovery(() => import('./components/modules/ClientDetailWrapper'));
const ClientOperationRoute = lazyWithRecovery(() => import('./components/modules/Clients/operations/ClientOperationRoute'));
const Team = lazyWithRecovery(() => import('./components/modules/Team'));
const Profile = lazyWithRecovery(() => import('./components/modules/Profile'));
const ContentGrids = lazyWithRecovery(() => import('./components/modules/ContentGrids'));
const ContentPlanDetail = lazyWithRecovery(() => import('./components/modules/ContentPlanDetail'));
const FinancialDashboard = lazyWithRecovery(() => import('./components/modules/FinancialDashboard'));
const TalentRadar = lazyWithRecovery(() => import('./components/modules/TalentRadar'));
const ManagerTaskAnalytics = lazyWithRecovery(() => import('./components/modules/ManagerTaskAnalytics'));
const Activity = lazyWithRecovery(() => import('./components/modules/Activity'));
const GoogleCalendarCallback = lazyWithRecovery(() => import('./components/modules/Activity/GoogleCalendarCallback'));
const Reports = lazyWithRecovery(() => import('./components/modules/Reports'));
const MoodboardDashboard = lazyWithRecovery(() => import('./components/modules/Moodboard/MoodboardDashboard'));
const MoodboardCanvas = lazyWithRecovery(() => import('./components/modules/Moodboard/MoodboardCanvas'));
const PrivacyPolicy = lazyWithRecovery(() => import('./components/public/PrivacyPolicy'));
const TermsOfService = lazyWithRecovery(() => import('./components/public/TermsOfService'));
const AiGovernancePolicy = lazyWithRecovery(() => import('./components/public/AiGovernancePolicy'));
const HelpCenter = lazyWithRecovery(() => import('./components/public/HelpCenter'));
const GovernanceCenter = lazyWithRecovery(() => import('./components/modules/Governance/GovernanceCenter'));
const SharedContentPlan = lazyWithRecovery(() => import('./components/public/SharedContentPlan'));
const QuotationForm = lazyWithRecovery(() => import('./components/modules/Quotations/QuotationForm'));
const QuotationsLayout = lazyWithRecovery(() => import('./components/modules/Quotations/QuotationsLayout'));
const PublicQuotation = lazyWithRecovery(() => import('./components/public/Quotations/PublicQuotation'));
const MinutesLayout = lazyWithRecovery(() => import('./components/modules/Minutes/MinutesLayout'));
const DriveLayout = lazyWithRecovery(() => import('./components/modules/Drive/DriveLayout'));
const OperationalHealth = lazyWithRecovery(() => import('./components/modules/OperationalHealth'));
const CrmLayout = lazyWithRecovery(() => import('./components/modules/Crm/CrmLayout'));
const CrmLeadDetail = lazyWithRecovery(() => import('./components/modules/Crm/CrmLeadDetail'));
const CommercialRequestPage = lazyWithRecovery(() => import('./components/public/CommercialRequest/CommercialRequestPage'));

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

function AdminGuard({ children }) {
  const { currentUser } = useAuth();
  return currentUser?.role === 'ADMIN' ? children : <Navigate to="/" replace />;
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
          <BrainToaster />
        </Router>
      </ThemeProvider>
    );
  }

  if (isAuthenticated && currentUser?.mfaEnrollmentRequired) {
    return (
      <ThemeProvider>
        <Router>
          <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route path="/activar-verificacion" element={<ForceMfaEnrollment />} />
            <Route path="*" element={<Navigate to="/activar-verificacion" replace />} />
          </Routes>
          </Suspense>
          <BrainToaster />
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
          <Route path="/seguridad" element={<AiGovernancePolicy />} />
          <Route path="/ayuda" element={<HelpCenter />} />
          <Route path="/compartir/:token" element={<SharedContentPlan />} />
          <Route path="/cotizaciones/ver/:slug" element={<PublicQuotation />} />
          <Route path="/solicitud" element={<CommercialRequestPage />} />

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
                    <Route path="/gobierno-ia" element={<AdminGuard><GovernanceCenter /></AdminGuard>} />
                    <Route
                      path="/salud-operativa"
                      element={
                        <AdminGuard>
                          <OperationalHealth />
                        </AdminGuard>
                      }
                    />
                    <Route
                      path="/manager"
                      element={
                        <ModuleGuard module="manager">
                          <ManagerTaskAnalytics />
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
                      path="/drive"
                      element={
                        <ModuleGuard module="minutas">
                          <DriveLayout />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/crm"
                      element={
                        <ModuleGuard module="crm">
                          <CrmLayout />
                        </ModuleGuard>
                      }
                    />
                    <Route
                      path="/crm/oportunidades/:leadId"
                      element={
                        <ModuleGuard module="crm">
                          <CrmLeadDetail />
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
                      path="/clientes/operacion/:slug"
                      element={
                        <ModuleGuard module="clientes">
                          <ClientOperationRoute />
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
        <BrainToaster />
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
