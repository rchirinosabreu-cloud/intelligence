import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Clients from '@/components/modules/Clients';
import '@/index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}><BrowserRouter>
    <main className="min-h-screen bg-background p-6 text-foreground"><Clients /></main>
    <Toaster />
  </BrowserRouter></QueryClientProvider>
);
