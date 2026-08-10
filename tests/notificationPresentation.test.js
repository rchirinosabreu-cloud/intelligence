import test from 'node:test';
import assert from 'node:assert';

import {
    cleanNotificationPreview,
    getNotificationDisplayParts
} from '../src/utils/notificationUtils.js';

test('cleanNotificationPreview strips rich text HTML and collapses comment text', () => {
    const richComment = '<p><a target="_blank" href="https://drive.google.com/drive/folders/abc">LINKS CARPETAS DE INFORMACION</a></p>';

    const preview = cleanNotificationPreview(richComment, 80);

    assert.equal(preview.includes('<p>'), false);
    assert.equal(preview.includes('target='), false);
    assert.equal(preview.includes('href='), false);
    assert.match(preview, /LINKS CARPETAS DE INFORMACION/);
});

test('getNotificationDisplayParts separates event title from readable content', () => {
    const notification = {
        type: 'TASK_COMMENT_REPLY',
        message: 'Nuevo mensaje en el hilo de la tarea "Pagina web y tienda virtual MUSEO DE MAMPUJAN": "<p><a target="_blank" href="https://drive.google.com">LINKS CARPETAS</a></p>..."'
    };

    const parts = getNotificationDisplayParts(notification);

    assert.equal(parts.title, 'Nuevo mensaje en el hilo de la tarea');
    assert.equal(parts.context, 'Pagina web y tienda virtual MUSEO DE MAMPUJAN');
    assert.equal(parts.body.includes('<a'), false);
    assert.equal(parts.body.includes('target='), false);
    assert.equal(parts.body.includes('&quot;'), false);
    assert.equal(parts.body.endsWith('"'), false);
    assert.match(parts.body, /LINKS CARPETAS/);
});

test('cleanNotificationPreview removes dangling legacy quote entities', () => {
    const preview = cleanNotificationPreview('lINKS CARPETAS DE INFORMACIÓN: ...&quot;', 120);

    assert.equal(preview, 'lINKS CARPETAS DE INFORMACIÓN: ...');
});

test('getNotificationDisplayParts keeps assignment title bold and task name as softer body', () => {
    const notification = {
        type: 'TASK_ASSIGNED',
        message: 'Se te ha asignado una tarea PRIORITARIA: Revisar propuesta comercial'
    };

    const parts = getNotificationDisplayParts(notification);

    assert.equal(parts.title, 'Se te ha asignado una tarea PRIORITARIA');
    assert.equal(parts.body, 'Revisar propuesta comercial');
});

test('personal announcements use a clear notification title and keep the message as body', () => {
    const notification = {
        type: 'TEAM_ANNOUNCEMENT',
        message: '<p>Recuerda preparar la propuesta antes de la reuniÃ³n.</p>'
    };

    const parts = getNotificationDisplayParts(notification);

    assert.equal(parts.title, 'Tienes un nuevo anuncio');
    assert.equal(parts.context, '');
    assert.equal(parts.body, 'Recuerda preparar la propuesta antes de la reuniÃ³n.');
});
