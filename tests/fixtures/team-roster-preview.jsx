import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import OperationalHealth from '@/components/modules/OperationalHealth';
import '@/index.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
const user = { id: 'preview-admin', name: 'Administrador de muestra', role: 'ADMIN' };
localStorage.setItem('currentUser', JSON.stringify(user));
localStorage.setItem('authToken', `preview.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.not-a-real-token`);
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <AuthProvider><BrowserRouter>
      <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
        <p className="text-sm text-muted-foreground">Muestra local · Datos simulados, sin conexión a producción.</p>
        <OperationalHealth />
      </main>
    </BrowserRouter></AuthProvider>
  </QueryClientProvider>
);
