import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COVER_MAX_BYTES, COVER_RATIO, coverFileProblem, coverImagePlan, hasCover, kindAcceptsCover, publicCover,
  withPublicCover
} from '../src/lib/videoCover.js';
import { describeMetaMedia } from '../src/lib/socialPublishing.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// La portada de un video (Rodny, 15 de octubre de 2026: «a veces los videos que se publican necesitan
// portadas»). Lo que Meta admite, leído en su referencia ese día:
//
//   - Reel de Instagram: `cover_url` al crear el contenedor. JPEG, 8 MB, sRGB, 9:16 recomendado.
//   - Video de Facebook: `POST /{video-id}/thumbnails` con `source` e `is_preferred`, **después** de
//     publicar, así que una portada que falle no puede tumbar un video que ya salió.
//   - Historia de Instagram y video dentro de un carrusel: no la admiten.

const MB = 1024 * 1024;
const video = { id: 'v1', name: 'reel.mp4', mimeType: 'video/mp4', size: 20 * MB };
const foto = { id: 'f1', name: 'post.jpg', mimeType: 'image/jpeg', size: MB };

test('solo un reel lleva portada: ni una historia ni un video dentro de un carrusel', () => {
  assert.equal(kindAcceptsCover(describeMetaMedia({ format: 'Reel', assets: [video] }).kind), true);
  assert.equal(kindAcceptsCover(describeMetaMedia({ format: 'Video', assets: [video] }).kind), true);
  assert.equal(kindAcceptsCover(describeMetaMedia({ format: 'Historia', assets: [video] }).kind), false);
  assert.equal(kindAcceptsCover(describeMetaMedia({ format: 'Carrusel', assets: [foto, video] }).kind), false);
  assert.equal(kindAcceptsCover(describeMetaMedia({ format: 'Post', assets: [foto] }).kind), false);
});

test('el archivo de la portada se rechaza nombrándolo y diciendo el límite, nunca con un código', () => {
  assert.equal(coverFileProblem({ name: 'portada.jpg', mimeType: 'image/jpeg', size: MB }), null);
  assert.equal(coverFileProblem({ name: 'portada.png', mimeType: 'image/png', size: MB }), null);
  assert.match(coverFileProblem({ name: 'portada.gif', mimeType: 'image/gif', size: MB }), /«portada\.gif» debe ser JPG o PNG/);
  const pesada = coverFileProblem({ name: 'grande.jpg', mimeType: 'image/jpeg', size: 9 * MB });
  assert.match(pesada, /«grande\.jpg»/);
  assert.match(pesada, /9 MB/, 'dice cuánto pesa');
  assert.match(pesada, /8 MB/, 'y cuánto cabe');
  assert.equal(COVER_MAX_BYTES, 8 * MB);
});

test('la portada se prepara con margen hasta 9:16, nunca recortando', () => {
  // Ya es 9:16 y es JPEG: no hay nada que hacer.
  assert.deepEqual(coverImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1920, size: MB }), { convert: false, canvas: null, reasons: [] });

  // PNG, que es lo que exporta el equipo.
  assert.deepEqual(coverImagePlan({ mimeType: 'image/png', width: 1080, height: 1920, size: MB }).reasons, ['png']);

  // Apaisada: crece a lo alto, así que no se pierde nada de los lados.
  const apaisada = coverImagePlan({ mimeType: 'image/jpeg', width: 1920, height: 1080, size: MB });
  assert.deepEqual(apaisada.canvas, { width: 1920, height: Math.ceil(1920 / COVER_RATIO) });
  assert.ok(apaisada.canvas.height > 1080, 'crece, no recorta');

  // Más estrecha que 9:16: crece a lo ancho.
  const estrecha = coverImagePlan({ mimeType: 'image/jpeg', width: 500, height: 1920, size: MB });
  assert.deepEqual(estrecha.canvas, { width: Math.ceil(1920 * COVER_RATIO), height: 1920 });

  assert.ok(coverImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1920, size: 9 * MB }).reasons.includes('size'));
});

test('la pantalla ve el nombre de la portada, nunca su clave en el almacenamiento', () => {
  const item = { coverKey: 'content-plans/x/2026-10/i1/cover/abc.jpg', coverName: 'portada.jpg', coverMimeType: 'image/jpeg', coverSize: 1234 };
  assert.deepEqual(publicCover(item), { name: 'portada.jpg', mimeType: 'image/jpeg', size: 1234 });
  assert.equal(JSON.stringify(publicCover(item)).includes('content-plans'), false);
  assert.equal(publicCover({}), null);
  assert.equal(hasCover(item), true);
  assert.equal(hasCover({}), false);

  // La clave se saca de lo que se entrega, y eso lo hace la regla, no cada servicio.
  const rule = readFileSync('src/lib/videoCover.js', 'utf8');
  assert.match(rule, /const \{ coverKey: _key[^}]*\} = item;/);
  assert.match(rule, /cover: publicCover\(item\)/);

  // Y el servicio tampoco la deja salir en la pieza.
  const service = readFileSync('src/services/contentService.js', 'utf8');
  assert.match(service, /\.\.\.withPublicCover\(item\)/);
});

