
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

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center">Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function AppContent() {
  const { isAuthenticated, isLoading, login, logout, currentUser } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center">Cargando...</div>;
  }

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={!isAuthenticated ? <Login onLogin={login} /> : <Navigate to="/" replace />} />

          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/compartir/:token" element={<SharedContentPlan />} />

          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/chat" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Chat />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/gestion" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <NativeTasks />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/actividad" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Activity />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/parrillas" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <ContentGrids />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/parrillas/:id" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <ContentPlanDetail />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/parrillas/:slug/:period" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <ContentPlanDetail />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/minutas/*" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <MinutesLayout />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/metricas" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Metrics />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/clientes" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Clients />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/clientes/:id" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <ClientDetailWrapper />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/equipo" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Team />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/radar" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <TalentRadar />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="/perfil" element={
            <ProtectedRoute>
              <AppLayout onLogout={logout} user={currentUser}>
                <Profile />
              </AppLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
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
