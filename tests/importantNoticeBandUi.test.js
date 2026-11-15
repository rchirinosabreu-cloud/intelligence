// La cúpula (Rodny, 13 de noviembre de 2026; Elisa: «me gustaba más el difuminado de antes, este cuadro blanco pierde la
// esencia de Brain»). Sustituye a la tarjeta blanca con halo del 6 de noviembre. Conserva posición, niveles, decisiones
// y permanencia de la banda existente.
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

test('la cúpula: de borde a borde, encima del menú y debajo de los diálogos, dos tonos puros de la marca', () => {
    const block = css.slice(css.indexOf('.brain-notice-band {'), css.indexOf('.brain-popover-surface {'));
    assert.match(block, /z-index: 65;/, 'el menú lateral va en 60 y los diálogos desde 70');
    assert.match(block, /inset: auto 0 0 0/, 'sin caja: la cúpula ocupa el ancho de la ventana');
    assert.match(block, /radial-gradient\(var\(--notice-spread\) 100% at 50% 100%/, 'sube desde el centro del borde inferior');
    assert.match(block, /mask-image: radial-gradient\(var\(--notice-mask\) 100% at 50% 100%/);
    assert.doesNotMatch(block, /border-radius: 20px|border: 1px solid rgb\(var\(--notice-hue\)\)/, 'ni tarjeta ni borde');
    // Verde para el seguimiento, coral solo para lo importante; sin mezclar con negro salvo el pie (`--notice-deep`).
    assert.match(block, /\.brain-notice-band \{\s*--notice-hue: var\(--brand-green\)/);
    assert.match(block, /\[data-level="IMPORTANTE"\] \{\s*--notice-hue: var\(--brand-coral\)/);
    assert.doesNotMatch(block, /--brand-cyan|--brand-magenta/, 'un solo tono por nivel: sin azul y sin magenta');
    assert.doesNotMatch(block, /#[0-9a-f]{6}/i, 'los colores salen de los tokens de marca');
    // Vidrio, no pintura (Rodny, 14 de noviembre de 2026, opción B): el velo no pasa de la mitad de opacidad en claro y
    // deja ver lo de atrás desenfocado; color y desenfoque van en la misma capa, bajo la misma máscara, para que ningún
    // borde tenga dónde aparecer. Chrome sí aplica `backdrop-filter` bajo `mask-image` (medido píxel a píxel ese día);
    // no volver a sacar el desenfoque a una elipse recortada aparte.
    const washStart = block.indexOf('.brain-notice-wash {');
    const wash = block.slice(washStart, block.indexOf('.brain-notice-content {', washStart));
    assert.match(wash, /backdrop-filter: blur\(22px\)/);
    assert.match(wash, /mask-image: radial-gradient\(var\(--notice-mask\)[^;]*#000 50%/, 'el vidrio va completo hasta donde caen etiqueta, título y botones');
    assert.doesNotMatch(block, /::after|clip-path/);
    assert.match(block, /--notice-glass: \.5;/);
    assert.match(block, /\.dark \.brain-notice-band \{\s*--notice-ink: 255 255 255;\s*--notice-glass: \.62;/);
    // Sin saltos de color: cada parada mezcla un poco menos de tono hundido, sin cambiar de color de golpe (la franja).
    assert.match(wash, /var\(--notice-deep\) 78%, rgb\(var\(--notice-hue\)\)[\s\S]*var\(--notice-deep\) 48%[\s\S]*var\(--notice-deep\) 20%/);
    // El coral y el verde son claros: en claro el texto va oscuro sin sombra y el botón principal lleva el color con
    // texto blanco; en oscuro el texto es blanco y el principal, blanco con el texto en la variante profunda (no rojo
    // sobre rojo). Lo mide de verdad tests/browser/noticeAccessibility.mjs.
    assert.match(block, /\.brain-notice-band \{\s*--notice-hue: var\(--brand-green\);\s*--notice-ink: 24 24 27;/);
    assert.doesNotMatch(block, /text-shadow/);
    assert.match(block, /\.brain-notice-primary \{ background: var\(--notice-action\); color: white; \}/);
    assert.doesNotMatch(block, /(?<!\.dark )\.brain-notice-band \.brain-notice-primary \{ background: white/, 'en claro el principal no es blanco sobre vidrio claro');
    assert.match(block, /\.dark \.brain-notice-band \.brain-notice-primary \{ background: white; color: var\(--notice-action\)/);
    assert.match(block, /\.brain-notice-dot \{[^}]*background: var\(--notice-action\)/);
    assert.match(block, /@media \(max-width: 639px\) \{[^}]*min-height: 360px; padding-top: 180px; --notice-spread: 125%; --notice-mask: 140%/s, 'en el celular se ensancha');
    assert.match(block, /min-height: 300px; padding-top: 160px/, 'la cúpula crece con su contenido y el bloque queda en la parte hundida');
    // Entra subiendo con fundido y se va bajando con fundido (Rodny, 14 de noviembre de 2026: «fade up y fade low, que
    // sea suave»): la salida existe porque la banda conserva el último aviso marcado `data-leaving` hasta que termina.
    // La banda solo sube y baja; el fundido va en cada hija. Una opacidad animada en la banda apaga el desenfoque del
    // vidrio en Chrome, incluso con la animación ya terminada (medido el 14 de noviembre de 2026).
    assert.match(block, /animation: brain-notice-rise 480ms cubic-bezier\(\.22, 1, \.36, 1\) backwards;/);
    assert.match(block, /\.brain-notice-band > \.brain-notice-wash, \.brain-notice-band > \.brain-notice-content \{ animation: brain-notice-fade-in 480ms/);
    assert.match(block, /\.brain-notice-band\[data-leaving\] \{ animation: brain-notice-sink 320ms/);
    assert.match(block, /\.brain-notice-band\[data-leaving\] > \.brain-notice-wash, \.brain-notice-band\[data-leaving\] > \.brain-notice-content \{ animation: brain-notice-fade-out 320ms/);
    assert.match(block, /@keyframes brain-notice-rise \{ from \{ translate: 0 28px; \} to \{ translate: 0 0; \} \}/);
    assert.match(block, /@keyframes brain-notice-sink \{ from \{ translate: 0 0; \} to \{ translate: 0 28px; \} \}/);
    assert.match(block, /@keyframes brain-notice-fade-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
    assert.match(block, /@keyframes brain-notice-fade-out \{ from \{ opacity: 1; \} to \{ opacity: 0; \} \}/);
    assert.doesNotMatch(block, /@keyframes brain-notice-(rise|sink) \{[^}]*opacity/, 'la banda nunca anima su opacidad');
    assert.match(block, /\[data-leaving\] \.brain-notice-content \{ pointer-events: none; \}/, 'un aviso que se va no recibe clics');
    // Con «menos movimiento» la banda no se desplaza, pero el fundido de las hijas se queda.
    assert.match(block, /prefers-reduced-motion: reduce\) \{ \.brain-notice-band, \.brain-notice-band\[data-leaving\] \{ animation: none; \} \}/);
    assert.match(band, /export const NOTICE_EXIT_MS = 320;/);
    assert.match(band, /data-leaving=\{leaving \|\| undefined\}/);
    assert.match(band, /setTimeout\(\(\) => setShown\(null\), NOTICE_EXIT_MS\)/, 'también con «menos movimiento» espera el fundido de salida');
    assert.doesNotMatch(band, /reduce \? 0/);
    assert.match(band, /key=\{shown\.notice\.id\}/, 'otro aviso que llegue mientras uno se va lo reemplaza y entra');
    assert.doesNotMatch(band, /appearance|data-appearance/, 'una sola superficie, sin variantes');
    assert.match(band, /observer\.observe\(boxRef\.current\)/, 'se reserva lo que tapa: el bloque de texto y botones');
});

test('cierre de mes para Administrativa: abrir, «Ya la revisé» y «Recordarme» (Elisa, 13 de noviembre de 2026)', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    assert.match(band, /const isCycle = policy\?\.family === 'CYCLE'/);
    assert.match(base, /isCycle \? \(\s*<NoticeButton primary disabled=\{busy\} data-notice-action="open-cycle"/);
    assert.match(base, /\{isCycle \? 'Ya la revisé' : 'Recibido'\}/);
    assert.ok(base.indexOf('data-notice-action="acknowledge"') < base.indexOf('data-notice-action="snooze"'), '«Recordarme» sigue al final');
});

test('los botones: seguimiento primero, «Abrir» como botón y «Recordarme» siempre al final', () => {
    const base = band.slice(band.indexOf("{mode === 'base' && ("), band.indexOf("{mode === 'channels' && FOLLOW_UP_CHANNELS"));
    const order = ['data-notice-action="follow-up"', 'data-notice-action="schedule-follow-up"', 'data-notice-action="discard"', 'data-notice-action="close"', 'data-notice-action="open"', 'data-notice-action="archive"', 'data-notice-action="snooze"']
        .map((marker) => base.indexOf(marker));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(base, /<NoticeButton disabled=\{busy\} data-notice-action="open"/, '«Abrir» es un botón como los demás, no un enlace');
    assert.match(band, /aria-label="Motivo de la decisión"/);
    // Descartar es ahora un acceso directo pedido por Comercial; conserva motivo y confirmación.
    assert.doesNotMatch(band.slice(band.indexOf('isOperational ? (')), /Sigue: ya hice seguimiento|Cerrar como perdida|>\s*Cerrar\s*</);
    assert.match(base, /isCrm && noticeAllows\(notice, 'close'\).*selectOutcome\('DESCARTADO', 'discard'\)/);
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
