import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import LinkedInCallback from '../../src/components/modules/LinkedInCallback';
import TikTokCallback from '../../src/components/modules/TikTokCallback';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import { BrainTimePicker } from '../../src/components/ui/BrainDatePicker';
import SocialPublishingPanel from '../../src/components/modules/ContentPlan/SocialPublishingPanel';
import SocialAccountsWidget from '../../src/components/modules/SocialAccountsWidget';
import '../../src/index.css';

// Muestra local de la publicación en redes (29 de septiembre de 2026). Sin servidor ni base: las
// cuentas y las filas de la cola viven en memoria. Lo real es la regla: `schedulingProblems` es el
// mismo módulo que usa el servidor, así que los avisos que se ven aquí son los que verá el equipo.

const ig = { id: 'acc-ig', clientId: 'c1', platform: 'INSTAGRAM', externalId: '1789', displayName: '@titanescartagena', pageId: '5555', isActive: true, connectedAt: '2036-10-01T12:00:00.000Z', lastError: null };
const fb = { id: 'acc-fb', clientId: 'c1', platform: 'FACEBOOK', externalId: '5555', displayName: 'Titanes Cartagena', pageId: '5555', isActive: true, connectedAt: '2036-10-01T12:00:00.000Z', lastError: null };
const fbDead = { ...fb, isActive: false, lastError: 'La conexión con Meta venció: hay que volver a conectar la cuenta desde la ficha del cliente.' };

// LinkedIn (23 de noviembre de 2026): una página de empresa es un destino aparte, que cada pieza marca si quiere.
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const li = { id: 'acc-li', clientId: 'c5', platform: 'LINKEDIN', externalId: '2414183', displayName: 'Titanes Cartagena S.A.S.', pageId: 'linkedin:2414183', isActive: true, lastError: null, authorization: { expiresAt: inDays(52), refreshExpiresAt: null, canRefresh: false } };
const liExpiring = { ...li, id: 'acc-li2', externalId: '99', pageId: 'linkedin:99', displayName: 'Fundación Titanes por la Educación del Caribe', authorization: { expiresAt: inDays(4), refreshExpiresAt: null, canRefresh: false } };

// TikTok (25 de noviembre de 2026): otra cuenta aparte, solo video, y con preguntas propias antes de programar.
const tt = { id: 'acc-tt', clientId: 'c5', platform: 'TIKTOK', externalId: 'open-1', displayName: '@titanescartagena', pageId: 'tiktok:open-1', isActive: true, lastError: null, authorization: { expiresAt: inDays(1), refreshExpiresAt: inDays(300), canRefresh: true } };
const ttCreator = { accountId: 'acc-tt', username: 'titanescartagena', nickname: 'Titanes Cartagena', avatarUrl: null, privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoDurationSeconds: 600 };
const loadTikTokCreatorInfo = async () => ttCreator;

const image = { id: 'a1', name: 'post-final.jpg', mimeType: 'image/jpeg', size: 2_400_000, storageKey: 'k/post.jpg' };
const video = { id: 'v1', name: 'reel-final.mp4', mimeType: 'video/mp4', size: 48_000_000, storageKey: 'k/reel.mp4' };
const drive = { id: 'd1', name: 'reel en Drive', externalProvider: 'DRIVE', externalFileId: 'abc', externalUrl: 'https://drive.google.com/file/d/abc/view' };

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const base = { id: 'item-1', format: 'Post', status: 'APROBADO', captionText: 'Nueva temporada, nuevo equipo. #titanes', publishDate: `${tomorrow}T00:00:00.000Z`, publishTime: '10:30', finalAssets: [image], publications: [] };

