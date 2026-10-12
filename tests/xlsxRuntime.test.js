import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import XLSX from '../src/lib/xlsx.js';

// SheetJS dejó de publicar en npm: la versión arreglada (0.20.3) llega desde
// cdn.sheetjs.com. Desde la 0.18.10 un `import` en Node carga la edición ESM
// (xlsx.mjs), que no trae ni el sistema de archivos ni las páginas de códigos que
// la 0.18.5 cargaba sola. src/lib/xlsx.js se los da; estas pruebas lo vigilan con
// libros de verdad, no con dobles.

const ROOT = path.resolve(import.meta.dirname, '..');

test('la versión instalada es la 0.20.3 o posterior, la que corrige los dos avisos altos', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'package.json'), 'utf8'));
  const [major, minor, patch] = manifest.version.split('.').map(Number);
  assert.ok(major > 0 || minor > 20 || (minor === 20 && patch >= 3), `xlsx ${manifest.version} sigue afectado`);
});

test('el lockfile fija el paquete en el CDN de SheetJS con su huella de integridad', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const entry = lock.packages['node_modules/xlsx'];
  assert.match(entry.resolved, /^https:\/\/cdn\.sheetjs\.com\/xlsx-\d+\.\d+\.\d+\/xlsx-\d+\.\d+\.\d+\.tgz$/);
  assert.match(entry.integrity, /^sha512-/);
  assert.equal(entry.license, 'Apache-2.0');
});

test('escribe y vuelve a leer un .xlsx real del disco (readFile y writeFile necesitan el sistema de archivos)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-runtime-'));
  const file = path.join(dir, 'prueba.xlsx');
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Cliente', 'Valor', 'Fecha'],
      ['Señora Peña', 1200000, new Date(Date.UTC(2026, 8, 30))],
    ]), 'Movimientos');
    XLSX.writeFile(book, file);

    const read = XLSX.readFile(file, { cellDates: true });
    assert.deepEqual(read.SheetNames, ['Movimientos']);
    const [header, row] = XLSX.utils.sheet_to_json(read.Sheets.Movimientos, { header: 1, raw: true });
    assert.deepEqual(header, ['Cliente', 'Valor', 'Fecha']);
    assert.equal(row[0], 'Señora Peña');
    assert.equal(row[1], 1200000);
    assert.ok(row[2] instanceof Date);
    // Desde la 0.20 la fecha se interpreta en UTC: el día no se corre.
    assert.equal(row[2].toISOString().slice(0, 10), '2026-09-30');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lee un libro desde un búfer, como la importación financiera y los adjuntos de Bria', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Mes', 'Ingreso'], ['Enero', 500]]), 'Flujo');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const read = XLSX.read(buffer, { type: 'buffer', sheetRows: 2000 });
  assert.equal(XLSX.utils.sheet_to_csv(read.Sheets.Flujo), 'Mes,Ingreso\nEnero,500');
});

test('decodifica texto de un archivo antiguo con página de códigos (tablas cargadas)', () => {
  // «café;año» en Windows-1252: é = 0xE9, ñ = 0xF1. SheetJS trae esta de serie.
  const latin = XLSX.read(Buffer.from([0x63, 0x61, 0x66, 0xE9, 0x3B, 0x61, 0xF1, 0x6F]), { type: 'buffer', codepage: 1252 });
  assert.deepEqual(XLSX.utils.sheet_to_json(latin.Sheets[latin.SheetNames[0]], { header: 1 })[0], ['café', 'año']);
  // «Привет» en Windows-1251 solo sale bien con las tablas de cpexcel; sin ellas, «Ïðèâåò».
  const cyrillic = XLSX.read(Buffer.from([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), { type: 'buffer', codepage: 1251 });
  assert.deepEqual(XLSX.utils.sheet_to_json(cyrillic.Sheets[cyrillic.SheetNames[0]], { header: 1 })[0], ['Привет']);
});

test('convierte el número de serie de Excel a fecha (nómina de la importación financiera)', () => {
  const parsed = XLSX.SSF.parse_date_code(46295);
  assert.deepEqual([parsed.y, parsed.m, parsed.d], [2026, 9, 30]);
});

test('un libro con prototipo contaminado no contamina Object.prototype', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['__proto__', 'polluted'], ['x', 'y']]), 'Hoja');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const read = XLSX.read(buffer, { type: 'buffer' });
  XLSX.utils.sheet_to_json(read.Sheets.Hoja);
  assert.equal(({}).polluted, undefined);
});

test('todo el código usa xlsx a través de src/lib/xlsx.js, nunca importándolo directo', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.(c|m)?jsx?$/.test(entry.name) && full !== path.join(ROOT, 'src', 'lib', 'xlsx.js')) {
        const source = fs.readFileSync(full, 'utf8');
        if (/from\s+['"]xlsx(\/[^'"]*)?['"]|require\(\s*['"]xlsx|import\(\s*['"]xlsx/.test(source)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    }
  };
  for (const dir of ['src', 'scripts', 'tests']) walk(path.join(ROOT, dir));
  assert.deepEqual(offenders, []);
});