// «La subo y me dice guardada pero no aparece» (Rodny, 26 de octubre de 2026). La portada se guardaba
// bien —el aviso de éxito sale después de la respuesta del servidor—, pero las piezas que viajan dentro
// de una parrilla salían sin `cover`: el editor lee `item.cover` y leía vacío, así que el panel seguía
// diciendo «Sin portada» después de guardarla. Y la clave del almacenamiento sí viajaba al navegador.
test('una pieza que viene dentro de una parrilla también trae su portada, y nunca la clave', () => {
  const item = {
    id: 'i1', objective: 'Reel de la semana', format: 'Reel',
    coverKey: 'content-plans/x/2026-10/i1/cover/abc.jpg', coverName: 'portada.jpg',
    coverMimeType: 'image/jpeg', coverSize: 1234
  };
  const shown = withPublicCover(item);
  assert.deepEqual(shown.cover, { name: 'portada.jpg', mimeType: 'image/jpeg', size: 1234 });
  for (const column of ['coverKey', 'coverName', 'coverMimeType', 'coverSize']) {
    assert.equal(column in shown, false, `${column} se queda en el servidor`);
  }
  assert.equal(JSON.stringify(shown).includes('content-plans'), false);
  assert.equal(shown.objective, 'Reel de la semana', 'lo demás de la pieza no se toca');
  assert.equal(withPublicCover({ id: 'i2' }).cover, null, 'sin portada, `cover` es nulo, no indefinido');
  assert.equal(withPublicCover(null), null);

  // Los tres caminos que leen una parrilla entera pasan sus piezas por ahí: el editor, el carril y el
  // portal se alimentan de `items`, no de la pieza suelta.
  const service = readFileSync('src/services/contentService.js', 'utf8');
  assert.match(service, /const planItems = \(plan\) => \(plan\?\.contentItems \|\| \[\]\)\.map\(withPublicCover\)/);
  assert.equal(
    (service.match(/const items = planItems\(plan\);/g) || []).length,
    3,
    'getContentPlanById, getContentPlanBySlugAndPeriod y getContentPlanByToken'
  );
  // La fusión de la pieza final antigua se queda en la pieza suelta: el portal la entrega aparte
  // (`finalAsset` además de `finalAssets`) y normalizar ahí se la mostraría dos veces al cliente.
  assert.equal(service.includes('contentItems.map(normalizeContentItem)'), false);
});

test('las columnas son aditivas y las crea el arranque', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  for (const column of ['coverKey', 'coverName', 'coverMimeType', 'coverSize']) assert.match(schema, new RegExp(`\\b${column}\\b`));
  const ensure = readFileSync('scripts/ensure-content-cover-schema.js', 'utf8');
  assert.match(ensure, /ADD COLUMN IF NOT EXISTS "coverKey"/);
  assert.match(JSON.parse(readFileSync('package.json', 'utf8')).scripts.start, /ensure-content-cover-schema\.js/);
});

test('Facebook pone la portada después de publicar, y que falle no deshace el video', async () => {
  const meta = readFileSync('src/services/metaGraphService.js', 'utf8');
  // La referencia de Meta: el archivo va en `source` y `is_preferred` la deja como la que se muestra.
  assert.match(meta, /\$\{videoId\}\/thumbnails/);
  assert.match(meta, /is_preferred: true/);
  assert.match(meta, /field: 'source'/);

  const service = readFileSync('src/services/socialPublishingService.js', 'utf8');
  assert.match(service, /applyFacebookCover/);
  // Instagram la recibe al crear el contenedor; Facebook, sobre el video ya publicado.
  assert.ok(service.indexOf('publishToFacebookPage') < service.indexOf('applyFacebookCover({ item, videoId: result.mediaId'));
});

// --- El publicador, con una base de datos en memoria -------------------------------------------------

const NOW = new Date('2026-10-20T15:00:00.000Z'); // 10:00 en Bogotá
const cuenta = (platform) => ({ id: `acc-${platform}`, clientId: 'c1', platform, externalId: platform === 'INSTAGRAM' ? '1789' : '5555', displayName: 'Pablo Hoff', pageId: '5555', encryptedToken: 'enc', isActive: true });

const memoryDb = ({ cover = true, platform = 'INSTAGRAM' } = {}) => {
  const state = {
    item: {
      id: 'item-1', planId: 'plan-1', format: 'Reel', status: 'REALIZADO', captionText: 'Hola',
      publishDate: new Date('2026-10-20T00:00:00.000Z'), publishTime: '10:00', deletedAt: null,
      finalAssets: [video],
      coverKey: cover ? 'content-plans/x/cover/portada.png' : null,
      coverName: cover ? 'portada.png' : null, coverMimeType: cover ? 'image/png' : null, coverSize: cover ? 1024 : null,
      plan: { id: 'plan-1', clientId: 'c1', deletedAt: null, client: { id: 'c1', socialAccounts: [cuenta(platform)] } }
    },
    publications: [{ id: 'pub-1', contentItemId: 'item-1', socialAccountId: `acc-${platform}`, platform, status: 'SCHEDULED', scheduledAt: NOW, attempts: 0, leaseToken: null }]
  };
  const db = {
    contentItem: {
      findUnique: async () => ({ ...state.item, publications: state.publications }),
      update: async ({ data }) => { Object.assign(state.item, data); return state.item; }
    },
    socialPublication: {
      findMany: async () => state.publications.filter((row) => row.status === 'SCHEDULED'),
      findUnique: async ({ where }) => { const row = state.publications.find((r) => r.id === where.id); return row ? { ...row, socialAccount: cuenta(platform) } : null; },
      update: async ({ where, data }) => { const row = state.publications.find((r) => r.id === where.id); Object.assign(row, data); return row; },
      updateMany: async ({ data }) => { state.publications.forEach((row) => Object.assign(row, data)); return { count: state.publications.length }; },
      count: async () => state.publications.length
    },
    task: { findMany: async () => [] }
  };
  return { db, state };
};

