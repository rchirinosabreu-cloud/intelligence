
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
import Login from './components/Login';
import MinutesLayout from './components/modules/Minutes/MinutesLayout';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster, toast } from 'react-hot-toast';

function AppContent() {
  const { isAuthenticated, isLoading, login, logout } = useAuth();

  // Escuchar errores de permisos (403 Forbidden)
  React.useEffect(() => {
    const handleForbidden = () => {
      toast.error('No tienes permisos para realizar esta acción', {
        id: 'forbidden-error', // Prevenir duplicados
      });
    };

    window.addEventListener('auth-forbidden', handleForbidden);
    return () => window.removeEventListener('auth-forbidden', handleForbidden);
  }, []);

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center">Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  return (
    <ThemeProvider>
      <Router>
        <AppLayout onLogout={logout}>
          <Routes>
            {/* Rutas Principales */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/inicio" element={<Navigate to="/" replace />} />

            <Route path="/bria" element={<Chat />} />
            <Route path="/gestion" element={<NativeTasks />} />
            <Route path="/minutas" element={<MinutesLayout />} />

            <Route path="/clientes" element={<Clients />} />
            <Route path="/cliente/:clientId" element={<ClientDetailWrapper />} />
            <Route path="/equipo" element={<Team />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/perfil/:userId" element={<Profile />} />

            {/* Fallback para rutas no encontradas - redirigir a inicio */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 border',
            }}
          />
        </AppLayout>
      </Router>
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
