import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('repository keeps agent skills in one canonical location without tool-specific adapters', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const adapters = tracked.filter(path => /^(?:\.[^/]+\/skills\/|skills\/)/.test(path) && !path.startsWith('.agents/skills/'));
  assert.deepEqual(adapters, [], 'Generated tool adapters must remain local, not in the repository');
});

test('every locked skill has a readable canonical entry point', async () => {
  const lock = JSON.parse(await readFile(new URL('../skills-lock.json', import.meta.url), 'utf8'));
  for (const name of Object.keys(lock.skills)) {
    const content = await readFile(new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(content, /^---\r?\n/);
    assert.match(content, /^description:/m, name);
  }
});
