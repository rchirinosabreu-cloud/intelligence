import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const collectSourceFiles = (directory) => readdirSync(directory)
  .flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory() ? collectSourceFiles(fullPath) : [fullPath];
  })
  .filter((filePath) => /\.(jsx?|tsx?)$/.test(filePath));

test('destructive confirmations use the platform dialog instead of browser dialogs', () => {
  const sourceFiles = collectSourceFiles(join(process.cwd(), 'src'));
  const nativeConfirmCalls = sourceFiles.flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8');
    const callsWindowConfirm = /window\.confirm\s*\(/.test(source);
    const callsUnscopedConfirm = /(^|[^.\w])confirm\s*\(/m.test(source)
      && !source.includes('useConfirmDialog');
    return callsWindowConfirm || callsUnscopedConfirm ? [filePath] : [];
  });

  assert.deepEqual(nativeConfirmCalls, []);

  const mainSource = readFileSync(join(process.cwd(), 'src/main.jsx'), 'utf8');
  assert.match(mainSource, /ConfirmDialogProvider/);
});

test('browser alerts are not used as application feedback', () => {
  const sourceFiles = collectSourceFiles(join(process.cwd(), 'src'));
  const nativeAlertCalls = sourceFiles.flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8');
    return /(?:window\.)?alert\s*\(/.test(source) ? [filePath] : [];
  });

  assert.deepEqual(nativeAlertCalls, []);
});
