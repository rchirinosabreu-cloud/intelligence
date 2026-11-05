import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import DeclaredTimeDialog from '@/components/tasks/DeclaredTimeDialog';
import NativeTasks from '@/components/modules/NativeTasks';
import Login from '@/components/Login';
import axios from 'axios';
import { isTrustedApiRequest } from '@/lib/trustedRequest';
import '@/index.css';

// Sin dobles de API: las credenciales de prueba vienen del login real y todos los datos del proxy local.
// Este punto de entrada instala el envío de credenciales que main.jsx instala en la aplicación completa.
const origin = window.location.origin;
axios.interceptors.request.use(config => {
  if (isTrustedApiRequest(config.url, origin, origin)) config.headers.Authorization = `Bearer ${localStorage.getItem('authToken')}`;
  return config;
});
const originalFetch = window.fetch.bind(window);
window.fetch = (resource, config = {}) => {
  if (!isTrustedApiRequest(resource, origin, origin)) return originalFetch(resource, config);
  const headers = new Headers(config.headers || {});
  headers.set('Authorization', `Bearer ${localStorage.getItem('authToken')}`);
  return originalFetch(resource, { ...config, headers });
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function AuthenticatedTasks() {
  const { isLoading, currentUser, login, logout } = useAuth();
  if (isLoading) return <p>Cargando sesión local…</p>;
  return currentUser ? <><div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
    <span>{currentUser.name}</span><button onClick={logout} className="min-h-11 rounded-xl border border-border px-4 text-foreground">Cambiar persona</button>
  </div><NativeTasks /></> : <Login onLogin={login} />;
}
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={client}><AuthProvider><ThemeProvider><ConfirmDialogProvider>
    <BrowserRouter>
      <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
        <p className="mb-4 text-xs text-muted-foreground">Prueba local · personas ficticias · PostgreSQL aislado</p>
        <AuthenticatedTasks />
      </main><DeclaredTimeDialog /><BrainToaster />
    </BrowserRouter>
  </ConfirmDialogProvider></ThemeProvider></AuthProvider></QueryClientProvider>
);
