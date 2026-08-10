import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const collectSourceFiles = (directory) => readdirSync(directory)
  .flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? collectSourceFiles(path) : [path];
  })
  .filter((path) => /\.(js|jsx)$/.test(path));

test('frontend uses the Brainstudio icon system instead of importing Lucide directly', () => {
  const directLucideImports = collectSourceFiles('src')
    .filter((path) => readFileSync(path, 'utf8').includes("from 'lucide-react'"));

  assert.deepEqual(directLucideImports, []);

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(packageJson.dependencies['@hugeicons/react']);
  assert.ok(packageJson.dependencies['@hugeicons/core-free-icons']);
});

test('every Brainstudio icon wrapper points to an imported Hugeicons source', () => {
  const source = readFileSync('src/components/ui/icons.jsx', 'utf8');
  const importedSources = new Set(
    [...source.matchAll(/^import\s+([A-Za-z0-9]+Data)\s+from\s+'@hugeicons\/core-free-icons\//gm)]
      .map((match) => match[1])
  );
  const usedSources = [...source.matchAll(/createIcon\(([A-Za-z0-9]+),/g)]
    .map((match) => match[1]);
  const missingSources = usedSources.filter((iconSource) => !importedSources.has(iconSource));

  assert.deepEqual(missingSources, []);
});
