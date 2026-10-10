import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.[jt]sx?$/.test(file) ? [{ file, text: await readFile(file, 'utf8') }] : [];
  }));
  return nested.flat();
}

test('no platform module can render Bria from the old cacheable public URL or a discarded design', async () => {
  const files = await sources(path.resolve('src'));
  const outdated = files.filter(({ text }) => /brainstudio-mascot-tip|bria-pixel/.test(text));
  assert.deepEqual(outdated.map(({ file }) => path.relative(process.cwd(), file)), [], 'all Bria portraits must use the shared Chispa identity');
  const directPortraits = files.filter(({ text }) => /(?:from\s*|src=)[^\n]*bria-chispa\/idle\.png/.test(text));
  assert.equal(directPortraits.length, 1, 'one shared portrait owns the approved static asset; modules cannot create independent versions');
});
