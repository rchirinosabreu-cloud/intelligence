import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('currency field starts in COP and supports an explicit USD choice through the shared select', async () => {
  const result = await build({ entryPoints: ['src/components/reports/ReportCurrencyField.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': path.resolve('src') }, external: ['react', 'react-dom'], logLevel: 'silent' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const Field = module.exports.default;
  const initial = renderToStaticMarkup(React.createElement(Field, { onChange() {} }));
  assert.match(initial, /value="COP" selected=""/);
  const usd = renderToStaticMarkup(React.createElement(Field, { value: 'USD', onChange() {}, disabled: true }));
  assert.match(usd, /value="USD" selected=""/);
  assert.match(usd, /disabled/);
  const source = readFileSync('src/components/modules/Reports.jsx', 'utf8');
  assert.match(source, /formData\.append\('currency', reportCurrency\)/);
});
