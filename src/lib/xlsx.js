// Única puerta a SheetJS (xlsx) en el servidor y en los scripts.
//
// SheetJS dejó de publicar en npm; la versión con los arreglos de seguridad se
// instala desde cdn.sheetjs.com (package.json fija el .tgz con su integridad).
// En Node, `import 'xlsx'` carga su edición ESM (xlsx.mjs), que a diferencia de la
// 0.18.5 que usábamos no trae sola ni el sistema de archivos ni las páginas de
// códigos: sin lo primero `readFile`/`writeFile` fallan («cannot save file») y sin
// lo segundo un .xls o .csv antiguo en Windows-1252 se lee con tildes rotas.
// Aquí se le dan las dos cosas una vez, como indica la documentación de SheetJS.
// Contrato: tests/xlsxRuntime.test.js.
import * as fs from 'node:fs';
import XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';

XLSX.set_fs(fs);
XLSX.set_cptable(cptable);

export default XLSX;
