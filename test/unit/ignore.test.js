import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compilePattern, parseIgnoreFile, loadIgnore } from '../../src/ignore.js';
import { FatalError } from '../../src/errors.js';
import { scan } from '../../src/scanner.js';
import { fixture, tempCopy, write } from '../helpers.js';

function matches(pattern, relPath, isDirectory = false) {
  return compilePattern(pattern).test(relPath, isDirectory);
}

test('a name without a slash matches at any depth', () => {
  assert.equal(matches('fixtures', 'fixtures', true), true);
  assert.equal(matches('fixtures', 'test/fixtures', true), true);
  assert.equal(matches('fixtures', 'test/fixtures.js'), false);
  assert.equal(matches('*.generated.js', 'src/deep/api.generated.js'), true);
});

test('a pattern with a slash or leading slash is anchored to the project root', () => {
  assert.equal(matches('test/fixtures', 'test/fixtures', true), true);
  assert.equal(matches('test/fixtures', 'packages/a/test/fixtures', true), false);
  assert.equal(matches('/legacy', 'legacy', true), true);
  assert.equal(matches('/legacy', 'src/legacy', true), false);
});

test('a trailing slash matches directories only', () => {
  assert.equal(matches('fixtures/', 'src/fixtures', true), true);
  assert.equal(matches('fixtures/', 'src/fixtures', false), false);
});

test('* and ? stay within one segment, ** crosses segments', () => {
  assert.equal(matches('/legacy/*.js', 'legacy/old.js'), true);
  assert.equal(matches('/legacy/*.js', 'legacy/nested/keep.js'), false);
  assert.equal(matches('/legacy/**/*.js', 'legacy/nested/keep.js'), true);
  assert.equal(matches('/legacy/**/*.js', 'legacy/old.js'), true);
  assert.equal(matches('examples/**', 'examples/a/b.js'), true);
  assert.equal(matches('file?.js', 'file1.js'), true);
  assert.equal(matches('file?.js', 'file12.js'), false);
  assert.equal(matches('a.b.js', 'aXb.js'), false, 'dots are literal');
});

test('comments and blank lines are ignored', () => {
  assert.deepEqual(parseIgnoreFile('# comment\n\n   \nfixtures/\n').map((m) => m.pattern), ['fixtures/']);
});

test('malformed patterns are rejected with the line number', () => {
  const cases = [
    ['ok/\n!keep.js', /line 2: negated patterns/],
    ['[abc].js', /line 1: character classes/],
    ['foo\\ bar', /line 1: character classes and backslash/],
    ['/', /line 1: .*whole project/],
    ['../outside', /line 1: .*"\.\."/],
  ];
  for (const [text, message] of cases) {
    assert.throws(() => parseIgnoreFile(text), (err) => err instanceof FatalError && message.test(err.message), text);
  }
});

test('no ignore file means nothing is ignored', () => {
  const ignore = loadIgnore(fixture('valid-project'));
  assert.deepEqual(ignore.patterns, []);
  assert.equal(ignore.isIgnored('src', true), false);
});

test('ignored paths produce no findings while non-ignored broken imports are still detected', () => {
  const result = scan(fixture('ignore-project'));
  assert.deepEqual(result.ignorePatterns, ['fixtures/', '/legacy/*.js', '**/*.generated.js']);
  assert.equal(result.filesScanned, 3);
  assert.deepEqual(
    result.findings.map((f) => [f.ruleId, f.file, f.message]),
    [
      ['IMP001', 'legacy/nested/keep.js', 'Cannot resolve import "./nested-missing"'],
      ['IMP001', 'src/index.js', 'Cannot resolve import "./really-missing"'],
    ],
  );
  assert.ok(!JSON.stringify(result).includes('IGNORED_FIXTURE_VAR'));
});

test('without the ignore file the same project reports every broken file', (t) => {
  const root = tempCopy('ignore-project', t);
  fs.rmSync(path.join(root, '.shipshapeignore'));
  const result = scan(root);
  assert.deepEqual(result.findings.filter((f) => f.ruleId === 'IMP001').map((f) => f.file), [
    'legacy/nested/keep.js',
    'legacy/old.js',
    'src/api.generated.js',
    'src/fixtures/broken.js',
    'src/index.js',
  ]);
  assert.ok(result.findings.some((f) => f.ruleId === 'ENV003' && f.message.includes('IGNORED_FIXTURE_VAR')));
});

test('a malformed ignore file stops the scan', (t) => {
  const root = tempCopy('valid-project', t);
  write(root, '.shipshapeignore', 'src/\n!src/main.jsx\n');
  assert.throws(() => scan(root), /\.shipshapeignore line 2: negated patterns/);
});
