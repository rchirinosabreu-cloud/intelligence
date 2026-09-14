import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Login from '@/components/Login';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import WelcomeWorkspace from './welcome/WelcomeWorkspace';
import { welcomeDemoProfiles } from './welcome/welcomeContent';
import '@/index.css';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Muestra disponible solo en local');
const params = new URLSearchParams(location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
const selected = params.get('person') === 'david' ? 'david' : 'francis';
const demoUsers = {
  francis: { id: 'demo-francis', name: 'Francis Caballero', email: 'francis@example.test', role: 'VIEWER', mustChangePassword: true },
  david: { id: 'demo-david', name: 'David Rodríguez', email: 'david@example.test', role: 'VIEWER', mustChangePassword: true },
};
const passwords = { francis: 'MuestraBrain2026!', david: 'MuestraBrain2026!' };
const demoToken = `preview.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.not-a-real-token`;
let current = selected;
for (const storage of [localStorage, sessionStorage]) {
  storage.removeItem('authToken'); storage.removeItem('currentUser');
  if (params.get('step') === 'change') {
    storage.setItem('authToken', demoToken);
    storage.setItem('currentUser', JSON.stringify(demoUsers[current]));
  }
}

// The real UI talks only to this in-memory example, never to an API or database.
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  if (url.origin !== location.origin) return json({ error: 'Conexión externa bloqueada en la muestra' }, 403);
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname === '/api/auth/me') return json(demoUsers[current]);
  if (url.pathname === '/api/login') {
    const key = Object.keys(demoUsers).find(key => demoUsers[key].email === body.email);
    if (!key || passwords[key] !== body.password) return json({ message: 'Credenciales de muestra incorrectas' }, 401);
    current = key;
    return json({ token: demoToken, user: demoUsers[key] });
  }
  if (url.pathname === '/api/user/password' && options.method === 'PUT') {
    if (body.currentPassword !== passwords[current]) return json({ error: 'Contraseña actual incorrecta' }, 400);
    if (body.newPassword?.length < 10 || body.newPassword === body.currentPassword) return json({ error: 'Elige una contraseña nueva de al menos 10 caracteres' }, 400);
    passwords[current] = body.newPassword;
    demoUsers[current] = { ...demoUsers[current], mustChangePassword: false };
    return json({ success: true, requiresLogin: true });
  }
  return json({ error: 'Operación no disponible en esta muestra local' }, 403);
};

function Flow() {
  const { isAuthenticated, currentUser, login } = useAuth();
  return <>
    <aside className="border-b border-border bg-background px-6 py-3 text-sm text-foreground">
      <p className="font-semibold">Muestra local · No modifica cuentas reales.</p>
      <p className="mt-1 text-muted-foreground">Correo: {demoUsers[selected].email} · Clave de prueba: MuestraBrain2026!</p>
      <div className="mt-2 flex gap-5">
        <a className="underline" href="?person=francis">Probar Francis</a>
        <a className="underline" href="?person=david">Probar David</a>
        <a className="underline" href={`?person=${selected}&step=change`}>Ver cambio de contraseña</a>
      </div>
    </aside>
    <Routes>
      <Route path="/cambiar-password" element={isAuthenticated && currentUser?.mustChangePassword ? <ForcePasswordChange /> : <Login onLogin={login} />} />
      <Route path="*" element={
        isAuthenticated && currentUser?.mustChangePassword ? <Navigate to="/cambiar-password" replace /> :
        isAuthenticated ? <><h1 className="sr-only">Acceso de prueba completado</h1><WelcomeWorkspace key={currentUser.id} user={{ ...currentUser, modulePermissions: welcomeDemoProfiles[current]?.modulePermissions || {} }} /></> :
        <Login onLogin={login} />
      } />
    </Routes>
  </>;
}

createRoot(document.getElementById('root')).render(<AuthProvider><MemoryRouter initialEntries={[params.get('step') === 'change' ? '/cambiar-password' : '/login']}><Flow /></MemoryRouter></AuthProvider>);