const build = ({ db, prepareCover, calls = [], thumbnails = [], thumbnailFails = false }) => createSocialPublishingService({
  db,
  meta: {
    publishToInstagram: async ({ beforePublish, ...args }) => { calls.push(['instagram', args]); await beforePublish?.(); return { mediaId: 'ig-1', permalink: 'https://instagram.com/reel/1/' }; },
    publishToFacebookPage: async ({ beforePublish, ...args }) => { calls.push(['facebook', args]); await beforePublish?.(); return { mediaId: 'fb-video-1', permalink: 'https://facebook.com/1' }; },
    setFacebookVideoThumbnail: async (args) => { if (thumbnailFails) throw new Error('Meta rechazó la portada'); thumbnails.push(args); return true; }
  },
  now: () => NOW, decrypt: (v) => v,
  mediaUrlFor: async () => 'https://signed.example/reel.mp4',
  notify: async (d) => d,
  completeTask: async () => ({}),
  imageDerivatives: { prepareCover },
  readObject: async () => Buffer.from('bytes-de-la-portada'),
  signDownload: async ({ key }) => ({ url: `https://signed.example/${key}` }),
  randomId: () => 'lease', logger: { error() {}, info() {} }
});

test('Instagram recibe la portada como `cover_url` al crear el contenedor del reel', async () => {
  const { db } = memoryDb({ platform: 'INSTAGRAM' });
  const calls = [];
  const service = build({ db, calls, prepareCover: async () => ({ key: 'derived/portada.jpg', derived: true }) });
  await service.processDuePublications();
  const [[red, args]] = calls;
  assert.equal(red, 'instagram');
  assert.equal(args.kind, 'REELS');
  assert.equal(args.coverUrl, 'https://signed.example/derived/portada.jpg', 'la URL firmada de la copia preparada, no la del original');
});

test('una portada que no se puede preparar publica el reel igual, sin ella', async () => {
  // Perder la portada nunca puede costar la publicación: Meta elige entonces su propio fotograma.
  const { db, state } = memoryDb({ platform: 'INSTAGRAM' });
  const calls = [];
  const service = build({ db, calls, prepareCover: async () => { throw new Error('el bucket no responde'); } });
  const [outcome] = await service.processDuePublications();
  assert.equal(outcome.status, 'PUBLISHED', 'el reel salió');
  assert.equal(state.publications[0].status, 'PUBLISHED');
  assert.equal(calls[0][1].coverUrl, null, 'sin portada, no con una a medias');
});

test('Facebook pone la portada sobre el video ya publicado, y si falla el video sigue publicado', async () => {
  const { db, state } = memoryDb({ platform: 'FACEBOOK' });
  const thumbnails = [];
  await build({ db, thumbnails, prepareCover: async () => ({ key: 'derived/portada.jpg', derived: true }) }).processDuePublications();
  assert.equal(thumbnails.length, 1);
  assert.equal(thumbnails[0].videoId, 'fb-video-1', 'sobre el video que acaba de devolver Meta');
  assert.deepEqual(thumbnails[0].buffer, Buffer.from('bytes-de-la-portada'), 'Facebook la quiere en bytes, no por URL');
  assert.equal(state.publications[0].status, 'PUBLISHED');

  const fallida = memoryDb({ platform: 'FACEBOOK' });
  const [outcome] = await build({ db: fallida.db, thumbnailFails: true, prepareCover: async () => ({ key: 'derived/portada.jpg' }) }).processDuePublications();
  assert.equal(outcome.status, 'PUBLISHED', 'una portada rechazada no deshace un video que ya salió');
  assert.equal(fallida.state.publications[0].status, 'PUBLISHED');
  assert.equal(fallida.state.publications[0].error, null ?? fallida.state.publications[0].error);
});

test('una pieza sin portada no le pide nada a Meta de más', async () => {
  const { db } = memoryDb({ cover: false, platform: 'FACEBOOK' });
  const thumbnails = [];
  let prepared = 0;
  await build({ db, thumbnails, prepareCover: async () => { prepared += 1; return null; } }).processDuePublications();
  assert.equal(thumbnails.length, 0);
  assert.equal(prepared, 0, 'ni siquiera se intenta preparar: la pieza no tiene portada');
});
