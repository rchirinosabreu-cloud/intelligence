import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/modules/Team.jsx', import.meta.url), 'utf8');

test('team administration exposes the explicit financial role in its payload and form', () => {
  assert.match(source, /financialRole/);
  assert.match(source, /Nivel financiero/);
  assert.match(source, /value="VIEWER"/);
  assert.match(source, /value="EDITOR"/);
  assert.match(source, /value="APPROVER"/);
});
