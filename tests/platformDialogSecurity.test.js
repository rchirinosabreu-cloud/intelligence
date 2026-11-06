import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Linter } from 'eslint';

const linter = new Linter();
const nativeConfirmProblems = (source) => linter.verify(source, {
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  rules: {
    'no-restricted-globals': ['error', 'confirm'],
    'no-restricted-properties': ['error', { object: 'window', property: 'confirm' }]
  }
}, { allowInlineConfig: false });

test('dialog guard distinguishes browser confirmation from a locally bound service method', () => {
  assert.equal(nativeConfirmProblems('confirm("Eliminar?");').length, 1);
  assert.equal(nativeConfirmProblems('window.confirm("Eliminar?");').length, 1);
  assert.deepEqual(nativeConfirmProblems('async function confirm(id) { return id; } confirm("upload-id");'), []);
  assert.deepEqual(nativeConfirmProblems('const confirm = useConfirmDialog(); confirm({ title: "Eliminar?" });'), []);
});

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
    return nativeConfirmProblems(source).map(problem => `${filePath}:${problem.line}: ${problem.message}`);
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