const CASES = [
  { title: 'Lista para programar (Instagram y Facebook)', item: base, accounts: [ig, fb] },
  { title: 'Sin hora todavía', item: { ...base, publishTime: null }, accounts: [ig, fb] },
  { title: 'Borrador, sin pieza final y con enlace de Drive', item: { ...base, status: 'BORRADOR', finalAssets: [drive] }, accounts: [ig, fb] },
  { title: 'Reel programado en Instagram; Facebook publicado', item: { ...base, format: 'Reel', finalAssets: [video], publications: [
    { id: 'p1', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: `${tomorrow}T15:30:00.000Z`, attempts: 0 },
    { id: 'p2', platform: 'FACEBOOK', status: 'PUBLISHED', publishedAt: new Date().toISOString(), permalink: 'https://www.facebook.com/5555/videos/1' }
  ] }, accounts: [ig, fb] },
  { title: 'Falló en Instagram; Facebook desconectado', item: { ...base, publications: [
    { id: 'p3', platform: 'INSTAGRAM', status: 'FAILED', attempts: 3, error: 'Meta rechazó la proporción de la imagen: en el feed acepta de 4:5 a 1.91:1.' }
  ] }, accounts: [ig, fbDead] },
  { title: 'Publicando ahora mismo', item: { ...base, publications: [{ id: 'p4', platform: 'INSTAGRAM', status: 'PUBLISHING', scheduledAt: new Date().toISOString(), attempts: 0 }] }, accounts: [ig] },
  { title: 'Cliente sin redes conectadas', item: base, accounts: [] },
  { title: 'Con LinkedIn: Instagram, Facebook y la página de empresa', item: base, accounts: [ig, fb, li] },
  { title: 'Solo LinkedIn, programado', item: { ...base, publications: [{ id: 'p5', socialAccountId: 'acc-li', platform: 'LINKEDIN', status: 'SCHEDULED', scheduledAt: `${tomorrow}T15:30:00.000Z`, attempts: 0 }] }, accounts: [li] },
  { title: 'Historia con LinkedIn conectado', item: { ...base, format: 'Historia' }, accounts: [ig, fb, li] },
  { title: 'LinkedIn publicado; Instagram falló', item: { ...base, publications: [
    { id: 'p6', socialAccountId: 'acc-li', platform: 'LINKEDIN', status: 'PUBLISHED', publishedAt: new Date().toISOString(), permalink: 'https://www.linkedin.com/feed/update/urn:li:share:1/' },
    { id: 'p7', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'FAILED', attempts: 1, error: 'Instagram todavía no había terminado de procesar el archivo. El archivo está bien: pulsa «Reintentar».' }
  ] }, accounts: [ig, fb, li] },
  { title: 'Reel con TikTok conectado', item: { ...base, id: 'item-tt', format: 'Reel', finalAssets: [video] }, accounts: [ig, fb, tt] },
  { title: 'Post de imagen con TikTok conectado (TikTok solo recibe videos)', item: { ...base, id: 'item-tt2' }, accounts: [ig, fb, tt] },
  { title: 'TikTok programado; Instagram publicado', item: { ...base, id: 'item-tt3', format: 'Reel', finalAssets: [video], publications: [
    { id: 'p8', socialAccountId: 'acc-tt', platform: 'TIKTOK', status: 'SCHEDULED', scheduledAt: `${tomorrow}T15:30:00.000Z`, attempts: 0, options: { privacyLevel: 'PUBLIC_TO_EVERYONE', allowComment: true, commercial: true, yourBrand: true, consent: true } },
    { id: 'p9', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'PUBLISHED', publishedAt: new Date().toISOString(), permalink: 'https://www.instagram.com/reel/x/' }
  ] }, accounts: [ig, fb, tt] }
];

// La pantalla a la que TikTok devuelve a la persona: se confirma la cuenta antes de guardarla.
if (new URLSearchParams(window.location.search).has('tiktok')) {
  axios.defaults.adapter = async (config) => ({
    status: 200, statusText: 'OK', headers: {}, config,
    data: { clientId: 'c5', clientName: 'Titanes Cartagena', pending: 'x', account: { username: 'titanescartagena', nickname: 'Titanes Cartagena', avatarUrl: null } }
  });
}

