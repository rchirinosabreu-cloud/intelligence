import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
    brandCompleteness,
    brandFileProblem,
    canEditBrand,
    hexToCmyk,
    matchBrandToClient,
    normalizeBrandInput,
    normalizeHex,
    readableTextOn,
    rgbText
} from '../src/lib/clientBrand.js';
import { clientBrandService, parseGoogleFontCss } from '../src/services/clientBrandService.js';
import { unzipSync } from 'fflate';

// Ficha de marca (Rodny, 18 de noviembre de 2026): una sola estructura para todos los clientes, la ve todo
// el equipo y la escribe quien lleva clientes.

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('un color se entiende escrito de cualquier forma y lo que no es HEX se rechaza diciendo cuál', () => {
    assert.equal(normalizeHex('# 009bbf'), '#009BBF');
    assert.equal(normalizeHex('abc'), '#AABBCC');
    assert.equal(normalizeHex('azul'), null);
    assert.equal(rgbText('#009BBF'), '0, 155, 191');
    assert.deepEqual(hexToCmyk('#000000'), { c: 0, m: 0, y: 0, k: 100 });
    const { brand, problems } = normalizeBrandInput({ colors: [{ hex: '#3b2a74' }, { hex: 'morado', name: 'Lila' }] });
    assert.equal(brand.colors.length, 1);
    assert.equal(brand.colors[0].role, 'PRINCIPAL', 'el primero es el principal si no se dice');
    assert.match(problems[0], /color 2 \(«Lila»\)/);
});

test('el texto sobre la muestra se lee: oscuro sobre claros, blanco sobre oscuros', () => {
    assert.equal(readableTextOn('#F4F1EC'), '#18181B');
    assert.equal(readableTextOn('#181933'), '#FFFFFF');
});

test('una fuente de Google se enlaza sola y una comercial no inventa enlace', () => {
    const { brand } = normalizeBrandInput({ fonts: [{ family: 'Josefin Sans', source: 'GOOGLE' }, { family: 'Massilia', source: 'COMERCIAL', url: 'javascript:alert(1)' }] });
    assert.equal(brand.fonts[0].url, 'https://fonts.google.com/specimen/Josefin+Sans');
    assert.equal(brand.fonts[1].url, null, 'un enlace que no es http(s) no se guarda');
});

test('la ficha dice qué le falta, empezando por lo que más se pregunta', () => {
    const empty = brandCompleteness({}, []);
    assert.equal(empty.done, 0);
    assert.deepEqual(empty.missing, ['Logo', 'Colores', 'Tipografías', 'Manual', 'Tono y reglas']);
    const full = brandCompleteness({ colors: [{}], fonts: [{}], manualUrl: 'https://x', voice: 'cercano' }, [{ kind: 'LOGO' }]);
    assert.equal(full.done, full.total);
    assert.equal(brandCompleteness({}, [{ kind: 'LOGO', deletedAt: new Date() }]).done, 0, 'un logo retirado no cuenta');
});

