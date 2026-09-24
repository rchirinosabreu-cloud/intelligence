import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import ContentPlanDetail from '../../src/components/modules/ContentPlanDetail';
import { AuthProvider } from '../../src/context/AuthContext';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import { DRIVE_PROVIDER, parseDriveFileId } from '../../src/lib/driveLinks';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local de las dos formas de entregar una pieza final pesada (Rodny, 24 de septiembre de 2026):
// el enlace de Drive y la subida directa al almacenamiento. Nada se guarda: la API vive en memoria.
// Se monta el componente **real**, no una copia, y la subida directa recorre su camino de verdad
// —firmar, entregar con progreso, confirmar— porque el adaptador de axios hace de las tres paradas.

const user = { id: 'u-rodny', userId: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: {}, teamMemberId: 'm-rodny' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));

const client = { id: 'c1', name: 'Corporación Titanes', slug: 'titanes', logoUrl: null };
const member = { id: 'm-mel', userId: 'u-mel', name: 'Melissa', avatarUrl: null, role: 'Community Manager' };

const baseItem = {
  planId: 'p1', objective: 'Reconocimiento', format: 'Reel',
  copyText: 'Tres señales de que tu equipo necesita un plan de contenido.',
  captionText: '¿Te suena alguna? Cuéntanos en comentarios 👇',
  mediaUrl: [], assetsLinks: [], internalNotes: null, comments: null,
  status: 'BORRADOR', tasks: []
};

const driveAsset = {
  id: 'a-drive',
  name: 'Reel lanzamiento (máster 480 MB)',
  storageKey: null, mimeType: null, size: null,
  externalProvider: DRIVE_PROVIDER,
  externalFileId: '1AbC_defGHIjklMNOpqrSTUvwx234567',
  externalUrl: 'https://drive.google.com/file/d/1AbC_defGHIjklMNOpqrSTUvwx234567/view',
  position: 0
};

const items = [
  { ...baseItem, id: 'i-drive', objective: 'Lanzamiento', publishDate: '2026-09-10T12:00:00.000Z', finalAssets: [driveAsset] },
  { ...baseItem, id: 'i-subida', publishDate: '2026-09-17T12:00:00.000Z', finalAssets: [] }
];

const plan = {
  id: 'p1', month: 9, year: 2026, status: 'EN_REVISION',
  strategicObjectives: 'Sostener la conversación sobre estrategia de contenido.',
  internalNotes: null, shareToken: null, client, owner: member, items
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// La API en memoria. `axios` no pasa por `fetch`, así que se cambia su adaptador — y eso sirve
// también para la entrega al almacenamiento, que en producción sale fuera de nuestro dominio.
axios.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });

  if (url.includes('/final-assets/direct-upload')) {
    const files = config.data ? JSON.parse(config.data).files : [];
    return ok(files.map((file, index) => ({
      key: `content-plans/titanes/2026-09/i-subida/final-assets/${index}_demo_${file.name}`,
      url: `https://almacenamiento.example/put/${index}`,
      name: file.name,
      mimeType: file.mimeType
    })));
  }

  if (url.startsWith('https://almacenamiento.example/')) {
    // La entrega real informa del avance; aquí se imita para poder mirar la barra.
    const total = config.data?.size || 1;
    for (let step = 1; step <= 10; step += 1) {
      await sleep(320);
      config.onUploadProgress?.({ loaded: Math.round((total * step) / 10), total });
    }
    return ok('');
  }

  if (url.includes('/final-assets/confirm')) {
    const uploads = JSON.parse(config.data).uploads;
    items[1].finalAssets = uploads.map((upload, index) => ({
      id: `a-subido-${index}`, name: upload.name, storageKey: upload.key,
      mimeType: 'video/mp4', size: 105 * 1024 * 1024, position: index
    }));
    return ok(items[1].finalAssets);
  }

  if (url.includes('/final-assets/drive')) {
    const body = JSON.parse(config.data);
    items[1].finalAssets = [{
      id: 'a-drive-nuevo', name: body.name || 'Video en Drive',
      storageKey: null, mimeType: null, size: null,
      externalProvider: DRIVE_PROVIDER,
      externalFileId: parseDriveFileId(body.url),
      externalUrl: body.url, position: 0
    }];
    return ok(items[1].finalAssets);
  }

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
        <MemoryRouter initialEntries={['/parrillas/titanes/9-2026']}>
          <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-sm dark:border-zinc-700">
              <p>Muestra local · datos ficticios en memoria · nada se guarda</p>
              <button className="min-h-11 rounded-lg border border-zinc-300 px-4 text-xs dark:border-zinc-700"
                onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
            </div>
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
