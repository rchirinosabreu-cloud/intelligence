import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026). Contrato de las piezas de pantalla: el botón «Volver a …» vive una
// sola vez en el layout, los saltos más usados anotan de dónde salen y en Operación una pieza se mira sin salir.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('el layout monta «Volver a …» y la memoria de posición para toda la plataforma', () => {
    const layout = read('src/components/layout/AppLayout.jsx');
    assert.match(layout, /<BackToOrigin \/>/);
    assert.match(layout, /useScrollMemory\(\)/);
    const handler = layout.slice(layout.indexOf("if (notif.type === 'GENERAL_CHAT_MENTION')"), layout.indexOf("notif.type === 'MODULE_ACCESS_GRANTED'"));
    assert.doesNotMatch(handler, /[^m]navigate\(/, 'lo que se abre desde una notificación anota de dónde se salió');
    assert.match(layout, /navigateFrom\(`\/gestion\?taskId=\$\{notif\.taskId\}`\)/);
});

test('Bria y sus avisos viajan anotando el origen', () => {
    assert.match(read('src/components/bria/BriaAssistant.jsx'), /useNavigateFrom\(\)/);
    assert.match(read('src/components/bria/BriaNudge.jsx'), /navigateFrom\(item\.to\)/);
});

test('en Operación la pieza se mira en una ventana y abrirla en la parrilla ofrece volver', () => {
    const page = read('src/components/modules/Clients/operations/ClientOperationPage.jsx');
    assert.match(page, /data-piece-peek-open=\{piece\.id\}/);
    assert.match(page, /<PiecePeekDialog /);
    const route = read('src/components/modules/Clients/operations/ClientOperationRoute.jsx');
    assert.match(route, /usePageLabel\(/);
    for (const jump of ['onOpenPlan', 'onOpenPiece', 'onOpenWorkspace', 'onOpenTask']) {
        assert.match(route, new RegExp(`${jump}=\\{[^}]*navigateFrom\\(`), `${jump} anota de dónde se sale`);
    }
    const dialog = read('src/components/modules/Clients/operations/PiecePeekDialog.jsx');
    assert.match(dialog, /from '@\/components\/ui\/dialog'/, 'la ventana es la compartida, centrada');
    assert.doesNotMatch(dialog, /SlideOver|side=/, 'nada de paneles laterales');
});

test('el botón de volver no lleva colores de fuera de la marca', () => {
    const back = read('src/components/layout/BackToOrigin.jsx');
    assert.match(back, /text-brand-cyan-deep/);
    assert.doesNotMatch(back, /(purple|violet|indigo|sky|teal|emerald)-/);
});
