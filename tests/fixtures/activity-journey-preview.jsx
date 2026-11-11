import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrainToaster from '@/components/ui/BrainToaster';
import Activity from '@/components/modules/Activity';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import '@/index.css';

// El calendario real de Actividad con la API simulada por el recorrido de navegador (jornadas, 11 de noviembre de 2026).
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}><AuthProvider><BrowserRouter><ConfirmDialogProvider>
    <main className="brain-ambient min-h-screen p-6 text-foreground"><Activity /></main>
    <BrainToaster />
  </ConfirmDialogProvider></BrowserRouter></AuthProvider></QueryClientProvider>
);
