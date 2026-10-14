import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDriveFolder, updateDriveFolder } from '../src/services/driveService.js';

// Descripción de carpeta y arrastrar archivos (Rodny, 14 de octubre de 2026: «una carpeta
// tiene descripción y la otra no, necesito poder añadir descripción»). La tarjeta ya
// sabía pintarla —la carpeta de Bria trae la suya— pero una carpeta creada a mano no
// tenía dónde guardarla y salía con el relleno «Carpeta de Drive».

const dobleDb = () => {
    const escrituras = [];
    return {
        escrituras,
        driveFolder: {
            create: async ({ data, select }) => { escrituras.push({ op: 'create', data, select }); return { id: 'f1', ...data }; },
            update: async ({ where, data }) => { escrituras.push({ op: 'update', where, data }); return { id: where.id, ...data }; }
        }
    };
};

test('una carpeta nueva guarda su descripción', async () => {
    const db = dobleDb();
    await createDriveFolder({ name: 'Seguridad de la Información', subtitle: '  Políticas y actas del sistema  ', actorId: 'u1', db });

    const [escritura] = db.escrituras;
    assert.equal(escritura.data.name, 'Seguridad de la Información');
    assert.equal(escritura.data.subtitle, 'Políticas y actas del sistema', 'se guarda sin espacios de sobra');
    assert.ok(escritura.select.subtitle, 'la respuesta tiene que devolverla');
});

test('sin descripción se guarda vacía, nunca un texto inventado', async () => {
    const db = dobleDb();
    await createDriveFolder({ name: 'Contratos', actorId: 'u1', db });
    assert.equal(db.escrituras[0].data.subtitle, null);

    const vacia = dobleDb();
    await createDriveFolder({ name: 'Contratos', subtitle: '   ', actorId: 'u1', db: vacia });
    assert.equal(vacia.escrituras[0].data.subtitle, null);
});

test('se puede cambiar la descripción sin tocar el nombre, y al revés', async () => {
    const soloDescripcion = dobleDb();
    await updateDriveFolder({ id: 'f1', subtitle: 'Nueva nota', db: soloDescripcion });
    assert.deepEqual(soloDescripcion.escrituras[0].data, { subtitle: 'Nueva nota' });

    const soloNombre = dobleDb();
    await updateDriveFolder({ id: 'f1', name: 'Otro nombre', db: soloNombre });
    assert.deepEqual(soloNombre.escrituras[0].data, { name: 'Otro nombre' });
});

// Vaciarla es una decisión: mandar cadena vacía la borra, no la deja como estaba.
test('se puede quitar la descripción', async () => {
    const db = dobleDb();
    await updateDriveFolder({ id: 'f1', subtitle: '', db });
    assert.equal(db.escrituras[0].data.subtitle, null);
});

test('la descripción se recorta y no se guarda un párrafo entero', async () => {
    const db = dobleDb();
    await createDriveFolder({ name: 'X', subtitle: 'a'.repeat(400), actorId: 'u1', db });
    assert.equal(db.escrituras[0].data.subtitle.length, 240);
});

test('la columna existe en el esquema y la crea el arranque', async () => {
    const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    const bootstrap = await readFile(new URL('../scripts/ensure-drive-schema.js', import.meta.url), 'utf8');

    assert.match(schema, /model DriveFolder \{[\s\S]*?subtitle\s+String\?/);
    assert.match(bootstrap, /ALTER TABLE "DriveFolder"[\s\S]{0,120}ADD COLUMN IF NOT EXISTS "subtitle"/);
});

// Arrastrar: la pantalla tiene que aceptar archivos soltados encima, y no en la papelera
// ni en la carpeta automática de Bria, que es de solo lectura.
test('la pantalla de Drive acepta archivos arrastrados', async () => {
    const screen = await readFile(new URL('../src/components/modules/Drive/DriveLayout.jsx', import.meta.url), 'utf8');

    assert.match(screen, /onDrop=/, 'falta el manejador de soltar');
    assert.match(screen, /onDragOver=/, 'falta el manejador de arrastrar encima');
    assert.match(screen, /onDragLeave=/, 'sin esto la marca de soltar se queda pegada');
    assert.match(screen, /dataTransfer/, 'los archivos soltados vienen en dataTransfer');
    assert.match(screen, /data-drive-dropzone/, 'la zona de soltar tiene que ser identificable');
    // La misma puerta que el botón: subir es una sola función, no dos caminos distintos.
    assert.match(screen, /const uploadMany\s*=/);
    assert.doesNotMatch(screen, /onDrop=\{[^}]*uploadFiles\b/, 'soltar no recibe un evento de <input>');
});
