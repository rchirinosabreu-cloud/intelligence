import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExcessiveTaskAlertDialog from '@/components/tasks/ExcessiveTaskAlertDialog';
import ReturnedTaskAlertDialog from '@/components/tasks/ReturnedTaskAlertDialog';
import '@/index.css';
const params = new URLSearchParams(location.search);
const returned = params.has('returned');
const preview = params.has('preview') ? [{ id: '11111111-1111-4111-8111-111111111111', title: 'Tarea simulada', elapsedMs: 7200000 }] : null;
function App() {
  const location = useLocation();
  return <main className="p-8 text-foreground bg-background min-h-screen">
    <h1>Prueba local de avisos · Sin conexión a producción</h1><p data-testid="location">{location.search}</p>
    {returned ? <ReturnedTaskAlertDialog userId="helen" userName="Helen" previewTasks={preview} />
      : <ExcessiveTaskAlertDialog userId="helen" userName="Helen" />}
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>);