test('escribir una marca: dirección, project managers y editores con Clientes; ver, quien tenga Clientes', () => {
    assert.equal(canEditBrand({ role: 'ADMIN' }), true);
    assert.equal(canEditBrand({ role: 'PROJECT_MANAGER' }), true);
    assert.equal(canEditBrand({ role: 'EDITOR', modulePermissions: { clientes: true } }), true);
    assert.equal(canEditBrand({ role: 'EDITOR', modulePermissions: '{"clientes":true}' }), true);
    assert.equal(canEditBrand({ role: 'EDITOR', modulePermissions: {} }), false);
    assert.equal(canEditBrand({ role: 'VIEWER', modulePermissions: { clientes: true } }), false);
    const routes = source('src/routes/index.js');
    assert.match(routes, /router\.use\('\/brands', requireModulePermission\('clientes'\), createClientBrandRouter\(\)\);/, 'es parte del módulo de Clientes');
    assert.ok(routes.indexOf("router.use('/brands'") > routes.indexOf('router.use(authenticateToken)'), 'y detrás de la sesión');
    const router = source('src/routes/api/clientBrands.js');
    for (const line of router.split('\n').filter((l) => /router\.(put|post|delete)\(/.test(l))) assert.match(line, /requireBrandEdit/, line);
});

test('los archivos de marca: nada de SVG y cada tipo con sus formatos', () => {
    assert.match(brandFileProblem({ kind: 'LOGO', name: 'logo.svg', size: 10 }), /SVG/);
    assert.match(brandFileProblem({ kind: 'FUENTE', name: 'fuente.pdf', size: 10 }), /\.ttf/);
    assert.equal(brandFileProblem({ kind: 'FUENTE', name: 'Massilia-Bold.otf', size: 10 }), null);
    assert.equal(brandFileProblem({ kind: 'LOGO', name: 'logo.png', size: 10 }), null);
    assert.match(brandFileProblem({ kind: 'LOGO', name: 'logo.png', size: 60 * 1024 * 1024 }), /50 MB/);
    assert.match(brandFileProblem({ kind: 'OTRA', name: 'x.png', size: 1 }), /Elige/);
});

test('el importador encuentra al cliente solo por nombre exacto, nunca por parecido', () => {
    const clients = [{ id: '1', name: 'Wine Summit', slug: 'wine-summit' }, { id: '2', name: 'Wine & Wonder', slug: 'wine-wonder' }, { id: '3', name: 'Aristea Consultoría', slug: 'aristea' }];
    assert.equal(matchBrandToClient({ aliases: ['Aristea'] }, clients).client.id, '3', 'por el slug');
    assert.equal(matchBrandToClient({ aliases: ['Aristea Consultoria'] }, clients).client.id, '3', 'sin tildes');
    assert.equal(matchBrandToClient({ aliases: ['Wine'] }, clients).client, null);
    const twice = matchBrandToClient({ aliases: ['Wine Summit', 'Wine & Wonder'] }, clients);
    assert.equal(twice.client, null);
    assert.match(twice.problem, /varios clientes/);
});

test('las fichas extraídas de los manuales son válidas tal como están', () => {
    const dataset = JSON.parse(source('data/client-brands.json'));
    assert.ok(dataset.brands.length >= 10);
    for (const entry of dataset.brands) {
        const { problems } = normalizeBrandInput(entry);
        assert.deepEqual(problems, [], entry.aliases[0]);
        assert.ok(entry.source, `${entry.aliases[0]}: dice de dónde salió`);
    }
});

// Un doble de Prisma con lo justo para el servicio.
function memoryDb() {
    const clients = [
        { id: 'c1', name: 'Aristea', slug: 'aristea', logoUrl: null, status: 'ACTIVO', isArchived: false },
        { id: 'c2', name: 'Bonsai', slug: 'bonsai', logoUrl: null, status: 'CERRADO', isArchived: true }
    ];
    const brands = [];
    const files = [];
    return {
        brands, files,
        client: {
            findUnique: async ({ where }) => clients.find((c) => c.id === where.id) || null,
            findMany: async () => clients.map((c) => ({ ...c, brand: brands.find((b) => b.clientId === c.id) ? { ...brands.find((b) => b.clientId === c.id), files: [] } : null }))
        },
        clientBrand: {
            findUnique: async ({ where }) => {
                const brand = brands.find((b) => b.clientId === where.clientId);
                return brand ? { ...brand, files: files.filter((f) => f.brandId === brand.id && !f.deletedAt) } : null;
            },
            create: async ({ data }) => { const row = { id: `b${brands.length + 1}`, revision: 1, ...data }; brands.push(row); return row; },
            updateMany: async ({ where, data }) => {
                const row = brands.find((b) => b.id === where.id && b.revision === where.revision);
                if (!row) return { count: 0 };
                Object.assign(row, { ...data, revision: row.revision + 1 });
                return { count: 1 };
            }
        },
        clientBrandFile: {
            create: async ({ data }) => { const row = { id: `f${files.length + 1}`, createdAt: new Date(), ...data }; files.push(row); return row; },
            findFirst: async ({ where }) => files.find((f) => f.id === where.id && !f.deletedAt) || null,
            update: async ({ where, data }) => Object.assign(files.find((f) => f.id === where.id), data)
        }
    };
}

test('guardar crea la ficha, y una revisión vieja no pisa lo que otra persona guardó', async () => {
    const db = memoryDb();
    const service = clientBrandService({ db, storage: () => ({}) });
    const first = await service.save('c1', { colors: [{ hex: '#3B2A74' }], fonts: [{ family: 'Massilia', source: 'COMERCIAL' }] }, { userId: 'u1' });
    assert.equal(first.brand.colors[0].hex, '#3B2A74');
    assert.equal(first.brand.revision, 1);
    const second = await service.save('c1', { revision: 1, colors: [{ hex: '#6C64AA' }] }, { userId: 'u2' });
    assert.equal(second.brand.revision, 2);
    await assert.rejects(service.save('c1', { revision: 1, colors: [] }, { userId: 'u3' }), (error) => error.statusCode === 409);
    await assert.rejects(service.save('c1', { colors: [{ hex: 'rojo' }] }, {}), (error) => error.statusCode === 400 && /HEX/.test(error.message));
    await assert.rejects(service.save('nadie', {}, {}), (error) => error.statusCode === 404);
});

test('subir un archivo lo deja en la ficha sin mostrar la clave, y quitarlo no borra la fila', async () => {
    const db = memoryDb();
    const uploads = [];
    const storage = () => ({ uploadToS3: async (file, folder) => { uploads.push(folder); return { key: `${folder}/x_${file.originalname}`, name: file.originalname, size: file.size, mimeType: file.mimetype }; } });
    const service = clientBrandService({ db, storage });
    await assert.rejects(service.addFile('c1', { kind: 'LOGO', file: { originalname: 'logo.svg', size: 5 } }, {}), /SVG/);
    const result = await service.addFile('c1', { kind: 'LOGO', file: { originalname: 'logo.png', size: 5, mimetype: 'image/png', buffer: Buffer.from('x') } }, { userId: 'u1' });
    assert.deepEqual(uploads, ['brands/c1']);
    assert.equal(result.brand.files.length, 1);
    assert.equal(result.brand.files[0].key, undefined, 'la clave del almacenamiento no sale al navegador');
    assert.equal(result.completeness.checks.find((c) => c.key === 'logo').done, true);
    const removed = await service.removeFile('c1', result.brand.files[0].id, { userId: 'u1' });
    assert.equal(removed.brand.files.length, 0);
    assert.equal(db.files.length, 1, 'la fila se conserva con deletedAt');
    assert.ok(db.files[0].deletedAt);
});

test('Marcas es una pestaña de Clientes, no un módulo propio (Rodny: «no quiero un módulo de marcas»)', () => {
    assert.doesNotMatch(source('src/components/layout/Sidebar.jsx'), /marcas/i);
    assert.doesNotMatch(source('src/App.jsx'), /\/marcas/);
    const section = source('src/components/modules/Clients/operations/ClientsSection.jsx');
    assert.match(section, /MANAGER_TABS = \[[^\]]*'marcas'/);
    assert.match(section, /MEMBER_TABS = \['directorio', 'marcas'\]/, 'también quien no es manager la ve');
    assert.match(source('src/components/modules/DigitalIdentityWidget.jsx'), /\/clientes\?tab=marcas&cliente=/);
    assert.match(source('src/components/modules/ClientDetail.jsx'), /<DigitalIdentityWidget client={client} \/>/);
    assert.match(source('package.json'), /ensure-client-brand-schema\.js/);
});

test('la pestaña sigue al módulo de Clientes: un archivado viene marcado y va aparte, plegado', async () => {
    const service = clientBrandService({ db: memoryDb(), storage: () => ({}) });
    const { brands } = await service.list();
    assert.deepEqual(brands.map((item) => [item.client.name, item.client.isArchived]), [['Aristea', false], ['Bonsai', true]]);
    const board = readFileSync(new URL('../src/components/modules/Brands/Brands.jsx', import.meta.url), 'utf8');
    assert.match(board, /Clientes inactivos \(/);
    assert.match(board, /marcasArchivadas/);
    assert.doesNotMatch(board, /Les falta algo|Con ficha|Filtrar marcas/, 'Rodny pidió retirar ese filtro');
    const clients = readFileSync(new URL('../src/components/modules/Clients.jsx', import.meta.url), 'utf8');
    assert.match(clients, /'financial-record-clients', 'brands'\]/, 'archivar o reactivar refresca la pestaña');
});

test('una tipografía de Google de la ficha se baja en .zip; una que no está en la ficha, no', async () => {
    const db = memoryDb();
    const calls = [];
    const css = `@font-face { font-family: 'Roboto'; font-style: normal; font-weight: 100 900; src: url(https://fonts.gstatic.com/s/roboto/v1/a.ttf) format('truetype'); }
@font-face { font-family: 'Roboto'; font-style: italic; font-weight: 100 900; src: url(https://fonts.gstatic.com/s/roboto/v1/b.ttf) format('truetype'); }
@font-face { src: url(https://otro-sitio.com/x.ttf); }`;
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.startsWith('https://fonts.googleapis.com/')) return { ok: true, text: async () => css };
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    };
    const service = clientBrandService({ db, storage: () => ({}), fetchImpl });
    await service.save('c1', { fonts: [{ family: 'Roboto', source: 'GOOGLE' }, { family: 'Massilia', source: 'COMERCIAL' }] }, { userId: 'u1' });
    const { name, buffer } = await service.googleFontZip('c1', 'roboto');
    assert.equal(name, 'Roboto.zip');
    assert.deepEqual(Object.keys(unzipSync(new Uint8Array(buffer))).sort(), ['LEEME.txt', 'Roboto-100-900-Italic.ttf', 'Roboto-100-900.ttf']);
    assert.ok(!calls.some((url) => url.includes('otro-sitio')), 'solo baja archivos de Google');
    await assert.rejects(service.googleFontZip('c1', 'Massilia'), (error) => error.statusCode === 404);
    await assert.rejects(service.googleFontZip('c1', 'Comic Sans'), (error) => error.statusCode === 404);
    assert.equal(parseGoogleFontCss('').length, 0);
});

