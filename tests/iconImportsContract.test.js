import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// El 24 de septiembre de 2026 el tablero de tareas se cayó en producción con «Illegal
// constructor»: `TaskSidePanel.jsx` dibujaba `<Lock />` sin haber importado el icono.
// `Lock` es además un global del navegador —la API de Web Locks— así que el nombre
// existía, ESLint no se quejaba, y React intentaba construir una interfaz del DOM como
// si fuera un componente. El fallo solo aparecía al abrir el panel.
//
// Este contrato recorre los componentes y comprueba que todo icono que se dibuja está
// importado en ese archivo. No depende de que alguien acuerde abrir la pantalla.

const root = fileURLToPath(new URL('../src/', import.meta.url));
const iconsSource = readFileSync(join(root, 'components/ui/icons.jsx'), 'utf8');
const iconNames = new Set(
    [...iconsSource.matchAll(/^export const (\w+) = createIcon\(/gm)].map((match) => match[1])
);

const jsxFiles = (dir) => readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return jsxFiles(path);
    return path.endsWith('.jsx') ? [path] : [];
});

test('el catálogo de iconos se pudo leer', () => {
    assert.ok(iconNames.size > 20, `se esperaban muchos iconos y se leyeron ${iconNames.size}`);
    assert.ok(iconNames.has('Lock'), 'Lock es el icono del incidente: tiene que estar en el catálogo');
});

test('todo icono que un componente dibuja está importado en ese archivo', () => {
    const missing = [];

    for (const file of jsxFiles(root)) {
        const source = readFileSync(file, 'utf8');
        const used = new Set([...source.matchAll(/<(\w+)[\s/>]/g)].map((match) => match[1]).filter((name) => iconNames.has(name)));
        if (used.size === 0) continue;

        // Todas las sentencias `import ... from '...'` del archivo, de una pieza: los
        // nombres van repartidos en varias líneas y buscarlos por línea no vale.
        const imports = [...source.matchAll(/import[\s\S]*?from\s+['"][^'"]+['"]/g)].map((match) => match[0]).join('\n');

        for (const name of used) {
            const imported = new RegExp(`\\b${name}\\b`).test(imports);
            const declared = new RegExp(`(const|let|function|class)\\s+${name}\\b`).test(source);
            if (!imported && !declared) missing.push(`${relative(root, file).replace(/\\/g, '/')}: <${name}`);
        }
    }

    assert.deepEqual(
        missing,
        [],
        `estos componentes dibujan un icono que no importan; en el navegador tomarían un global del DOM y reventarían al renderizar:\n${missing.join('\n')}`
    );
});
