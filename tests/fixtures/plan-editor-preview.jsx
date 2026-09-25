import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import ContentPlanDetail from '../../src/components/modules/ContentPlanDetail';
import { AuthProvider } from '../../src/context/AuthContext';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local del editor de parrilla con el mes en un carril (Rodny, 24 de septiembre de 2026).
// Nada se guarda: la API vive en memoria. Se monta el componente **real**, no una copia.

const user = { id: 'u-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: {}, teamMemberId: 'm-rodny' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));

const client = { id: 'c1', name: 'PromoGroup IPS', slug: 'promogroup', logoUrl: null };
const member = { id: 'm-mel', userId: 'u-mel', name: 'Melissa', avatarUrl: null, role: 'Community Manager' };

const GUION = `ESCENA 1 — Exterior / llegada
VOZ: “Antes de una consulta, un procedimiento o un diagnóstico, hay un espacio preparado para recibirte.”

ESCENA 2 — Recorrido por ENDOVA
VOZ: “En ENDOVA, cada elemento forma parte de una experiencia de atención especializada.”

CIERRE
TEXTO: “ENDOVA | Una unidad de PromoGroup IPS.”`;

const CAPTION = `Hay lugares que empiezan a cuidar de ti incluso antes de la consulta. 💙

En ENDOVA hemos pensado cada espacio y cada momento para acompañar una experiencia de atención especializada, desde que llegas hasta que termina tu recorrido.

#ENDOVA #PromoGroup #Salud #Medellín`;

const piece = (id, objective, format, day, status, extra = {}) => ({
  id,
  planId: 'p1',
  objective,
  format,
  copyText: extra.copyText || '',
  captionText: extra.captionText || '',
  publishDate: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  mediaUrl: extra.mediaUrl || [],
  assetsLinks: [],
  internalNotes: extra.internalNotes || null,
  comments: extra.comments || null,
  status,
  tasks: [],
  finalAssets: extra.finalAssets || []
});

const items = [
  piece('i1', 'ENDOVA, un espacio preparado para recibirte', 'Reel', 24, 'APROBADO', {
    copyText: GUION,
    captionText: CAPTION,
    internalNotes: 'Grabar en horario de baja afluencia.',
    comments: '[Cliente - 18/09/2026]: ¿Podemos mostrar más la sala de espera?',
    finalAssets: [{ id: 'a1', name: 'reel-endova.mp4', storageKey: 'k1', mimeType: 'video/mp4', size: 31000000, position: 0 }]
  }),
  piece('i2', 'Tres preguntas antes de tu procedimiento', 'Carrusel', 28, 'EN_REVISION', {
    copyText: 'LÁMINA 1: ¿Cuánto dura?\nLÁMINA 2: ¿Necesito acompañante?',
    captionText: 'Antes de tu procedimiento, resuelve estas tres dudas.',
    finalAssets: [{ id: 'a2', name: 'carrusel-1.jpg', storageKey: 'k2', mimeType: 'image/jpeg', size: 400000, position: 0 }]
  }),
  piece('i3', 'Conoce al equipo de hemodinamia', 'Reel', 30, 'EN_REVISION', { captionText: 'Detrás de cada procedimiento hay un equipo.' }),
  piece('i4', 'Qué llevar el día de tu consulta', 'Post', 22, 'APROBADO', {
    captionText: 'Documento, orden médica y exámenes previos.',
    finalAssets: [{ id: 'a4', name: 'post-checklist.jpg', storageKey: 'k4', mimeType: 'image/jpeg', size: 300000, position: 0 }]
  }),
  piece('i5', 'La sala de espera que no parece una sala de espera', 'Reel', 18, 'BORRADOR'),
  piece('i6', 'Agenda tu cita en tres pasos', 'Carrusel', 15, 'EN_PRODUCCION', { captionText: 'Llamas, eliges horario y listo.' }),
  piece('i7', 'Historias que empiezan con un diagnóstico a tiempo', 'Reel', 12, 'DEVUELTO', { captionText: 'Un diagnóstico a tiempo cambia el final.' }),
  piece('i8', 'Una unidad de PromoGroup IPS', 'Post', 9, 'BORRADOR')
];

const plan = {
  id: 'p1', month: 9, year: 2026, status: 'EN_REVISION',
  strategicObjectives: 'Posicionar a ENDOVA como una unidad de atención especializada cercana.',
  internalNotes: null, shareToken: null, client, owner: member, items
};

axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });

  if (url.includes('/api/content/plans')) return ok(plan);
  if (url.includes('/api/team')) return ok([member]);
  if (url.includes('/api/clients')) return ok([client]);
  if (url.includes('/api/user')) return ok(user);
  return ok([]);
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={['/parrillas/promogroup/9-2026']}>
          <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <Routes>
              <Route path="/parrillas/:clientSlug/:period" element={<ContentPlanDetail />} />
            </Routes>
            <Toaster position="top-right" />
          </div>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