test('cargar los manuales: crea lo que falta (también a los archivados), sube solo PNG de Drive, no pisa fichas ni repite logos', async () => {
    const { runBrandImport, isPng } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([
        { id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false },
        { id: 'c2', name: 'Verona', slug: 'verona', isArchived: false },
        { id: 'c3', name: 'Bonsai', slug: 'bonsai', isArchived: true }
    ]);
    const uploads = [];
    const service = clientBrandService({ db, storage: () => ({ uploadToS3: async (file, folder) => { uploads.push(`${folder}/${file.originalname}`); return { key: `${folder}/${file.originalname}`, name: file.originalname, size: file.size, mimeType: file.mimetype }; } }) });
    await service.save('c2', { colors: [{ hex: '#CC467B', name: 'La del equipo' }] }, { userId: 'u1' });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
    let driveFixed = false;
    const fetchImpl = async (url) => ({ ok: true, arrayBuffer: async () => (url.includes('NOPNG') && !driveFixed ? Buffer.from('<html>') : png) });
    const dataset = { brands: [
        { aliases: ['Aristea'], colors: [{ hex: '#3B2A74' }], logos: [{ driveId: 'a'.repeat(33), label: 'Principal' }, { driveId: 'NOPNG' + 'b'.repeat(28), label: 'Roto' }] },
        { aliases: ['Verona'], colors: [{ hex: '#000000' }], logos: [{ driveId: 'c'.repeat(33), label: 'Blanco' }] },
        { aliases: ['Bonsai'], colors: [{ hex: '#111111' }] }
    ] };
    const preview = await runBrandImport({ db, service, dataset, apply: false, fetchImpl });
    assert.equal(uploads.length, 0, 'simular no sube nada');
    assert.deepEqual(preview.report.map((l) => l.action), ['CREAR', 'COMPLETAR', 'CREAR'], 'un archivado también tiene ficha: se ve en «Clientes inactivos»');
    const done = await runBrandImport({ db, service, dataset, apply: true, fetchImpl });
    assert.equal(done.totals.logos, 2);
    assert.match(done.report[0].logoProblems[0], /no es un PNG/);
    assert.equal((await service.get('c2')).brand.colors[0].name, 'La del equipo', 'la ficha del equipo no se pisa');
    assert.equal((await service.get('c1')).brand.colors[0].hex, '#3B2A74');
    driveFixed = true;
    const again = await runBrandImport({ db, service, dataset, apply: true, fetchImpl });
    assert.equal(again.totals.logos, 1, 'solo reintenta el que falló');
    assert.equal(again.report[1].logosNew, 0, 'un logo ya cargado no se repite');
    assert.ok(isPng(png) && !isPng(Buffer.from('<html>')));
});

