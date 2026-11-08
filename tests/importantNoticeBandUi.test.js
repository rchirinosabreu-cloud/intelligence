// Revisión local de noviembre: tarjeta más ancha con halo suave elegida por Rodny.
// Conserva posición, niveles, decisiones y permanencia de la banda existente.
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

test('tarjeta con halo suave, encima del menú y debajo de los diálogos', () => {
    const block = css.slice(css.indexOf('.brain-notice-band {'), css.indexOf('.brain-popover-surface {'));
    assert.match(block, /z-index: 65;/, 'el menú lateral va en 60 y los diálogos desde 70');
    assert.match(block, /width: min\(680px, calc\(100vw - 32px\)\)/);
    assert.match(block, /border-radius: 20px/);
    assert.match(block, /backdrop-filter: blur\(10px\)/);
    assert.match(block, /width: calc\(100vw - 24px\)/);
    assert.match(band, /appearance = 'halo'/);
    assert.match(block, /--notice-hue: var\(--brand-coral\)/);
    assert.match(block, /\[data-level="IMPORTANTE"\] \{ --notice-hue: var\(--brand-coral\); \}/);
    assert.doesNotMatch(block, /--brand-cyan|--brand-magenta/, 'un solo tono por nivel: sin azul y sin magenta');
    assert.doesNotMatch(block, /#[0-9a-f]{6}/i, 'los colores salen de los tokens de marca');
    assert.match(block, /prefers-reduced-motion/);
});

test('los botones: seguimiento primero, «Abrir» como botón y «Recordarme» siempre al final', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    const order = ['data-notice-action="follow-up"', 'data-notice-action="close"', 'data-notice-action="open"', 'data-notice-action="archive"', 'data-notice-action="snooze"']
        .map((marker) => base.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(base, /<NoticeButton disabled=\{busy\} data-notice-action="open"/, '«Abrir» es un botón como los demás, no un enlace');
    assert.match(band, /aria-label="Motivo de la decisión"/);
    // En la revisión: «Ya hice seguimiento», «No sigue» y «Recordarme»; sin «Abrir». «Cerrar» se confundía con cerrar el
    // aviso y «Descartar» elegía de antemano una de las dos etapas.
    assert.doesNotMatch(band.slice(band.indexOf('isOperational ? (')), /Sigue: ya hice seguimiento|Cerrar como perdida|>\s*Cerrar\s*<|>\s*Descartar\s*</); // Cerrar existe solo en anuncios, no en CRM.
    assert.match(base, />\s*Resolver oportunidad\s*</);
    assert.match(band, /¿Qué resultado confirmó el cliente o el equipo\?/);
    assert.match(band, /mode === 'close' && REVIEW_OUTCOMES\.map/);
    assert.match(base, /noticeAllows\(notice, 'close'\)/);

    // Un aviso de parrilla no tiene seguimiento que registrar: su botón principal abre la parrilla y las piezas se
    // marcan una por una, que es mirarlas (Rodny, 30 de octubre de 2026). «Recordarme» sigue al final.
    assert.match(base, /isPlan \? \(/);
    assert.ok(base.indexOf('data-notice-action="open-plan"') < base.indexOf('data-notice-action="snooze"'));
    assert.match(band, /policy\.openLabel/);
});

test('cartera vencida: «Ya le escribí», «Registrar pago» y «Recordarme», sin «Abrir» (28 de octubre de 2026)', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    assert.match(band, /const isCollection = policy\?\.family === 'COLLECTION'/);
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

test('«Archivar» a la vista en todo aviso del CRM y el título lleva a lo que nombra sin quitar el aviso (4 de noviembre de 2026)', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    assert.match(band, /const isCrm = policy\?\.family === 'CRM'/);
    assert.match(base, /\{isCrm && \(\s*<NoticeButton disabled=\{busy\} data-notice-action="archive"/);
    assert.match(base, /selectOutcome\(NOTICE_ARCHIVE_OUTCOME\)/);
    assert.match(band, /expectedUpdatedAt: notice\.sourceRevision/);
    // El título es un enlace de verdad: abrir en otra pestaña funciona, y viajar lleva de dónde viene.
    assert.match(band, /<a href=\{titleHref\} data-notice-title-link/);
    assert.match(band, /useNavigateFrom\(\)/);
    const open = band.slice(band.indexOf('const openTitle'), band.indexOf('return (', band.indexOf('const openTitle')));
    assert.match(open, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey/);
    assert.doesNotMatch(open, /post\(|decide\(|onDecided/, 'mirar la oportunidad no decide nada: el aviso se queda');
});

test('Esc o tocar fuera devuelve a los botones, y el éxito se dice después de la respuesta del servidor', () => {
    assert.match(band, /event\.key === 'Escape'\) setMode\('base'\)/);
    assert.match(band, /!contentRef\.current\?\.contains\(event\.target\)\) \{\s*restoreFocus\.current = false;/);
    const decide = band.slice(band.indexOf('const decide'), band.indexOf('return (', band.indexOf('const decide')));
    assert.ok(decide.indexOf('await post(') < decide.indexOf('toast.success'), 'nunca un éxito antes de la respuesta');
    assert.match(band, /console\.error\('\[Avisos importantes\]', data\)/);
});
