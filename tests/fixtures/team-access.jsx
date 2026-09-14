import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Team from '@/components/modules/Team';
import '@/index.css';

if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Solo local');
const params = new URLSearchParams(location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
localStorage.setItem('currentUser', JSON.stringify({ id: 'demo-admin', name: 'Admin de prueba', role: params.has('viewer') ? 'VIEWER' : 'ADMIN' }));
const pending = { id: 'demo-member', name: 'Persona de prueba', role: 'Editor', email: 'persona@example.test', isActive: true, userId: 'demo-user', user: { role: 'EDITOR', isActive: true, mustChangePassword: true, passwordChangedAt: null, sessionVersion: 0, modulePermissions: {} } };
let members = params.has('pending') ? [pending] : [];
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/team')) throw new Error('Muestra sin conexiones externas');
  if (!options.method || options.method === 'GET') return Response.json(members);
  await new Promise(resolve => setTimeout(resolve, 350));
  if (params.has('error')) return Response.json({ error: 'Error de guardado simulado. No se creó ninguna cuenta.' }, { status: 500 });
  const body = JSON.parse(options.body);
  const member = url.pathname.endsWith('/initial-access') ? pending : { ...pending, ...body };
  members = [member];
  return Response.json({ ...member, initialAccess: { name: member.name, email: member.email, temporaryPassword: 'SoloMuestra-NoEsUnaClaveReal!' } }, { status: 201 });
};
createRoot(document.getElementById('root')).render(<MemoryRouter><div className="min-h-screen bg-zinc-50 p-5 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><p className="mb-6 text-sm">Prueba aislada · cuentas y claves ficticias · no se crean usuarios reales</p><Team /></div></MemoryRouter>);
