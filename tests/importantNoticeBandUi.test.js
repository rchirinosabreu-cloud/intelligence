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
    const order = ['data-notice-action="follow-up"', 'data-notice-action="close"', 'data-notice-action="open"', 'data-notice-action="snooze"']
        .map((marker) => base.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(base, /<NoticeButton disabled=\{busy\} data-notice-action="open"/, '«Abrir» es un botón como los demás, no un enlace');
    assert.doesNotMatch(band, />\s*Volver|Nota opcional|<textarea|<input/);
    // En la revisión: «Ya hice seguimiento», «No sigue» y «Recordarme»; sin «Abrir». «Cerrar» se confundía con cerrar el
    // aviso y «Descartar» elegía de antemano una de las dos etapas.
    assert.doesNotMatch(band, /Sigue: ya hice seguimiento|Cerrar como perdida|>\s*Cerrar\s*<|>\s*Descartar\s*</);
    assert.match(base, />\s*No sigue\s*</);
    assert.match(band, /¿Cómo la cerramos\?/);
    assert.match(band, /mode === 'close' && REVIEW_OUTCOMES\.map/);
    assert.match(base, /\{!isReview && !isCollection && !isPlan && notice\.url && \(/);

    // Un aviso de parrilla no tiene seguimiento que registrar: su botón principal abre la parrilla y las piezas se
    // marcan una por una, que es mirarlas (Rodny, 30 de octubre de 2026). «Recordarme» sigue al final.
    assert.match(base, /\{isPlan \? \(/);
    assert.ok(base.indexOf('data-notice-action="open-plan"') < base.indexOf('data-notice-action="snooze"'));
    assert.match(band, /const openLabel = notice\.kind === 'PARRILLA_RESUMEN' \? 'Abrir Operación' : 'Abrir la parrilla'/);
});

test('cartera vencida: «Ya le escribí», «Registrar pago» y «Recordarme», sin «Abrir» (28 de octubre de 2026)', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    assert.match(band, /const isCollection = String\(notice\.kind \|\| ''\)\.startsWith\('CARTERA_'\)/);
    assert.match(base, /isCollection \? 'Ya le escribí' : 'Ya hice seguimiento'/);
    // El segundo botón de un aviso de cartera abre Cuentas por cobrar y, en la propuesta de suspender (30 de octubre
    // de 2026), la página del cliente: la suspensión no se decide desde la banda, exige quién la autorizó.
    const second = base.indexOf("data-notice-action={isSuspension ? 'suspend' : 'pay'}");
    assert.ok(second > base.indexOf('data-notice-action="follow-up"'));
    assert.ok(second > -1 && second < base.indexOf('data-notice-action="snooze"'), '«Recordarme» sigue al final');
    assert.match(base, /isSuspension \? 'Revisar suspensión' : 'Registrar pago'/);
    assert.match(band, /const isSuspension = notice\.kind === 'CARTERA_SUSPENSION'/);
    assert.match(band, /'Gestión de cobro registrada'/);
});

test('Esc o tocar fuera devuelve a los botones, y el éxito se dice después de la respuesta del servidor', () => {
    assert.match(band, /event\.key === 'Escape'\) setMode\('base'\)/);
    assert.match(band, /!contentRef\.current\?\.contains\(event\.target\)\) setMode\('base'\)/);
    const decide = band.slice(band.indexOf('const decide'), band.indexOf('return (', band.indexOf('const decide')));
    assert.ok(decide.indexOf('await post(') < decide.indexOf('toast.success'), 'nunca un éxito antes de la respuesta');
    assert.match(band, /console\.error\('\[Avisos importantes\]', data\)/);
});
