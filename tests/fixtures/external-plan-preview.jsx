import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import ContentGrids from '../../src/components/modules/ContentGrids';
import ExternalPlanView from '../../src/components/modules/ContentGrids/ExternalPlanView';
import { AuthProvider } from '../../src/context/AuthContext';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import '../../src/index.css';

// Muestra local del espejo de las parrillas de MIO (29 de octubre de 2026). Se montan los componentes reales; la API vive
// en memoria. `?dark` para modo oscuro; `?ruta=hoja` abre directo el mes de Villa Montaña.

const params = new URLSearchParams(window.location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
const user = { id: 'u-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: {}, teamMemberId: 'm-rodny' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));

const SHEET = 'https://docs.google.com/spreadsheets/d/1gfXyBV33FSONj88kJyHklSOUZug1nbSGhOttqICQs0A/edit';
const cell = (row) => `${SHEET}#gid=1098554346&range=A${row}`;

const plans = [
  { id: 'p1', clientId: 'c-promo', client: { id: 'c-promo', name: 'Promo Group / Endova', slug: 'promogroup' }, year: 2026, month: 11, status: 'EN_PROGRESO', updatedAt: '2026-10-28T15:00:00Z', _count: { contentItems: 8 } },
  { id: 'p2', clientId: 'c-promo', client: { id: 'c-promo', name: 'Promo Group / Endova', slug: 'promogroup' }, year: 2026, month: 10, status: 'FINALIZADO', updatedAt: '2026-10-20T15:00:00Z', _count: { contentItems: 8 } }
];

const months = (created, changes, readAt) => [
  { year: 2026, month: 10, label: 'Octubre', slug: 'octubre-2026', tabName: 'OCTUBRE', created: created[0], reached: null, problem: null, readAt, changes: 0, changedAt: null },
  { year: 2026, month: 11, label: 'Noviembre', slug: 'noviembre-2026', tabName: 'NOVIEMBRE', created: created[1], reached: null, problem: null, readAt, changes, changedAt: changes ? readAt : null }
];
const externalPlans = [
  { client: { id: 'c-villa', name: 'Villa Montaña', slug: 'villa-montana' }, sheetUrl: SHEET, months: months([16, 16], 3, '2026-10-29T20:40:00Z') },
  { client: { id: 'c-lettu', name: 'Lettufresh', slug: 'lettufresh' }, sheetUrl: SHEET, months: months([13, 12], 0, '2026-10-29T20:40:00Z') }
];

const piece = (row, number, format, date, status, extra = {}) => ({ row, number, format, formatText: format.toUpperCase(), date, dateText: date ? null : '', status, stage: 'disenada', objective: extra.objective || 'POSICIONAMIENTO', copy: extra.copy || null, caption: extra.caption || null, content: extra.content || null, comment: extra.comment || null, cellUrl: cell(row), changed: extra.changed || [], comments: extra.comments || [] });

const villaNovember = {
  client: { id: 'c-villa', name: 'Villa Montaña', slug: 'villa-montana' },
  year: 2026, month: 11, label: 'Noviembre', sheetUrl: SHEET, tabUrl: `${SHEET}#gid=1098554346`, tabName: 'NOVIEMBRE',
  summary: { created: 4, reached: { redactada: 4, disenada: 4, aprobada: 2, programada: 0, publicada: 0 } },
  problem: null, readAt: '2026-10-29T20:40:00Z', commentsRead: true, changedAt: '2026-10-29T20:40:00Z',
  changes: [
    { kind: 'STATUS', row: 3, label: 'Post 1', from: 'REVISIÓN DE CLIENTE', to: 'APROBADO' },
    { kind: 'GOOGLE_COMMENT', row: 4, label: 'Reel 2', author: 'Villa Montaña', text: 'Nos encanta, pero cambien la canción por algo más tranquilo.' },
    { kind: 'SHEET_COMMENT', row: 6, label: 'Carrusel 4', text: 'Usar las fotos nuevas de la piscina.' }
  ],
  pieces: [
    piece(3, '1', 'Post', '2026-11-02', 'APROBADO', { objective: 'TESTIMONIOS & COMUNIDAD', copy: 'Despertar con el sonido del mar.\nUn desayuno frente al Atlántico.', caption: 'Hay mañanas que se recuerdan para siempre. 🌊\n\nReserva tu escapada en villamontana.com\n#VillaMontaña #PuertoRico', content: 'https://drive.google.com/file/d/demo1/view', changed: ['STATUS'] }),
    piece(4, '2', 'Reel', '2026-11-05', 'REVISIÓN DE CLIENTE', { copy: 'ESCENA 1 — Amanecer en la playa\nVOZ: «Bienvenidos a Villa Montaña»\n\nESCENA 2 — Eclipse Restaurant\nVOZ: «Gastronomía de autor frente al mar»', caption: 'Un día en Villa Montaña, de la playa a la mesa. 🍽️', content: 'https://drive.google.com/drive/folders/demo2', changed: ['GOOGLE_COMMENT'], comments: [
      { id: 'g1', author: 'Villa Montaña', content: 'Nos encanta, pero cambien la canción por algo más tranquilo.', quoted: 'Un día en Villa Montaña, de la playa a la mesa.', createdAt: '2026-10-29T19:10:00Z', resolved: false, replies: [{ id: 'r1', author: 'Brain Studio', content: 'Perfecto, la cambiamos hoy.', createdAt: '2026-10-29T19:30:00Z' }] }
    ] }),
    piece(5, '3', 'Post', '2026-11-07', 'APROBADO', { copy: 'Cena de Thanksgiving en Eclipse Restaurant.', caption: 'Celebra con nosotros este Thanksgiving. Reserva en OpenTable.' }),
    piece(6, '4', 'Carrusel', null, 'EN REVISIÓN INTERNA', { copy: 'Cinco rincones para tu boda en Villa Montaña.', comment: 'Usar las fotos nuevas de la piscina.', changed: ['SHEET_COMMENT'] })
  ],
  looseComments: [
    { id: 'g9', author: 'Villa Montaña', content: '¿Podemos sumar una pieza sobre Luna Bar este mes?', quoted: '', createdAt: '2026-10-28T14:00:00Z', resolved: false, replies: [] }
  ]
};

villaNovember.editable = !params.has('soloLectura');
villaNovember.statusOptions = ['APROBADO', 'EN REVISIÓN INTERNA', 'EN AJUSTE', 'SIN REALIZAR', 'REVISIÓN DE CLIENTE', 'PUBLICADO'];
villaNovember.edits = [];

let refreshed = 0;
axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const body = config.data ? JSON.parse(config.data) : {};
  const statusMatch = url.match(/\/pieces\/(\d+)\/status$/);
  if (config.method === 'patch' && statusMatch) {
    const row = Number(statusMatch[1]);
    villaNovember.pieces = villaNovember.pieces.map((item) => (item.row === row ? { ...item, status: body.status } : item));
    const target = villaNovember.pieces.find((item) => item.row === row);
    villaNovember.edits = [{ kind: 'STATUS', row, label: `${target.format} ${target.number}`, to: body.status, by: 'Rodny Chirinos', at: new Date().toISOString() }, ...villaNovember.edits];
    return ok({ ...villaNovember });
  }
  const replyMatch = url.match(/\/comments\/([^/]+)\/replies$/);
  if (config.method === 'post' && replyMatch) {
    const reply = { id: `r${Date.now()}`, author: 'Rodny Chirinos', mine: true, content: `Rodny Chirinos (Brain Studio): ${body.content}`, createdAt: new Date().toISOString() };
    villaNovember.pieces = villaNovember.pieces.map((item) => ({ ...item, comments: item.comments.map((comment) => (comment.id === replyMatch[1] ? { ...comment, resolved: comment.resolved || body.resolve, replies: [...comment.replies, reply] } : comment)) }));
    villaNovember.edits = [{ kind: 'REPLY', by: 'Rodny Chirinos', resolved: body.resolve, at: new Date().toISOString() }, ...villaNovember.edits];
    return ok({ ...villaNovember });
  }
  if (url.endsWith('/api/content/plans')) return ok(plans);
  if (url.endsWith('/api/content/external-plans')) return ok(externalPlans);
  if (url.includes('/api/content/external-plans/') && url.endsWith('/refresh')) { refreshed += 1; return ok({ ok: true, problem: null }); }
  if (url.includes('/api/content/external-plans/villa-montana/')) return ok({ ...villaNovember, readAt: refreshed ? '2026-10-29T21:05:00Z' : villaNovember.readAt });
  if (url.includes('/api/content/external-plans/')) return Promise.reject(Object.assign(new Error('No encontrado'), { response: { status: 404, data: { error: 'Ese cliente no tiene una hoja de MIO vinculada.' } }, config }));
  return ok([]);
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const entry = params.get('ruta') === 'hoja' ? '/parrillas/hoja/villa-montana/noviembre-2026' : '/parrillas';

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={[entry]}>
          <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 sm:px-8">
            <Routes>
              <Route path="/parrillas" element={<ContentGrids />} />
              <Route path="/parrillas/hoja/:clientSlug/:period" element={<ExternalPlanView />} />
            </Routes>
          </main>
          <Toaster />
        </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
