import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEnvReferences, parseEnvExampleNames } from '../../src/checks/env-example.js';
import { parseSource, scan } from '../../src/scanner.js';
import { fixture, ruleIds } from '../helpers.js';

function refsOf(code, ext = '.js') {
  const { refs, dynamic } = collectEnvReferences(parseSource(code, ext));
  return { names: refs.map((r) => r.name), dynamic };
}

test('collects process.env and import.meta.env references', () => {
  const code = `
    process.env.A;
    process.env['B'];
    process?.env?.C;
    const { D, E: renamed } = process.env;
    import.meta.env.VITE_F;
    import.meta.env.MODE;
    process.env.NODE_ENV;
  `;
  assert.deepEqual(refsOf(code), { names: ['A', 'B', 'C', 'D', 'E', 'VITE_F'], dynamic: false });
});

test('dynamic env access is detected', () => {
  assert.equal(refsOf('process.env[key]').dynamic, true);
  assert.equal(refsOf('const all = process.env;').dynamic, true);
  assert.equal(refsOf('const { A, ...rest } = process.env;').dynamic, true);
  assert.equal(refsOf('const a = process.env.A;').dynamic, false);
});

test('works in TypeScript files', () => {
  assert.deepEqual(refsOf('const a: string = process.env.A as string;', '.ts').names, ['A']);
});

test('parses only variable names from .env.example', () => {
  const names = parseEnvExampleNames('# comment\nA=1\nexport B=two\n  C = three\nnot a var\n=nope\n');
  assert.deepEqual([...names], ['A', 'B', 'C']);
});

test('all documented variables pass', () => {
  const env = scan(fixture('valid-project')).checks.find((c) => c.id === 'env-example');
  assert.equal(env.status, 'passed');
  assert.deepEqual(env.findings, []);
});

test('missing variables are warnings and unused entries are info', () => {
  const env = scan(fixture('env-missing')).checks.find((c) => c.id === 'env-example');
  assert.equal(env.status, 'issues');
  assert.deepEqual(
    env.findings.map((f) => [f.ruleId, f.severity, f.message.split(' ')[0]]),
    [
      ['ENV001', 'warning', 'DATABASE_URL'],
      ['ENV001', 'warning', 'SENTRY_DSN'],
      ['ENV001', 'warning', 'STRIPE_KEY'],
      ['ENV002', 'info', 'UNUSED_KEY'],
    ],
  );
  const db = env.findings[0];
  assert.equal(db.file, 'src/server.js');
  assert.equal(db.line, 2);
});

test('unused entries are not reported when env access is dynamic', () => {
  const env = scan(fixture('env-dynamic')).checks.find((c) => c.id === 'env-example');
  assert.deepEqual(env.findings, []);
});

test('missing .env.example is reported once, listing variable names', () => {
  const env = scan(fixture('no-env-example')).checks.find((c) => c.id === 'env-example');
  assert.deepEqual(ruleIds(env.findings), ['ENV003']);
  assert.match(env.findings[0].message, /API_URL, SECRET_KEY/);
});

test('check is skipped, not passed, when there are no env references or example', () => {
  const env = scan(fixture('broken-imports')).checks.find((c) => c.id === 'env-example');
  assert.equal(env.status, 'skipped');
  assert.match(env.reason, /no named process\.env/);
});
