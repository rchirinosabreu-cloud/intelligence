import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ComposerActionLayout from '../src/components/ui/ComposerActionLayout.js';
import TopToolbarSurface from '../src/components/ui/TopToolbarSurface.js';
import { runEditorFormat } from '../src/components/ui/editorFormatting.js';

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

test('format toolbar participates in layout above the editor without overlaying messages', () => {
    const markup = renderToStaticMarkup(
        React.createElement(
            TopToolbarSurface,
            null,
            React.createElement('button', { 'aria-label': 'Negrita' })
        )
    );

    assert.match(markup, /relative/, 'toolbar must participate in the composer layout');
    assert.doesNotMatch(markup, /absolute/, 'toolbar must not overlay prior chat bubbles');
    assert.doesNotMatch(markup, /bottom-\[/, 'toolbar must not depend on a hard-coded vertical offset');
    assert.match(markup, /data-task-format-toolbar="true"/);
});

test('format commands use the live editor selection instead of restoring a stale range', () => {
    const calls = [];
    const chain = {
        focus() {
            calls.push('focus');
            return this;
        },
        toggleHeading(options) {
            calls.push(['heading', options]);
            return this;
        },
        setTextSelection() {
            throw new Error('formatting must not restore a stale selection');
        },
        run() {
            calls.push('run');
            return true;
        },
    };
    const editor = { chain: () => chain };

    const result = runEditorFormat(editor, current => current.toggleHeading({ level: 2 }));

    assert.equal(result, true);
    assert.deepEqual(calls, ['focus', ['heading', { level: 2 }], 'run']);
});
