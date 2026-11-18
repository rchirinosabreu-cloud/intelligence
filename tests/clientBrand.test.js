import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
