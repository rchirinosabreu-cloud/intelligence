import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import ContentGrids from '../../src/components/modules/ContentGrids';
import { AuthProvider } from '../../src/context/AuthContext';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import '../../src/index.css';

// Muestra local de la sección Parrillas (Rodny, 21 de noviembre de 2026). Nada se guarda: la API vive en memoria.
// Se monta el componente real. `?vacio=1` enseña la pantalla sin parrillas.
const user = { id: 'u-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: {}, teamMemberId: 'm-rodny' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));

const client = (id, name) => ({ id, name, slug: id, logoUrl: null });
const mixed = (label, start, end) => ({ label, start, end, mixed: true, cutDay: 15 });
const plan = (id, c, month, year, status, items, cycle = null) => ({
  id, clientId: c.id, client: c, month, year, status, updatedAt: `${year}-${String(month).padStart(2, '0')}-20T15:00:00.000Z`,
  cycle: cycle || { label: '', start: '', end: '', mixed: false }, _count: { items }
});
const promo = client('promogroup', 'Promo Group / Endova');
const bonsai = client('bonsai', 'Bonsai Restaurante de comida japonesa contemporánea');
const aristea = client('aristea', 'Aristea');
const finas = client('finas', 'Finas Asesores');
const mio = client('mio-cliente', 'Clínica del Norte');
const plans = [
  plan('p1', promo, 11, 2026, 'ACTIVO', 12, mixed('Noviembre–diciembre', '2026-11-15', '2026-12-14')),
  plan('p2', promo, 10, 2026, 'FINALIZADO', 12, mixed('Octubre–noviembre', '2026-10-15', '2026-11-14')),
  plan('p3', promo, 9, 2026, 'FINALIZADO', 11, mixed('Septiembre–octubre', '2026-09-15', '2026-10-14')),
  plan('p4', promo, 8, 2026, 'FINALIZADO', 12, mixed('Agosto–septiembre', '2026-08-15', '2026-09-14')),
  plan('p5', promo, 7, 2026, 'FINALIZADO', 10, mixed('Julio–agosto', '2026-07-15', '2026-08-14')),
  plan('b1', bonsai, 11, 2026, 'EN_APROBACION', 10, { label: 'Noviembre–diciembre', start: '2026-11-10', end: '2026-12-09', mixed: true }),
  plan('b2', bonsai, 10, 2026, 'FINALIZADO', 10, { label: 'Octubre–noviembre', start: '2026-10-10', end: '2026-11-09', mixed: true }),
  plan('a1', aristea, 12, 2026, 'PLANIFICACION', 0),
  plan('a2', aristea, 11, 2026, 'ACTIVO', 16),
  plan('f1', finas, 11, 2026, 'ACTIVO', 1)
];
const external = [{ client: mio, months: [
  { slug: 'noviembre-2026', label: 'noviembre', year: 2026, created: 9, changes: 2, readAt: '2026-11-21T14:00:00.000Z' },
  { slug: 'diciembre-2026', label: 'diciembre', year: 2026, created: 0, changes: 0, problem: 'La hoja de diciembre todavía no tiene piezas.', readAt: '2026-11-21T14:00:00.000Z' }
] }];
const empty = new URLSearchParams(window.location.search).get('vacio') === '1';

axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
  if (url.endsWith('/api/content/plans')) return ok(empty ? [] : plans);
  if (url.endsWith('/api/content/external-plans')) return ok(empty ? [] : external);
  return ok([]);
};

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthProvider>
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={[`/parrillas${window.location.search}`]}>
          <div className="min-h-screen bg-zinc-50 p-4 dark:bg-zinc-950 sm:p-8">
            <Routes>
              <Route path="/parrillas" element={<ContentGrids />} />
              <Route path="*" element={<p data-left>Salió de Parrillas</p>} />
            </Routes>
          </div>
          <Toaster />
        </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
