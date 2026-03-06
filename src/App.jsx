
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './components/modules/Dashboard';
import NativeTasks from './components/modules/NativeTasks';
import Chat from './components/modules/Chat';
import Clients from './components/modules/Clients';
import ClientDetailWrapper from './components/modules/ClientDetailWrapper';
import Team from './components/modules/Team';
import Login from './components/Login';
import MinutesLayout from './components/modules/Minutes/MinutesLayout';
import { ThemeProvider } from './context/ThemeContext';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for token on mount
    const token = sessionStorage.getItem('authToken');
    const userStr = sessionStorage.getItem('currentUser');

    if (token && userStr) {
      setIsAuthenticated(true);
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
    setIsLoading(false);

    // Listen for auth errors (401) from fetch interceptor
    const handleAuthError = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('currentUser');
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, []);

  const handleLogin = (token, user) => {
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center">Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ThemeProvider>
      <Router>
        <AppLayout onLogout={handleLogout}>
          <Routes>
            {/* Rutas Principales */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/inicio" element={<Navigate to="/" replace />} />

            <Route path="/bria" element={<Chat />} />
            <Route path="/pendientes-nativo" element={<NativeTasks />} />
            <Route path="/minutas" element={<MinutesLayout />} />

            <Route path="/clientes" element={<Clients />} />
            <Route path="/cliente/:clientId" element={<ClientDetailWrapper />} />
            <Route path="/equipo" element={<Team />} />

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

export default App;