// La pantalla a la que LinkedIn devuelve a la persona: el servidor contesta con las páginas que administra.
if (new URLSearchParams(window.location.search).has('linkedin')) {
  axios.defaults.adapter = async (config) => ({
    status: 200, statusText: 'OK', headers: {}, config,
    data: { clientId: 'c5', clientName: 'Titanes Cartagena', pending: 'x', organizations: [
      { organizationId: '2414183', name: 'Titanes Cartagena S.A.S.', vanityName: 'titanes-cartagena' },
      { organizationId: '99', name: 'Fundación Titanes por la Educación del Caribe', vanityName: 'fundacion-titanes-por-la-educacion-del-caribe' },
      { organizationId: '7', name: 'Brain Studio', vanityName: 'brainstudioagencia' }
    ] }
  });
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
queryClient.setQueryData(['social-accounts', 'c1'], [fb, ig]);
queryClient.setQueryData(['social-accounts', 'c2'], []);
queryClient.setQueryData(['social-accounts', 'c5'], [{ ...fb, clientId: 'c5' }, { ...ig, clientId: 'c5' }, li, liExpiring, tt]);
queryClient.setQueryData(['social-accounts', 'c3'], [fbDead, ig]);
// Un cliente con dos cuentas (2 de octubre de 2026): PromoGroup IPS, la primera que se conectó, y Endova.
queryClient.setQueryData(['social-accounts', 'c4'], [
  { id: 'p-fb', clientId: 'c4', platform: 'FACEBOOK', externalId: '100', displayName: 'PromoGroup IPS', pageId: '100', isActive: true, isPrimary: true, lastError: null },
  { id: 'p-ig', clientId: 'c4', platform: 'INSTAGRAM', externalId: 'ig100', displayName: '@promogroup.ips', pageId: '100', isActive: true, isPrimary: true, lastError: null },
  { id: 'e-fb', clientId: 'c4', platform: 'FACEBOOK', externalId: '200', displayName: 'Endova', pageId: '200', isActive: true, isPrimary: false, lastError: null },
  { id: 'e-ig', clientId: 'c4', platform: 'INSTAGRAM', externalId: 'ig200', displayName: '@endova.salud', pageId: '200', isActive: true, isPrimary: false, lastError: null }
]);
// «Conectar página» con muchas páginas (1 de octubre de 2026: en producción pasaron a ser 69): el
// buscador, el orden alfabético y la lista con scroll se ven aquí sin llamar a Meta.
const SAMPLE_PAGES = [
  ['Titanes Cartagena', 'titanescartagena'], ['Martínez & Nájera Abogados', 'martinezynajera'], ['Clínica del Mar', 'clinicadelmar'],
  ['Barra Lima', null], ['Fundación Río Claro', 'fundacionrioclaro'], ['Colegio Los Álamos', 'colegiolosalamos'],
  ['Panadería La Espiga', null], ['Óptica Central', 'opticacentral'], ['Hotel Bahía Azul', 'hotelbahiaazul'],
  ['Academia Samurái', 'academiasamurai'], ['Vinos del Puerto', 'vinosdelpuerto'], ['Ferretería El Tornillo', null],
  ['Estudio Ñandú', 'estudionandu'], ['Zapatería Paso Firme', 'pasofirme'],
  // Un nombre largo de verdad: el diálogo se salía por la derecha con uno así (24 de noviembre de 2026).
  ['Corporación Universitaria Empresarial de Salamanca y del Caribe Colombiano Sede Barranquilla', 'corporacion_universitaria_empresarial_de_salamanca_barranquilla']
].map(([pageName, username], index) => ({ pageId: `page-${index + 1}`, pageName, instagram: username ? { id: `ig-${index + 1}`, username } : null }));
queryClient.setQueryData(['social-available-pages'], { configured: true, pages: SAMPLE_PAGES });

function Caso({ title, item, accounts }) {
  const [hora, setHora] = useState(item.publishTime || '');
  const [log, setLog] = useState([]);
  const current = { ...item, publishTime: hora || null };
  const note = (text) => setLog((prev) => [text, ...prev].slice(0, 3));
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4 dark:border-white/5">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h2>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Hora</span>
          <BrainTimePicker id={`hora-${title}`} value={hora} onChange={setHora} ariaLabel="Hora de publicación" className="h-11" />
        </div>
      </div>
      <SocialPublishingPanel
        key={`${hora}-${item.id}`}
        item={current}
        accounts={accounts}
        onSchedule={(id, platforms) => note(`Programar ${platforms.join(' y ')}`)}
        onCancel={(id) => note(`Cancelar ${id}`)}
        onRetry={(id) => note(`Reintentar ${id}`)}
        loadTikTokCreatorInfo={loadTikTokCreatorInfo}
      />
      {log.length > 0 && <p className="px-6 pb-4 text-[11px] text-zinc-400">Acciones: {log.join(' · ')}</p>}
    </section>
  );
}

function App() {
  const [dark, setDark] = useState(new URLSearchParams(window.location.search).has('dark'));
  if (new URLSearchParams(window.location.search).has('linkedin')) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
          <MemoryRouter initialEntries={['/linkedin/callback?code=muestra&state=muestra']}><LinkedInCallback /></MemoryRouter>
        </div>
      </div>
    );
  }
  if (new URLSearchParams(window.location.search).has('tiktok')) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
          <MemoryRouter initialEntries={['/tiktok/callback?code=muestra&state=muestra']}><TikTokCallback /></MemoryRouter>
        </div>
      </div>
    );
  }
  const only = new URLSearchParams(window.location.search).get('solo');
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Publicación en redes · muestra local</h1>
              <p className="text-sm text-zinc-500">Banda de la pieza y ficha del cliente. Sin backend.</p>
            </div>
            <button type="button" onClick={() => setDark((value) => !value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold dark:border-white/10 dark:bg-zinc-900">
              {dark ? 'Modo claro' : 'Modo oscuro'}
            </button>
          </header>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <SocialAccountsWidget clientId="c5" canManage />
            <SocialAccountsWidget clientId="c4" canManage />
            <SocialAccountsWidget clientId="c1" canManage />
            <SocialAccountsWidget clientId="c2" canManage />
            <SocialAccountsWidget clientId="c3" canManage={false} />
          </div>
          {CASES.filter((caso) => !only || caso.title.toLowerCase().includes(only.toLowerCase())).map((caso) => <Caso key={caso.title} {...caso} />)}
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <ConfirmDialogProvider>
      <App />
    </ConfirmDialogProvider>
  </QueryClientProvider>
);
