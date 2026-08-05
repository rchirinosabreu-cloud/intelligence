import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ComposerActionLayout from '../src/components/ui/ComposerActionLayout.js';
import TopToolbarSurface from '../src/components/ui/TopToolbarSurface.js';

test('composer actions keep format before emoji and send', () => {
    const markup = renderToStaticMarkup(
        React.createElement(ComposerActionLayout, {
            attachmentAction: React.createElement('button', { 'aria-label': 'Adjuntar' }),
            formatAction: React.createElement('button', { 'aria-label': 'Formato' }),
            emojiAction: React.createElement('button', { 'aria-label': 'Emoji' }),
            sendAction: React.createElement('button', { 'aria-label': 'Enviar' }),
        })
    );

    const attachmentIndex = markup.indexOf('aria-label="Adjuntar"');
    const formatIndex = markup.indexOf('aria-label="Formato"');
    const emojiIndex = markup.indexOf('aria-label="Emoji"');
    const sendIndex = markup.indexOf('aria-label="Enviar"');

    assert.ok(attachmentIndex !== -1, 'attachment action must render');
    assert.ok(formatIndex > attachmentIndex, 'format must follow attachment');
    assert.ok(emojiIndex > formatIndex, 'emoji must follow format');
    assert.ok(sendIndex > emojiIndex, 'send must be the final action');
});

test('format toolbar surface participates in composer layout', () => {
    const markup = renderToStaticMarkup(
        React.createElement(
            TopToolbarSurface,
            null,
            React.createElement('button', { 'aria-label': 'Negrita' })
        )
    );

    assert.match(markup, /data-toolbar-placement="in-flow"/, 'toolbar must reserve space inside the composer');
    assert.doesNotMatch(markup, /absolute/, 'toolbar must not float over conversation messages');
    assert.doesNotMatch(markup, /bottom-full/, 'toolbar must not overlay messages above the composer');
    assert.match(markup, /data-task-format-toolbar="true"/);
});
