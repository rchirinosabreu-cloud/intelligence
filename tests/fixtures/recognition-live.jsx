import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecognitionRuntime from '@/components/recognitions/RecognitionRuntime';
import '@/index.css';
const session = await fetch('/test/session').then(response => response.json());
localStorage.setItem('authToken', session.token);
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><main className="min-h-screen bg-zinc-50 p-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><h1 className="text-xl font-semibold">Integración real · Base de prueba</h1><p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Tarea completada en el servicio real → reconocimiento guardado en PostgreSQL → API autenticada → popup.</p><p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Esta comprobación no otorga reconocimientos al equipo de producción.</p><RecognitionRuntime userId={session.userId} /></main></QueryClientProvider>);
