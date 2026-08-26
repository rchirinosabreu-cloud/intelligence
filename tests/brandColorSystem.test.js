import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the global interface remaps legacy purple palettes to Brainstudio colors', async () => {
  const [tailwind, button, index, manifest] = await Promise.all([
    read('tailwind.config.js'),
    read('src/components/ui/button.jsx'),
    read('index.html'),
    read('public/manifest.webmanifest')
  ]);

  assert.match(tailwind, /indigo:\s*brainBlue/);
  assert.match(tailwind, /violet:\s*brainBlue/);
  assert.match(tailwind, /purple:\s*brainGreen/);
  assert.match(tailwind, /600:\s*'#009EB9'/);
  assert.match(tailwind, /600:\s*'#00AC8A'/);
  assert.match(button, /bg-\[#009EB9\]/);
  assert.match(index, /theme-color" content="#009EB9"/);
  assert.equal(JSON.parse(manifest).theme_color, '#009EB9');
});