test('una ficha cargada que nadie editó recibe los colores que el manual trajo después; una editada, no', async () => {
    const { runBrandImport } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([
        { id: 'c1', name: 'Finas', slug: 'finas', isArchived: false },
        { id: 'c2', name: 'Lettufresh', slug: 'lettufresh', isArchived: false }
    ]);
    const service = clientBrandService({ db, storage: () => ({}) });
    const fetchImpl = async () => ({ ok: false });
    const first = { brands: [{ aliases: ['Finas'], source: 'Manual', fonts: [{ family: 'Josefin Sans', source: 'GOOGLE' }] }, { aliases: ['Lettufresh'], source: 'Manual', fonts: [{ family: 'Gotham', source: 'COMERCIAL' }] }] };
    await runBrandImport({ db, service, dataset: first, apply: true, fetchImpl });
    const edited = await service.get('c2');
    await service.save('c2', { revision: edited.brand.revision, fonts: [{ family: 'Gotham', source: 'COMERCIAL' }], usageNotes: 'del equipo' }, { userId: 'u1' });
    const later = { brands: first.brands.map((b) => ({ ...b, colors: [{ hex: '#3A5D6F', role: 'PRINCIPAL' }] })) };
    const done = await runBrandImport({ db, service, dataset: later, apply: true, fetchImpl });
    assert.deepEqual(done.report[0].filled, ['colors']);
    assert.equal((await service.get('c1')).brand.colors[0].hex, '#3A5D6F');
    assert.equal((await service.get('c2')).brand.colors.length, 0, 'lo que el equipo ya editó no se toca');
});

