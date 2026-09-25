import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import SharedContentPlan from '../../src/components/public/SharedContentPlan';
import '../../src/index.css';

// Muestra local del portal del cliente rediseñado (Rodny, 24 de septiembre de 2026). Nada se guarda:
// la API vive en memoria. Se monta el componente **real**, así que lo que se ve aquí es lo que se
// despliega — incluido el hecho de que el guion no llega: la respuesta simulada tampoco lo manda,
// igual que `publicController.js`.

const piece = (id, objective, format, day, status, opts = {}) => ({
  id,
  objective,
  format,
  captionText: opts.caption || null,
  publishDate: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  mediaUrl: opts.mediaUrl || [],
  status,
  comments: opts.comments || null,
  finalAsset: null,
  finalAssets: opts.assets || []
});

const CAPTION = `Hay lugares que empiezan a cuidar de ti incluso antes de la consulta. 💙

En ENDOVA hemos pensado cada espacio y cada momento para acompañar una experiencia de atención especializada, desde que llegas hasta que termina tu recorrido.

📍 Conoce ENDOVA y descubre nuestro espacio de atención.

#ENDOVA #PromoGroup #AtenciónEspecializada #Salud #Medellín #ExperienciaDeAtención`;

// Láminas de mentira servidas por el propio Vite. Tienen que ser URLs absolutas: `getPublicAssetUrl`
// antepone la base de la API a todo lo que no empiece por `http`, y un `data:` URI acabaría roto.
const swatch = (file) => `${window.location.origin}/tests/fixtures/portal-assets/${file}`;

const asset = (id, file, label) => ({
  id, name: label, mimeType: 'image/svg+xml', size: 240000, position: 0,
  url: swatch(file)
});

const items = [
  piece('i1', 'ENDOVA, un espacio preparado para recibirte', 'Reel', 24, 'APROBADO', {
    caption: CAPTION,
    assets: [asset('a1', 'reel-llegada.svg', 'Reel · llegada'), asset('a2', 'reel-recorrido.svg', 'Reel · recorrido')],
    mediaUrl: ['https://drive.google.com/referencia'],
    comments: '[Cliente - 18/09/2026]: ¿Podemos mostrar más la sala de espera?'
  }),
  piece('i2', 'Tres preguntas antes de tu procedimiento', 'Carrusel', 28, 'EN_REVISION', {
    caption: 'Antes de tu procedimiento, resuelve estas tres dudas con tu especialista.\n\n#ENDOVA #Salud',
    assets: [asset('a3', 'pieza-cuadrada.svg', 'Carrusel · lámina 1')]
  }),
  piece('i3', 'Conoce al equipo de hemodinamia', 'Reel', 30, 'EN_REVISION', {
    caption: 'Detrás de cada procedimiento hay un equipo que lleva años preparándose.',
    assets: [asset('a4', 'reel-recorrido.svg', 'Reel · equipo')]
  }),
  piece('i4', 'Qué llevar el día de tu consulta', 'Post', 22, 'APROBADO', {
    caption: 'Documento, orden médica y tus exámenes previos. Nada más.',
    assets: [asset('a5', 'pieza-cuadrada.svg', 'Post · checklist')]
  }),
  piece('i5', 'La sala de espera que no parece una sala de espera', 'Reel', 18, 'BORRADOR', {
    caption: 'Un lugar pensado para que la espera no se sienta como una espera.'
  }),
  piece('i6', 'Agenda tu cita en tres pasos', 'Carrusel', 15, 'APROBADO', {
    caption: 'Llamas, eliges horario y listo.\n\n#ENDOVA #Medellín',
    assets: [asset('a6', 'pieza-cuadrada.svg', 'Carrusel · agenda')]
  }),
  piece('i7', 'Historias que empiezan con un diagnóstico a tiempo', 'Reel', 12, 'EN_REVISION', {
    caption: 'Un diagnóstico a tiempo cambia el final de la historia.'
  }),
  piece('i8', 'Una unidad de PromoGroup IPS', 'Post', 9, 'EN_REVISION', {
    caption: 'ENDOVA es una unidad de PromoGroup IPS.'
  })
];

const plan = {
  id: 'p1',
  month: 9,
  year: 2026,
  strategicObjectives: 'Posicionar a ENDOVA como una unidad de atención especializada cercana, explicando la experiencia completa del paciente antes, durante y después del procedimiento.',
  client: { name: 'PromoGroup IPS', logoUrl: null },
  items
};

axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });

  if (url.includes('/approve')) {
    const id = url.split('/items/')[1].split('/')[0];
    const found = plan.items.find(entry => entry.id === id);
    if (found) found.status = 'APROBADO';
    return ok({ ok: true });
  }
  if (url.includes('/comment')) return ok(null);
  if (url.includes('/api/public/parrilla')) return ok(plan);
  return ok({});
};

createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={['/parrilla/demo-token']}>
    <Routes>
      <Route path="/parrilla/:token" element={<SharedContentPlan />} />
    </Routes>
    <Toaster position="top-right" />
  </MemoryRouter>
);
