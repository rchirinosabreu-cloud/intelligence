import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Team from '@/components/modules/Team';
import '@/index.css';
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Solo local');
const params = new URLSearchParams(location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
localStorage.setItem('currentUser', JSON.stringify({ id: 'test-admin', role: 'ADMIN' }));
let members = [];
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/team')) throw new Error('Esta prueba no tiene conexiones externas.');
  if (!options.method || options.method === 'GET') return Response.json(members);
  const body = JSON.parse(options.body);
  members = [{ ...body, id: 'test-member', isActive: true, user: { role: body.systemRole, modulePermissions: body.modulePermissions } }];
  return Response.json(members[0]);
};
createRoot(document.getElementById('root')).render(<MemoryRouter><div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><p className="mb-6 text-sm">Prueba aislada de activación · personas ficticias · no modifica el equipo real</p><Team /></div></MemoryRouter>);
