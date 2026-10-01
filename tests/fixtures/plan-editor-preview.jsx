import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

// Redes conectadas del cliente (29 de septiembre de 2026): lo que la parrilla necesita para ofrecer
// «Programar». Sin el token, que nunca viaja al navegador.
const socialAccounts = [
  { id: 'acc-fb', clientId: 'c1', platform: 'FACEBOOK', externalId: '5555', displayName: 'PromoGroup IPS', pageId: '5555', isActive: true, connectedAt: '2026-09-20T12:00:00.000Z', lastError: null },
  { id: 'acc-ig', clientId: 'c1', platform: 'INSTAGRAM', externalId: '1789', displayName: '@promogroupips', pageId: '5555', isActive: true, connectedAt: '2026-09-20T12:00:00.000Z', lastError: null }
];
const client = { id: 'c1', name: 'PromoGroup IPS', slug: 'promogroup', logoUrl: null, socialAccounts };
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
  publishTime: extra.publishTime || null,
  publications: extra.publications || [],
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
    // Una nota larga de verdad: con alto fijo en la franja de la ficha, este texto se salía por
    // encima de toda la tarjeta (Rodny, 25 de septiembre de 2026).
    internalNotes: 'PONER TOMAS DE APOYO DE STOCK O IA. '.repeat(24).trim(),
    comments: '[Cliente - 18/09/2026]: ¿Podemos mostrar más la sala de espera?',
    finalAssets: [{ id: 'a1', name: 'reel-endova.mp4', storageKey: 'k1', mimeType: 'video/mp4', size: 31000000, position: 0 }],
    // Con hora puesta y sin programar todavía: el estado desde el que se pulsa «Programar».
    publishTime: '10:30'
  }),
  piece('i2', 'Tres preguntas antes de tu procedimiento', 'Carrusel', 28, 'EN_REVISION', {
    copyText: 'LÁMINA 1: ¿Cuánto dura?\nLÁMINA 2: ¿Necesito acompañante?',
    captionText: 'Antes de tu procedimiento, resuelve estas tres dudas.',
    finalAssets: [{ id: 'a2', name: 'carrusel-1.jpg', storageKey: 'k2', mimeType: 'image/jpeg', size: 400000, position: 0 }]
  }),
  piece('i3', 'Conoce al equipo de hemodinamia', 'Reel', 30, 'EN_REVISION', { captionText: 'Detrás de cada procedimiento hay un equipo.' }),
  piece('i4', 'Qué llevar el día de tu consulta', 'Post', 22, 'APROBADO', {
    captionText: 'Documento, orden médica y exámenes previos.',
    finalAssets: [{ id: 'a4', name: 'post-checklist.jpg', storageKey: 'k4', mimeType: 'image/jpeg', size: 300000, position: 0 }],
    // Ya programada en Instagram y publicada en Facebook: cómo se ve una pieza a medio salir.
    publishTime: '09:00',
    publications: [
      { id: 'pub-i4-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: '2026-09-22T14:00:00.000Z', attempts: 0 },
      { id: 'pub-i4-fb', platform: 'FACEBOOK', status: 'PUBLISHED', publishedAt: '2026-09-22T14:00:12.000Z', permalink: 'https://www.facebook.com/5555/posts/77' }
    ]
  }),
  piece('i5', 'La sala de espera que no parece una sala de espera', 'Reel', 18, 'BORRADOR'),
  piece('i6', 'Agenda tu cita en tres pasos', 'Carrusel', 15, 'EN_PRODUCCION', {
    captionText: 'Llamas, eliges horario y listo.',
    finalAssets: [
      { id: 'a6a', name: 'paso-1.jpg', storageKey: 'k6a', mimeType: 'image/jpeg', size: 300000, position: 0 },
      { id: 'a6b', name: 'paso-2.jpg', storageKey: 'k6b', mimeType: 'image/jpeg', size: 300000, position: 1 },
      { id: 'a6c', name: 'paso-3.jpg', storageKey: 'k6c', mimeType: 'image/jpeg', size: 300000, position: 2 }
    ],
    // Falló en Instagram con el motivo entero: así se ve lo que hay que leer.
    publishTime: '18:00',
    publications: [
      { id: 'pub-i6-ig', platform: 'INSTAGRAM', status: 'FAILED', attempts: 3, error: 'Meta rechazó la proporción de la imagen: en el feed acepta de 4:5 a 1.91:1.' }
    ]
  }),
  piece('i7', 'Historias que empiezan con un diagnóstico a tiempo', 'Reel', 12, 'DEVUELTO', { captionText: 'Un diagnóstico a tiempo cambia el final.' }),
  piece('i8', 'Una unidad de PromoGroup IPS', 'Post', 9, 'BORRADOR')
];

