import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import Profile from '../../src/components/modules/Profile';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import BrainToaster from '../../src/components/ui/BrainToaster';
import '../../src/index.css';

// Muestra local del perfil (21 de octubre de 2026): la pantalla real contra la API de scripts/preview-whatsapp.js,
// para revisar la rejilla de tres columnas con la tarjeta «Bria en WhatsApp» en su sitio.

const PERSON = { id: 'u-rodny', name: 'Rodny Muestra', email: 'rodny@example.test', role: 'ADMIN', modulePermissions: { bria: true } };
const fakeJwt = () => { const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, ''); return `${b64({ alg: 'none' })}.${b64({ userId: PERSON.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`; };
localStorage.setItem('authToken', fakeJwt());
localStorage.setItem('currentUser', JSON.stringify(PERSON));
const originalFetch = window.fetch;
window.fetch = (resource, config = {}) => { const headers = new Headers(config.headers || {}); headers.set('Authorization', `Bearer ${localStorage.getItem('authToken')}`); return originalFetch(resource, { ...config, headers }); };

function Preview() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfirmDialogProvider>
          <BrainToaster />
          <div className="min-h-screen bg-background p-6 text-foreground">
            <div className="mb-4 flex justify-end">
              <button className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
            </div>
            <Routes><Route path="/perfil" element={<Profile />} /></Routes>
          </div>
        </ConfirmDialogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<Preview />);
