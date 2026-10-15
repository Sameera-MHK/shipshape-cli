import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkProjectFiles, isIgnored } from '../../src/checks/project-files.js';
import { fixture, tempCopy, write, ruleIds } from '../helpers.js';

test('README and .gitignore present produces no findings', () => {
  assert.deepEqual(checkProjectFiles(fixture('valid-project')), []);
});

test('missing README and .gitignore are warnings', () => {
  const findings = checkProjectFiles(fixture('no-hygiene'));
  assert.deepEqual(ruleIds(findings), ['HYG001', 'HYG002']);
  assert.ok(findings.every((f) => f.severity === 'warning'));
});

test('generated directories missing from .gitignore are reported', (t) => {
  const root = tempCopy('valid-project', t);
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, 'build'));
  fs.mkdirSync(path.join(root, 'dist'));
  const findings = checkProjectFiles(root);
  assert.deepEqual(findings.map((f) => [f.ruleId, f.message]), [
    ['HYG003', 'Generated directory "build/" exists but is not listed in .gitignore'],
  ]);
});

test('gitignore matching handles common forms', () => {
  assert.equal(isIgnored('node_modules', 'node_modules'), true);
  assert.equal(isIgnored('node_modules', '/node_modules/'), true);
  assert.equal(isIgnored('node_modules', '**/node_modules'), true);
  assert.equal(isIgnored('dist', 'dist/**'), true);
  assert.equal(isIgnored('coverage', '# coverage\ncov*'), true);
  assert.equal(isIgnored('build', 'node_modules\nsrc/build'), false);
  assert.equal(isIgnored('build', '!keep.txt'), true);
});

test('missing .gitignore does not also report generated directories', (t) => {
  const root = tempCopy('no-hygiene', t);
  write(root, 'node_modules/x/index.js', '');
  assert.deepEqual(ruleIds(checkProjectFiles(root)), ['HYG001', 'HYG002']);
});
