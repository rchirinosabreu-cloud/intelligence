import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROFITABILITY_HINTS } from '../src/lib/clientProfitability.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const tabSource = read('../src/components/modules/financial/ProfitabilityTab.jsx');
const chartsSource = read('../src/components/modules/financial/ProfitabilityCharts.jsx');
const hintSource = read('../src/components/ui/InfoHint.jsx');

test('cada cifra de Rentabilidad tiene su explicación, y dice con qué se compara', () => {
    const keys = ['revenue', 'cost', 'hourCost', 'hoursMeasured', 'clientRevenue', 'clientHours', 'clientCost', 'clientMargin', 'perHour'];
    for (const key of keys) {
        const text = PROFITABILITY_HINTS[key];
        assert.ok(typeof text === 'string' && text.length > 40, `«${key}» necesita una explicación de verdad`);
        assert.ok(text.trim().endsWith('.'), `«${key}» se escribe en frases`);
    }

    // La que motivó el pedido: «por hora, qué es eso?». Dice qué es y contra qué se mira.
    assert.match(PROFITABILITY_HINTS.perHour, /por cada hora trabajada/);
    assert.match(PROFITABILITY_HINTS.perHour, /costo hora de la agencia/);

    // El costo hora no es el sueldo de nadie, y eso se dice: es la regla de Rodny del 22 de octubre.
    assert.match(PROFITABILITY_HINTS.hourCost, /nunca el sueldo de una persona/);
    // El margen explica su porcentaje con un ejemplo, no con una fórmula.
    assert.match(PROFITABILITY_HINTS.clientMargin, /de cada \$100/);
    // Las horas avisan de lo que no se midió, que es lo que vuelve impreciso el costo.
    assert.match(PROFITABILITY_HINTS.hoursMeasured, /poco medido/);
});

test('las explicaciones no juzgan ni recomiendan: eso lo pone quien decide', () => {
    const todo = Object.values(PROFITABILITY_HINTS).join(' | ');
    assert.doesNotMatch(todo, /deberías|conviene|recomendamos|malo|preocupante|hay que/i);
});

test('la pantalla conecta cada explicación con su cifra y su columna', () => {
    assert.match(tabSource, /from '@\/lib\/clientProfitability'/);
    for (const [key, column] of [['clientRevenue', 'Ingreso'], ['clientHours', 'Horas'], ['clientCost', 'Costo'], ['clientMargin', 'Margen'], ['perHour', 'Por hora']]) {
        assert.match(tabSource, new RegExp(`<ColumnHead label="${column}" explain=\\{PROFITABILITY_HINTS\\.${key}\\}`), `la columna ${column} no está explicada`);
    }
    for (const key of ['revenue', 'cost', 'hourCost', 'hoursMeasured']) {
        assert.match(tabSource, new RegExp(`explain=\\{PROFITABILITY_HINTS\\.${key}\\}`), `la cifra ${key} no está explicada`);
    }
});

test('el iconito es un botón de verdad, nunca un title', () => {
    // Un `title` no existe en un celular, no lo alcanza el tabulador y el lector de pantalla
    // lo lee tarde o no lo lee.
    assert.doesNotMatch(hintSource, /\btitle=/);
    assert.match(hintSource, /<button/);
    assert.match(hintSource, /aria-label=\{`Qué es \$\{label\}`\}/);
    // Ratón, teclado y toque: las tres vías abren el mismo globo.
    assert.match(hintSource, /onMouseEnter=\{open\}/);
    assert.match(hintSource, /onFocus=\{open\}/);
    assert.match(hintSource, /onClick=\{\(\) => \(spot \? close\(\) : open\(\)\)\}/);
    assert.match(hintSource, /event\.key === 'Escape'/);
    // Superficie compartida, nunca un vidrio local.
    assert.match(hintSource, /brain-popover-surface/);
    assert.doesNotMatch(hintSource, /#[0-9a-fA-F]{6}/);
    // Va al body: dentro de una tarjeta con overflow-hidden quedaría recortado.
    assert.match(hintSource, /createPortal\(/);
});

test('los gráficos no esconden ninguna cuenta y marcan lo que pierde', () => {
    // Recortar la lista en una pantalla de rentabilidad sería ocultar justo la que importa.
    // (El `slice` que hay recorta un nombre largo, no la lista.)
    // (Que ninguna barra falte lo comprueba el recorrido real: tests/browser/profitabilityHints.mjs.)
    assert.doesNotMatch(chartsSource, /(clients|byMargin|byHour)\s*\.slice\(/);
    // El alto sale de cuántas cuentas hay, así que todas caben.
    assert.match(chartsSource, /chartHeight\(byMargin\.length\)/);
    assert.match(chartsSource, /chartHeight\(byHour\.length\)/);
    // Coral lo que pierde, verde lo que deja, desde los tokens de marca.
    assert.match(chartsSource, /row\.marginCents < 0 \? 'fill-\[rgb\(var\(--brand-coral\)\)\]' : 'fill-\[rgb\(var\(--brand-green\)\)\]'/);
    // La línea del costo hora es la comparación que vuelve legible «por hora».
    assert.match(chartsSource, /<ReferenceLine x=\{hourCostCents\}/);
    assert.match(chartsSource, /row\.revenuePerHourCents < hourCostCents/);
    // Lo que no tiene horas medidas se dice, no se rellena con un cero.
    assert.match(chartsSource, /revenuePerHourCents !== null/);
    assert.match(chartsSource, /no aparecen aquí/);
    // Sin animación de entrada, como el resto de los gráficos de Financiero.
    assert.doesNotMatch(chartsSource, /isAnimationActive=\{true\}/);
    assert.equal((chartsSource.match(/isAnimationActive=\{false\}/g) || []).length, 2);
});
