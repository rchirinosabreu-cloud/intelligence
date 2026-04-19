
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './components/modules/Dashboard';
import NativeTasks from './components/modules/NativeTasks';
import Chat from './components/modules/Chat';
import Clients from './components/modules/Clients';
import ClientDetailWrapper from './components/modules/ClientDetailWrapper';
import Team from './components/modules/Team';
import Profile from './components/modules/Profile';
import Metrics from './components/modules/Metrics';
import ContentGrids from './components/modules/ContentGrids';
import ContentPlanDetail from './components/modules/ContentPlanDetail';
import TalentRadar from './components/modules/TalentRadar';
import Activity from './components/modules/Activity';
import Login from './components/Login';
import PrivacyPolicy from './components/public/PrivacyPolicy';
import TermsOfService from './components/public/TermsOfService';
import SharedContentPlan from './components/public/SharedContentPlan';
import MinutesLayout from './components/modules/Minutes/MinutesLayout';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    },
  },
});

function AppContent() {
  const { isAuthenticated, isLoading, login, logout, currentUser } = useAuth();

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
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center">Cargando...</div>;
  }

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          {/* Public Legal Routes */}
          <Route path="/privacidad" element={<PrivacyPolicy />} />
          <Route path="/terminos" element={<TermsOfService />} />
          <Route path="/compartir/:token" element={<SharedContentPlan />} />

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

            <Route path="/bria" element={<Chat />} />
            <Route path="/gestion" element={<NativeTasks />} />
            <Route path="/parrillas" element={<ContentGrids />} />
            <Route path="/parrillas/:clientSlug/:period" element={<ContentPlanDetail />} />
            <Route path="/parrillas/:planId" element={<ContentPlanDetail />} />
            <Route path="/actividad" element={<Activity />} />
            <Route path="/minutas" element={<MinutesLayout />} />
            <Route path="/metricas" element={<Metrics />} />

            <Route path="/clientes" element={<Clients />} />
            <Route path="/cliente/:clientId" element={<ClientDetailWrapper />} />
            <Route path="/radar" element={(currentUser?.role === 'ADMIN' || currentUser?.role === 'PM') ? <TalentRadar /> : <Navigate to="/" replace />} />
            <Route path="/equipo" element={<Team />} />
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
