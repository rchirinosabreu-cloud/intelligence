import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import VaultPage from '@/components/modules/Vault/VaultPage';
import BriaAccessCards from '@/components/bria/BriaAccessCards';
import '@/index.css';

// Muestra local de la bóveda con datos ficticios y una API simulada en el navegador.
// `?rol=pm` para verla como project manager, `&dark` para el modo oscuro, `&bria` para la tarjeta del chat.
const params = new URLSearchParams(location.search);
const role = params.get('rol') === 'pm' ? 'PROJECT_MANAGER' : 'ADMIN';
const demoToken = `demo.${btoa(JSON.stringify({ sub: 'user-demo', exp: 4102444800 })).replace(/=+$/, '')}.demo`;
localStorage.setItem('authToken', demoToken);
localStorage.setItem('currentUser', JSON.stringify({ id: 'user-demo', name: 'Persona de ejemplo', role }));
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';

const rows = [
  { id: 'a1', clientId: 'c1', clientName: 'Cliente de ejemplo A', platform: 'Instagram', label: 'Cuenta principal', url: 'https://instagram.com', kind: 'ACCESO', source: 'MANUAL', revision: 1, canEdit: true },
  { id: 'a2', clientId: 'c1', clientName: 'Cliente de ejemplo A', platform: 'Meta Business', label: 'Administrador de anuncios', url: null, kind: 'ACCESO', source: 'MANUAL', revision: 1, canEdit: true },
  { id: 'a3', clientId: 'c2', clientName: 'Cliente de ejemplo B', platform: 'Varios (Drive)', label: 'Accesos de Cliente B · Brain Access Book (25 sep 2026)', url: null, kind: 'BLOQUE', source: 'IMPORT', revision: 1, canEdit: role === 'ADMIN' },
  ...(role === 'ADMIN' ? [{ id: 'a4', clientId: null, clientName: null, platform: 'Canva', label: 'Cuenta de la agencia', url: 'https://canva.com', kind: 'ACCESO', source: 'MANUAL', revision: 1, canEdit: true }] : [])
];
const reveal = {
  a1: { username: 'usuario.ejemplo', secret: 'Clave-de-ejemplo-123', notes: 'El código de verificación llega al celular de la PM.', kind: 'ACCESO' },
  a2: { username: 'correo@ejemplo.test', secret: 'Otra-clave-ficticia', notes: null, kind: 'ACCESO' },
  a3: { username: null, secret: 'INSTAGRAM\nUsuario: ejemplo.b\nContraseña: ficticia-1\n\nFACEBOOK\nUsuario: correo@ejemplo.test\nContraseña: ficticia-2', notes: null, kind: 'BLOQUE' },
  a4: { username: 'agencia@ejemplo.test', secret: 'Clave-agencia-ficticia', notes: null, kind: 'ACCESO' }
};
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (url.pathname === '/api/auth/me') return json({ id: 'user-demo', name: 'Persona de ejemplo', role });
  if (url.pathname === '/api/clients') return json([{ id: 'c1', name: 'Cliente de ejemplo A' }, { id: 'c2', name: 'Cliente de ejemplo B' }]);
  if (url.pathname === '/api/team') return json([{ userId: 'u-pm1', name: 'PM de ejemplo', user: { role: 'PROJECT_MANAGER' } }, { userId: 'u-pm2', name: 'Otra PM', user: { role: 'PROJECT_MANAGER' } }]);
  if (url.pathname === '/api/vault/credentials') {
    if ((init.method || 'GET') === 'POST') return json({ created: true });
    const client = url.searchParams.get('clientId'), q = (url.searchParams.get('q') || '').toLowerCase();
    return json(rows.filter((r) => (!client || r.clientId === client) && (!q || `${r.platform} ${r.label}`.toLowerCase().includes(q))));
  }
  const match = url.pathname.match(/^\/api\/vault\/credentials\/(\w+)\/(reveal|reveals)$/);
  if (match?.[2] === 'reveal') return json({ id: match[1], ...reveal[match[1]] });
  if (match?.[2] === 'reveals') return json([{ persona: 'PM de ejemplo', via: 'BRIA', fecha: '2026-10-09T15:00:00Z' }, { persona: 'Persona de ejemplo', via: 'BOVEDA', fecha: '2026-10-08T21:30:00Z' }]);
  return realFetch(input, init);
};

const BriaPreview = () => (
  <main className="mx-auto max-w-xl px-4 py-8">
    <div className="prose prose-sm text-zinc-800 dark:prose-invert dark:text-zinc-100"><p>Encontré dos accesos de <strong>Cliente de ejemplo A</strong>. Pulsa «Ver acceso» en la tarjeta: la plataforma te lo muestra y deja registro.</p></div>
    <BriaAccessCards cards={[{ id: 'a1', cliente: 'Cliente de ejemplo A', plataforma: 'Instagram', nombre: 'Cuenta principal' }, { id: 'a2', cliente: 'Cliente de ejemplo A', plataforma: 'Meta Business', nombre: 'Administrador de anuncios' }]} />
  </main>
);

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ConfirmDialogProvider>
      {params.has('bria') ? <BriaPreview /> : <VaultPage />}
      <Toaster />
    </ConfirmDialogProvider>
  </AuthProvider>
);
