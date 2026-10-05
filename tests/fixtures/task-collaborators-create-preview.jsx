import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import TaskSidePanel from '@/components/modules/TaskSidePanel';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// «Crear tarea» con co-responsables (Rodny, 5 de octubre de 2026): el panel real de la plataforma,
// sin servidor. El equipo y los clientes son de ejemplo; nada se guarda. `?dark` para el modo oscuro.

const EQUIPO = [
  { id: 'm-rodny', name: 'Rodny Chirinos', role: 'Director' },
  { id: 'm-melissa', name: 'Melissa Ortega', role: 'Community Manager' },
  { id: 'm-bruno', name: 'Bruno Salas', role: 'Diseñador' },
  { id: 'm-angela', name: 'Ángela Pérez', role: 'Diseñadora' },
  { id: 'm-franci', name: 'Francisco Villa', role: 'Comercial' },
  { id: 'm-elisa', name: 'Elisa Gómez', role: 'Financiera' }
];
const USUARIO = { id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { gestion: true } };

const demoToken = `demo.${btoa(JSON.stringify({ sub: USUARIO.id, exp: 4102444800 })).replace(/=+$/, '')}.demo`;
localStorage.setItem('authToken', demoToken);
localStorage.setItem('currentUser', JSON.stringify(USUARIO));
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (!url.includes('/api/')) return realFetch(input, init);
  if (url.includes('/api/team')) return json(EQUIPO);
  if (url.includes('/api/auth/me') || url.includes('/api/user/profile')) return json(USUARIO);
  return json([]);
};

createRoot(document.getElementById('root')).render(
  <MemoryRouter><AuthProvider><ConfirmDialogProvider>
    <main className="brain-ambient min-h-screen p-6" />
    <TaskSidePanel
      isOpen
      onClose={() => {}}
      onSuccess={() => {}}
      taskData={null}
      clientsList={[{ id: 'c-villa', name: 'Corporación Villa Montaña' }, { id: 'c-norte', name: 'Clínica Norte' }]}
    />
    <BrainToaster />
  </ConfirmDialogProvider></AuthProvider></MemoryRouter>
);
