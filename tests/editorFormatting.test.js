import test from 'node:test';
import assert from 'node:assert/strict';

import * as editorFormatting from '../src/components/ui/editorFormatting.js';

const makeEditor = ({ empty = true, textContent = 'texto escrito', active = false } = {}) => {
  const calls = [];
  const chain = {
    focus() {
      calls.push('focus');
      return this;
    },
    splitBlock() {
      calls.push('splitBlock');
      return this;
    },
    setHeading(attrs) {
      calls.push(['setHeading', attrs]);
      return this;
    },
    toggleHeading(attrs) {
      calls.push(['toggleHeading', attrs]);
      return this;
    },
    run() {
      calls.push('run');
      return true;
    },
  };

  return {
    calls,
    state: {
      selection: {
        empty,
        $from: {
          parent: {
            textContent,
          },
        },
      },
    },
    isActive() {
      return active;
    },
    chain() {
      return chain;
    },
  };
};

test('heading format starts a new heading block when the cursor is inside existing text', () => {
  assert.equal(typeof editorFormatting.runEditorHeadingFormat, 'function');
  const editor = makeEditor({ empty: true, textContent: 'Ya escribi esto' });

  const result = editorFormatting.runEditorHeadingFormat(editor, 1);

  assert.equal(result, true);
  assert.deepEqual(editor.calls, [
    'focus',
    'splitBlock',
    ['setHeading', { level: 1 }],
    'run',
  ]);
});

test('heading format converts selected text instead of starting a new block', () => {
  assert.equal(typeof editorFormatting.runEditorHeadingFormat, 'function');
  const editor = makeEditor({ empty: false, textContent: 'Texto seleccionado' });

  const result = editorFormatting.runEditorHeadingFormat(editor, 2);

  assert.equal(result, true);
  assert.deepEqual(editor.calls, [
    'focus',
    ['toggleHeading', { level: 2 }],
    'run',
  ]);
});
