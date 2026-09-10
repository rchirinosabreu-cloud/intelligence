import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { Toaster } from '@/components/ui/toaster';
import TaskSidePanel from '@/components/modules/TaskSidePanel';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

const task = { id: 'task-demo', title: 'Revisión de fotografías · muestra local', clientId: 'client-demo', assigneeId: 'member-demo', creatorId: 'user-demo', status: 'PENDIENTE', taskAttachments: [], taskComments: [] };
createRoot(document.getElementById('root')).render(
  <MemoryRouter><AuthProvider><ConfirmDialogProvider>
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">Prueba local de adjuntos · datos ficticios</main>
    <TaskSidePanel isOpen onClose={() => {}} onSuccess={() => {}} taskData={task} clientsList={[{ id: 'client-demo', name: 'Cliente de muestra' }]} />
    <Toaster />
  </ConfirmDialogProvider></AuthProvider></MemoryRouter>
);
