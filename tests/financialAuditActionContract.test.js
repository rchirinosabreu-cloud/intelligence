import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// El 23 de septiembre de 2026 eliminar una cuenta por cobrar falló en producción con
// «Ocurrió un error inesperado»: el servicio escribía `action: 'DELETE'` y el enum
// `FinancialAuditAction` de Prisma no tenía ese valor. Las pruebas del servicio no lo
// vieron porque su doble de base de datos guarda lo que le pasen sin validarlo contra
// el esquema. Este contrato compara las dos cosas y no depende de ningún doble.

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

const enumValues = (name) => {
    const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
    assert.ok(block, `el enum ${name} tiene que existir en el esquema`);
    return block[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter((line) => /^[A-Z_]+$/.test(line));
};

// `fileURLToPath` y no `url.pathname`: en Linux —donde corre la integración continua—
// un `pathname` manipulado a mano deja de apuntar a ninguna parte.
const servicesDir = fileURLToPath(new URL('../src/services/', import.meta.url));
const readServices = () => readdirSync(servicesDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, source: readFileSync(join(servicesDir, file), 'utf8') }));

// `financialAuditEvent.create({ data: { ... action: 'X' ... } })`, en el bloque que
// sigue a la llamada. Se lee el `action` más cercano para no confundirlo con el de otra
// escritura del mismo archivo.
const auditActionsIn = (source) => {
    const actions = [];
    const pattern = /financialAuditEvent\.create\(/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        const block = source.slice(match.index, match.index + 600);
        const action = /action:\s*'([A-Z_]+)'/.exec(block);
        if (action) actions.push(action[1]);
    }
    return actions;
};

test('toda acción escrita en la bitácora financiera existe en el enum de Prisma', () => {
    const allowed = enumValues('FinancialAuditAction');
    assert.ok(allowed.includes('DELETE'), 'eliminar una cuenta por cobrar necesita DELETE');

    const used = new Map();
    for (const { file, source } of readServices()) {
        for (const action of auditActionsIn(source)) {
            if (!used.has(action)) used.set(action, file);
        }
    }

    assert.ok(used.size > 0, 'el contrato tiene que estar leyendo los servicios de verdad');
    for (const [action, file] of used) {
        assert.ok(
            allowed.includes(action),
            `${file} escribe action: '${action}' y FinancialAuditAction no lo admite: Prisma lo rechaza en tiempo de ejecución. Añádelo al enum y a un script ensure-* aditivo.`
        );
    }
});

// Un valor nuevo en un enum de PostgreSQL no llega solo: sin el `ALTER TYPE` en el
// arranque, el esquema y la base de datos de producción dejan de decir lo mismo.
test('los valores del enum añadidos después existen también en el arranque', () => {
    const ensure = readFileSync(new URL('../scripts/ensure-receivable-document-schema.js', import.meta.url), 'utf8');
    assert.match(ensure, /ALTER TYPE "FinancialAuditAction" ADD VALUE IF NOT EXISTS 'DELETE'/);
    const startScript = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.start;
    assert.match(startScript, /ensure-receivable-document-schema\.js/, 'el script tiene que correr al arrancar');
});
