
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { transformSync } from '@babel/core';

test('src/components/modules/TaskSidePanel.jsx compiles as JSX', (t) => {
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
    const result = transformSync(code, {
        presets: ['@babel/preset-react'],
        filename: 'TaskSidePanel.jsx'
    });
    assert.ok(result.code, 'Should compile successfully');
});

test('src/utils/chatUtils.jsx compiles as JSX', (t) => {
    const code = readFileSync('src/utils/chatUtils.jsx', 'utf8');
    const result = transformSync(code, {
        presets: ['@babel/preset-react'],
        filename: 'chatUtils.jsx'
    });
    assert.ok(result.code, 'Should compile successfully');
});

test('src/components/ui/LinkDropdown.jsx compiles as JSX', (t) => {
    const code = readFileSync('src/components/ui/LinkDropdown.jsx', 'utf8');
    const result = transformSync(code, {
        presets: ['@babel/preset-react'],
        filename: 'LinkDropdown.jsx'
    });
    assert.ok(result.code, 'Should compile successfully');
});
