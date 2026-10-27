// La banda de avisos importantes (Rodny, 26 de octubre de 2026): «un degradado sin borde, solo degradado que se desvanece
// suavemente arriba, es radial … el texto centrado»; por encima de todo, también del menú; verde para el seguimiento y
// salmón solo para lo más importante; «Abrir» como botón, «Recordarme» al final, sin «Volver» ni «Nota opcional».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const band = readFileSync('src/components/notifications/ImportantNoticeBand.jsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');

test('la banda vive en el layout para todo el equipo y deja espacio abajo en la página', () => {
    assert.match(layout, /<ImportantNoticeBand [^>]*onVisibleChange=\{setHasImportantNotice\}/);
    assert.match(layout, /hasImportantNotice && 'pb-56 md:pb-48'/);
    assert.match(band, /\/api\/important-notices\/current/);
});

test('cúpula radial sin borde, de borde a borde, encima del menú y debajo de los diálogos', () => {
    const block = css.slice(css.indexOf('.brain-notice-band {'), css.indexOf('.brain-popover-surface {'));
    assert.match(block, /z-index: 65;/, 'el menú lateral va en 60 y los diálogos desde 70');
    assert.match(block, /inset: auto 0 0 0;/);
    assert.match(block, /radial-gradient\(var\(--notice-spread, 62%\) 100% at 50% 100%/);
    assert.match(block, /mask-image: radial-gradient\(var\(--notice-mask, 75%\) 100% at 50% 100%/);
    assert.match(block, /--notice-spread: 125%; --notice-mask: 140%;/, 'en el celular la cúpula se ensancha para que el título quede sobre el color');
    assert.doesNotMatch(block, /border(-top)?:/);
    assert.match(block, /--notice-hue: var\(--brand-green\)/);
    assert.match(block, /\[data-level="IMPORTANTE"\] \{ --notice-hue: var\(--brand-coral\); \}/);
    assert.doesNotMatch(block, /--brand-cyan|--brand-magenta/, 'un solo tono por nivel: sin azul y sin magenta');
    assert.doesNotMatch(block, /#[0-9a-f]{6}/i, 'los colores salen de los tokens de marca');
    assert.match(block, /prefers-reduced-motion/);
});

test('los botones: seguimiento primero, «Abrir» como botón y «Recordarme» siempre al final', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    const order = ['data-notice-action="follow-up"', 'data-notice-action="close-lost"', 'data-notice-action="open"', 'data-notice-action="snooze"']
        .map((marker) => base.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(base, /<NoticeButton disabled=\{busy\} data-notice-action="open"/, '«Abrir» es un botón como los demás, no un enlace');
    assert.doesNotMatch(band, />\s*Volver|Nota opcional|<textarea|<input/);
});

test('Esc o tocar fuera devuelve a los botones, y el éxito se dice después de la respuesta del servidor', () => {
    assert.match(band, /event\.key === 'Escape'\) setMode\('base'\)/);
    assert.match(band, /!contentRef\.current\?\.contains\(event\.target\)\) setMode\('base'\)/);
    const decide = band.slice(band.indexOf('const decide'), band.indexOf('return (', band.indexOf('const decide')));
    assert.ok(decide.indexOf('await post(') < decide.indexOf('toast.success'), 'nunca un éxito antes de la respuesta');
    assert.match(band, /console\.error\('\[Avisos importantes\]', data\)/);
});