test('los logos del dataset vienen de Drive con etiqueta y no hay botón de carga en bloque', () => {
    const data = JSON.parse(readFileSync(new URL('../data/client-brands.json', import.meta.url), 'utf8'));
    const logos = data.brands.flatMap((b) => (b.logos || []).map((l) => ({ ...l, brand: b.aliases[0] })));
    assert.ok(logos.length >= 100);
    for (const brand of data.brands) {
        const labels = (brand.logos || []).map((l) => l.label);
        assert.equal(new Set(labels).size, labels.length, `etiquetas repetidas en ${brand.aliases[0]}`);
    }
    assert.ok(logos.every((l) => (/^[A-Za-z0-9_-]{20,}$/.test(l.driveId) || existsSync(new URL(`../data/brand-assets/${l.file}`, import.meta.url))) && l.label.trim()));
    const board = readFileSync(new URL('../src/components/modules/Brands/Brands.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(board, /Cargar fichas de los manuales/, 'Rodny pidió quitar ese botón: se carga desde la ficha');
});

test('al arrancar completa lo que falte sin repetir, y un fallo no tumba el servidor', async () => {
    const { seedBrandsOnBoot } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([{ id: 'c1', name: 'Aristea', slug: 'aristea', isArchived: false }]);
    const service = clientBrandService({ db, storage: () => ({}) });
    const quiet = { log() {}, warn() {}, error() {} };
    const dataset = { brands: [{ aliases: ['Aristea'], colors: [{ hex: '#3B2A74' }] }] };
    assert.equal((await seedBrandsOnBoot({ db, service, dataset, log: quiet })).totals.created, 1);
    assert.equal((await seedBrandsOnBoot({ db, service, dataset, log: quiet })).totals.created, 0, 'la segunda vez no crea nada');
    const broken = await seedBrandsOnBoot({ db: { client: { findMany: async () => { throw new Error('sin base'); } } }, service, dataset, log: quiet });
    assert.equal(broken.error, 'sin base');
    assert.match(readFileSync(new URL('../server.js', import.meta.url), 'utf8'), /seedBrandsOnBoot/);
});

test('sin nombre exacto, la palabra de la marca encuentra a un solo cliente; si son dos, ninguno', () => {
    const clients = [{ id: 'a', name: 'Haad Stetica y SPA', slug: 'haad-stetica' }, { id: 'b', name: 'PromoGroup / Endova', slug: 'pg' }, { id: 'c', name: 'Sun Partners Mobiliario', slug: 'sp' }];
    assert.equal(matchBrandToClient({ aliases: ['HAAD Aesthetic Center'], matchWords: ['haad'] }, clients).client?.id, 'a');
    assert.equal(matchBrandToClient({ aliases: ['Endova'], matchWords: ['endova'] }, clients).client?.id, 'b');
    assert.equal(matchBrandToClient({ aliases: ['SunPartners'], matchWords: ['sun partners'] }, clients).client?.id, 'c');
    assert.equal(matchBrandToClient({ aliases: ['Nuva'], matchWords: ['nuva'] }, [...clients, { id: 'n1', name: 'Nuva Hogar', slug: 'n1' }, { id: 'n2', name: 'Nuva Oficina', slug: 'n2' }]).client, null);
    assert.equal(matchBrandToClient({ aliases: ['Brain'] }, [{ id: 'x', name: 'Brainy', slug: 'x' }]).client, null, 'sin palabra clave, solo nombre exacto');
});

test('la carga sube el manual en PDF a la plataforma, una sola vez, y prefiere la copia comprimida', async () => {
    const { runBrandImport } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([{ id: 'c1', name: 'Verona', slug: 'verona', isArchived: false }]);
    const uploads = [];
    const service = clientBrandService({ db, storage: () => ({ uploadToS3: async (file, folder, opts) => { uploads.push({ name: file.originalname, max: opts.maxBytes }); return { key: `${folder}/${file.originalname}`, name: file.originalname, size: file.size, mimeType: file.mimetype }; } }) });
    const pdf = Buffer.from('%PDF-1.7 comprimido');
    let driveCalls = 0;
    const fetchImpl = async () => { driveCalls += 1; return { ok: true, arrayBuffer: async () => Buffer.from('%PDF-1.7 original') }; };
    const dataset = { brands: [{ aliases: ['Verona'], colors: [{ hex: '#CC467B' }], manualUrl: `https://drive.google.com/file/d/${'v'.repeat(33)}/view` }] };
    const done = await runBrandImport({ db, service, dataset, apply: true, fetchImpl, localManual: async () => pdf });
    assert.equal(done.totals.manuals, 1);
    assert.equal(driveCalls, 0, 'con copia comprimida no baja el original');
    assert.equal(uploads[0].name, 'Verona - Manual de marca.pdf');
    const files = (await service.get('c1')).brand.files;
    assert.equal(files.find((f) => f.kind === 'MANUAL').label, 'Manual de marca');
    const again = await runBrandImport({ db, service, dataset, apply: true, fetchImpl, localManual: async () => pdf });
    assert.equal(again.totals.manuals, 0, 'no se repite');
    const sheet = readFileSync(new URL('../src/components/modules/Brands/BrandSheet.jsx', import.meta.url), 'utf8');
    assert.match(sheet, /PdfDocumentPreview/, 'se lee con el visor de PDF de la plataforma');
    assert.doesNotMatch(sheet, /drivePreviewUrl|<iframe/, 'sin el visor de Drive');
});

test('los archivos de marca se piden con la sesión: nada de <img src> ni <a href> directos a la API', () => {
    // En producción cada logo respondía «No token provided»: una etiqueta <img> o un enlace no llevan la sesión.
    for (const file of ['BrandSheet.jsx', 'Brands.jsx']) {
        const source = readFileSync(new URL(`../src/components/modules/Brands/${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /src=\{brandFileUrl|href=\{brandFileUrl|href=\{brandFontUrl/, file);
    }
    const api = readFileSync(new URL('../src/components/modules/Brands/brandsApi.js', import.meta.url), 'utf8');
    assert.match(api, /export function useBrandImage/);
    assert.match(api, /export async function downloadBrandFile/);
    assert.match(readFileSync(new URL('../scripts/preview-brands.js', import.meta.url), 'utf8'), /No token provided/, 'la muestra exige la sesión como producción');
});

test('la ficha es de lectura: subir y quitar viven en «Editar marca»; la fuente se descarga con el botón de icono', () => {
    const sheet = readFileSync(new URL('../src/components/modules/Brands/BrandSheet.jsx', import.meta.url), 'utf8');
    const editor = readFileSync(new URL('../src/components/modules/Brands/BrandEditorDialog.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(sheet, /BrandFileUpload|Subir logo|Subir fuente|Subir manual|Trash2|useRemoveBrandFile/, 'la vista no sube ni quita');
    assert.doesNotMatch(sheet, /Copiar el nombre/, 'el nombre de la fuente no se copia');
    assert.doesNotMatch(sheet, /<\/?[A-Za-z]+[^>]*>\s*Descargar\s*</, 'la descarga es solo el icono');
    assert.match(sheet, /data-brand-manual-row/, 'ver el manual y los enlaces van en una sola fila');
    assert.match(sheet, /aria-label="Editar marca"[^>]*data-brand-edit/, 'editar es un icono junto a la X del diálogo, en la misma fila');
    assert.doesNotMatch(sheet, /<\/Edit[^>]*>\s*Editar marca|\/> Editar marca/, 'sin el botón grande con texto');
    for (const kind of ['LOGO', 'FUENTE', 'MANUAL']) assert.match(editor, new RegExp(`kind="${kind}"`));
    assert.match(editor, /useRemoveBrandFile/);
});

test('con el mismo nombre, un cliente activo gana al archivado', async () => {
    const { planBrandImport } = await import('../src/services/clientBrandImport.js');
    const plan = planBrandImport({ brands: [{ aliases: ['Verona'], colors: [{ hex: '#111111' }] }] }, [
        { id: 'old', name: 'Verona', slug: 'verona-2024', isArchived: true },
        { id: 'new', name: 'Verona', slug: 'verona', isArchived: false }
    ]);
    assert.equal(plan[0].client.id, 'new');
});

test('un logo y un manual que no viven en Drive se cargan desde el repositorio (la guía de Bria)', async () => {
    const { runBrandImport } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([{ id: 'b', name: 'Bria Intelligence', slug: 'bria', isArchived: false }]);
    const uploads = [];
    const service = clientBrandService({ db, storage: () => ({ uploadToS3: async (file, folder) => { uploads.push(file.originalname); return { key: `${folder}/${file.originalname}`, name: file.originalname, size: file.size, mimeType: file.mimetype }; } }) });
    const data = JSON.parse(readFileSync(new URL('../data/client-brands.json', import.meta.url), 'utf8'));
    const bria = data.brands.find((b) => b.aliases.includes('Bria Intelligence'));
    const fetchImpl = async () => { throw new Error('no debe ir a Drive'); };
    const done = await runBrandImport({ db, service, dataset: { brands: [bria] }, apply: true, fetchImpl });
    assert.equal(done.totals.logos, 5);
    assert.equal(done.totals.manuals, 1);
    assert.deepEqual(done.report[0].logoProblems, []);
});

test('una ficha cargada que nadie editó se pone al día con el dataset y recibe sus recursos; dos arranques no repiten', async () => {
    const { runBrandImport } = await import('../src/services/clientBrandImport.js');
    const { createBrandsDb } = await import('./fixtures/brandsMemoryDb.js');
    const db = createBrandsDb([{ id: 'f', name: 'Foobespain', slug: 'foobespain', isArchived: false }]);
    const kinds = [];
    const service = clientBrandService({ db, storage: () => ({ uploadToS3: async (file, folder) => ({ key: `${folder}/${file.originalname}`, name: file.originalname, size: file.size, mimeType: file.mimetype }) }) });
    const original = service.addFile.bind(service);
    service.addFile = async (id, input, user) => { kinds.push(input.kind); return original(id, input, user); };
    const fetchImpl = async () => ({ ok: false });
    await runBrandImport({ db, service, dataset: { brands: [{ aliases: ['Foobespain'], source: 'Manual', colors: [{ hex: '#7D122E' }] }] }, apply: true, fetchImpl });
    const data = JSON.parse(readFileSync(new URL('../data/client-brands.json', import.meta.url), 'utf8'));
    const foobe = data.brands.find((b) => b.aliases.includes('Foobespain'));
    const done = await runBrandImport({ db, service, dataset: { brands: [foobe] }, apply: true, fetchImpl });
    assert.ok(done.report[0].filled.includes('colors'));
    assert.equal((await service.get('f')).brand.colors.length, 10, 'las tres marcas');
    assert.ok(kinds.includes('RECURSO'), 'la imagen de las tres marcas va como recurso');
    const again = await runBrandImport({ db, service, dataset: { brands: [foobe] }, apply: true, fetchImpl });
    assert.equal(again.report[0].filled, undefined, 'con todo al día no cambia nada');
});
