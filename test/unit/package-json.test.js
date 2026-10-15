import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPackageJson } from '../../src/checks/package-json.js';
import { fixture, tempCopy, write, ruleIds } from '../helpers.js';

test('valid package.json produces no findings', () => {
  assert.deepEqual(checkPackageJson(fixture('valid-project')), []);
});

test('missing package.json is an error', () => {
  const findings = checkPackageJson(fixture('no-package-json'));
  assert.deepEqual(ruleIds(findings), ['PKG001']);
  assert.equal(findings[0].severity, 'error');
});

test('malformed package.json reports location without echoing content', () => {
  const findings = checkPackageJson(fixture('malformed-package-json'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'PKG002');
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].file, 'package.json');
  assert.equal(findings[0].line, 4);
  assert.ok(!findings[0].message.includes('malformed'));
});

test('invalid fields and scripts are reported', () => {
  const findings = checkPackageJson(fixture('invalid-fields'));
  assert.deepEqual(ruleIds(findings), ['PKG005', 'PKG006', 'PKG008', 'PKG008', 'PKG009', 'PKG011', 'PKG012']);
  const messages = findings.map((f) => f.message);
  assert.ok(messages.includes('Script "build" is empty'));
  assert.ok(messages.includes('Script "start" must be a string command'));
  assert.equal(findings.find((f) => f.ruleId === 'PKG009').severity, 'warning');
});

test('non-object package.json is an error', (t) => {
  const root = tempCopy('no-package-json', t);
  write(root, 'package.json', '[1, 2]');
  assert.deepEqual(ruleIds(checkPackageJson(root)), ['PKG003']);
});

test('missing test script is a warning, missing build is info only with build tooling', (t) => {
  const root = tempCopy('no-package-json', t);
  write(root, 'package.json', JSON.stringify({ name: 'a', version: '1.0.0', scripts: { start: 'node .' } }));
  let findings = checkPackageJson(root);
  assert.deepEqual(ruleIds(findings), ['PKG009']);
  assert.equal(findings[0].severity, 'warning');

  write(root, 'package.json', JSON.stringify({ name: 'a', version: '1.0.0', scripts: { test: 'vitest' }, devDependencies: { vite: '^5.0.0' } }));
  findings = checkPackageJson(root);
  assert.deepEqual(ruleIds(findings), ['PKG010']);
  assert.equal(findings[0].severity, 'info');
});

test('private packages do not need a name or version', (t) => {
  const root = tempCopy('no-package-json', t);
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { test: 'node --test' } }));
  assert.deepEqual(checkPackageJson(root), []);
  write(root, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  assert.deepEqual(ruleIds(checkPackageJson(root)), ['PKG004', 'PKG006']);
});