// `?futuro=1` mueve la primera pieza a mañana: la parrilla de la muestra es de septiembre de 2026 y
// programar exige una hora por delante, así que sin esto «Programar» sale apagado con su motivo.
if (new URLSearchParams(window.location.search).get('futuro') === '1') {
  items[0].publishDate = `${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T12:00:00.000Z`;
}

const plan = {
  id: 'p1', month: 9, year: 2026, status: 'EN_REVISION',
  strategicObjectives: 'Posicionar a ENDOVA como una unidad de atención especializada cercana.',
  // Con enlace ya creado: así se ve «Copiar link», que es el estado normal de una parrilla compartida.
  internalNotes: null, shareToken: 'demo-token-parrilla', client, owner: member, items
};

// La cola de publicación vive en memoria: «Programar», «Cancelar» y «Reintentar» cambian estas filas
// y la parrilla se vuelve a leer, igual que con el servidor de verdad.
const bogotaHour = (item) => `${new Date(item.publishDate).toISOString().slice(0, 10)}T${item.publishTime}:00-05:00`;
const socialApi = (config, url, ok, fail) => {
  const method = String(config.method || 'get').toLowerCase();
  const body = config.data ? JSON.parse(config.data) : {};
  if (method === 'post' && url.endsWith('/api/social/publications')) {
    const item = items.find((candidate) => candidate.id === body.itemId);
    if (!item) return fail(404, { error: 'La pieza no existe.' });
    if (!item.publishTime) return fail(422, { error: 'La pieza necesita fecha y hora de publicación.', code: 'SOCIAL_PUBLICATION_INVALID', problems: ['La pieza necesita fecha y hora de publicación.'] });
    const created = (body.platforms || []).map((platform) => {
      const row = { id: `pub-${item.id}-${platform.toLowerCase()}`, platform, status: 'SCHEDULED', scheduledAt: new Date(bogotaHour(item)).toISOString(), attempts: 0, requestedById: user.id };
      item.publications = [...item.publications.filter((existing) => existing.platform !== platform), row];
      return row;
    });
    return { ...ok(created), status: 201 };
  }
  const retry = /\/api\/social\/publications\/([^/]+)\/retry$/.exec(url);
  const cancel = method === 'delete' && /\/api\/social\/publications\/([^/]+)$/.exec(url);
  const id = retry?.[1] || cancel?.[1];
  if (id) {
    for (const item of items) {
      const row = item.publications.find((candidate) => candidate.id === id);
      if (!row) continue;
      if (retry) Object.assign(row, { status: 'SCHEDULED', attempts: 0, error: null, scheduledAt: new Date().toISOString() });
      else Object.assign(row, { status: 'CANCELLED', cancelledAt: new Date().toISOString() });
      return ok(row);
    }
    return fail(404, { error: 'La publicación no existe.' });
  }
  return null;
};

axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
  const fail = (status, data) => Promise.reject(Object.assign(new Error(data.error || 'Error'), { response: { status, data }, config }));

  if (url.includes('/api/social/')) return socialApi(config, url, ok, fail) || ok([]);
  // Ordenar los archivos de una pieza: el PUT real reescribe las posiciones y devuelve la lista.
  const reorder = String(config.method || '').toLowerCase() === 'put' && /\/api\/content\/items\/([^/?]+)\/final-assets\/order$/.exec(url);
  if (reorder) {
    const item = items.find((candidate) => candidate.id === reorder[1]);
    const order = JSON.parse(config.data || '{}').order || [];
    if (item) item.finalAssets = order.map((id, position) => ({ ...item.finalAssets.find((asset) => asset.id === id), position }));
    return ok(item?.finalAssets || []);
  }
  // Cambiar la hora de una pieza desde la ficha: el PATCH real guarda `publishTime`.
  const patchItem = String(config.method || '').toLowerCase() === 'patch' && /\/api\/content\/items\/([^/?]+)$/.exec(url);
  if (patchItem) {
    const item = items.find((candidate) => candidate.id === patchItem[1]);
    if (item) Object.assign(item, JSON.parse(config.data || '{}'));
    return ok(item || {});
  }
  if (url.includes('/api/content/plans')) return ok(plan);
  if (url.includes('/api/team')) return ok([member]);
  if (url.includes('/api/clients')) return ok([client]);
  if (url.includes('/api/user')) return ok(user);
  return ok([]);
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

/**
 * Saca la URL del router a un atributo del DOM. El `MemoryRouter` no toca la barra del navegador, así
 * que sin esto no habría forma de comprobar desde fuera que la pieza abierta la manda la URL —que es
 * justo lo que impide que un enlace de Gestión abra la pieza equivocada.
 */
const usaRutaDePlan = new URLSearchParams(window.location.search).get('ruta') === 'plan';
const entryPath = usaRutaDePlan ? '/parrillas/p1' : '/parrillas/promogroup/9-2026';

/**
 * Imita lo que pasa de verdad en la pantalla: lo que hay **encima** de la tarjeta —el panel de Bria,
 * los textos que se auto-ajustan— termina de asentarse un momento después de pintarse, y la tarjeta
 * se sube. Si el desplazamiento ya calculó su destino, se queda pasado y corta la cabecera.
 * Se activa con `?asentar=1` para poder comprobar que el arreglo aguanta eso.
 */
const BloqueQueSeAsienta = () => {
  const [alto, setAlto] = React.useState(420);
  React.useEffect(() => {
    const id = setTimeout(() => setAlto(90), 900);
    return () => clearTimeout(id);
  }, []);
  return <div style={{ height: alto }} className="mb-6 rounded-2xl border border-dashed border-zinc-200 dark:border-white/10" aria-hidden="true" />;
};

const LocationProbe = () => {
  const location = useLocation();
  return <span className="sr-only" data-preview-location={location.search} />;
};

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ConfirmDialogProvider>
        {/* La consulta de la página entra al router, así se puede probar un enlace directo:
            …plan-editor-preview.html?item=i5 tiene que abrir esa pieza, como al venir de Gestión.
            Con `?ruta=plan` se usa `/parrillas/:planId`, que es la ruta real del botón «Abrir
            Parrilla» de una tarea; sin él, la de cliente y periodo. */}
        <MemoryRouter initialEntries={[`${entryPath}${window.location.search}`]}>
          {/* El header real de la aplicación es fijo y translúcido (`h-16 fixed`). Sin él aquí, una
              tarjeta alineada con el borde de la ventana parecería bien colocada y en producción
              quedaría debajo del header. */}
          <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-zinc-200 bg-white/50 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/50" />
          <div className="min-h-screen bg-zinc-50 p-6 pt-20 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <LocationProbe />
            {new URLSearchParams(window.location.search).get('asentar') === '1' && <BloqueQueSeAsienta />}
            <Routes>
              <Route path="/parrillas/:clientSlug/:period" element={<ContentPlanDetail />} />
              <Route path="/parrillas/:planId" element={<ContentPlanDetail />} />
            </Routes>
            <Toaster position="top-right" />
          </div>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);
