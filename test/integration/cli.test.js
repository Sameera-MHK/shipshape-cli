import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture, tempCopy, write } from '../helpers.js';

const BIN = fileURLToPath(new URL('../../bin/shipshape.js', import.meta.url));
const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
    ...options,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('--version and --help', () => {
  assert.deepEqual(run(['--version']), { code: 0, stdout: `${version}\n`, stderr: '' });
  const help = run(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage:\n  shipshape check \[path\] \[options\]/);
  assert.match(help.stdout, /--strict/);
  assert.match(help.stdout, /never reads \.env\s+files/);
});

test('clean project exits 0 with every check passed', () => {
  const { code, stdout, stderr } = run(['check', fixture('valid-project')]);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /✓ package\.json is valid/);
  assert.match(stdout, /✓ Relative imports resolve/);
  assert.match(stdout, /✓ Referenced environment variables are listed in \.env\.example/);
  assert.match(stdout, /Summary: 0 errors, 0 warnings, 0 info/);
  assert.ok(!stdout.includes('\u001b['));
});

test('defaults to the current directory', () => {
  const { code, stdout } = run(['check'], { cwd: fixture('valid-project') });
  assert.equal(code, 0);
  assert.match(stdout, /Scanning: \./);
});

test('project errors exit 1', () => {
  const { code, stdout } = run(['check', fixture('broken-imports')]);
  assert.equal(code, 1);
  assert.match(stdout, /✗ IMP001 Cannot resolve import "\.\/lib\/missing" \(src\/index\.js:3:25\)/);
  assert.match(stdout, /Summary: 3 errors, 0 warnings, 0 info/);
});

test('warnings exit 0 by default and 1 with --strict', () => {
  assert.equal(run(['check', fixture('no-hygiene')]).code, 0);
  assert.equal(run(['check', fixture('no-hygiene'), '--strict']).code, 1);
});

test('--json output parses and matches the exit code', () => {
  const { code, stdout } = run(['check', fixture('env-missing'), '--json']);
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.version, version);
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.summary, { errors: 0, warnings: 3, info: 1 });
  assert.deepEqual(report.checks.map((c) => [c.id, c.status]), [
    ['package-json', 'passed'],
    ['project-files', 'passed'],
    ['imports', 'passed'],
    ['env-example', 'issues'],
  ]);
  assert.ok(report.findings.every((f) => f.check && f.ruleId && f.severity && f.message));

  const broken = run(['check', fixture('broken-imports'), '--json']);
  assert.equal(broken.code, 1);
  assert.equal(JSON.parse(broken.stdout).exitCode, 1);
});

test('--quiet prints only essential output with the same exit code', () => {
  const clean = run(['check', fixture('valid-project'), '--quiet']);
  assert.deepEqual(clean, { code: 0, stdout: 'Summary: 0 errors, 0 warnings, 0 info\n', stderr: '' });
  const broken = run(['check', fixture('broken-imports'), '--quiet']);
  assert.equal(broken.code, 1);
  assert.ok(!broken.stdout.includes('shipshape-cli v'));
  assert.equal(broken.stdout.match(/IMP001/g).length, 3);
});

test('paths containing spaces work', () => {
  const { code, stdout } = run(['check', fixture('project with spaces')]);
  assert.equal(code, 1);
  assert.match(stdout, /Cannot resolve import "\.\/src folder\/gone"/);
  assert.ok(!stdout.includes('my module'));
});

test('malformed package.json is a project error, not a crash', () => {
  const { code, stdout, stderr } = run(['check', fixture('malformed-package-json')]);
  assert.equal(code, 1);
  assert.equal(stderr, '');
  assert.match(stdout, /✗ PKG002 package\.json is not valid JSON \(package\.json:4:1\)/);
});

test('secret values from .env and .env.example are never printed', (t) => {
  const root = tempCopy('env-missing', t);
  write(root, '.env', 'API_URL=https://secret-host.internal\nDATABASE_URL=postgres://admin:SuperSecret123@db/prod\n');
  write(root, '.env.example', 'API_URL=example-value-should-not-print\nUNUSED_KEY=another-value-not-printed\n');
  for (const args of [[], ['--json'], ['--quiet']]) {
    const { stdout, stderr } = run(['check', root, ...args]);
    const output = stdout + stderr;
    for (const secret of ['SuperSecret123', 'secret-host.internal', 'example-value-should-not-print', 'another-value-not-printed']) {
      assert.ok(!output.includes(secret), `${secret} leaked with ${args.join(' ')}`);
    }
    // DATABASE_URL is defined in .env but .env must not be read, so it is still missing from the example.
    assert.ok(output.includes('DATABASE_URL'));
  }
});

test('.shipshapeignore patterns are listed in text and JSON output', () => {
  const text = run(['check', fixture('ignore-project')]);
  assert.equal(text.code, 1);
  assert.match(text.stdout, /Ignoring \(\.shipshapeignore\): fixtures\/, \/legacy\/\*\.js, \*\*\/\*\.generated\.js/);
  const json = JSON.parse(run(['check', fixture('ignore-project'), '--json']).stdout);
  assert.deepEqual(json.ignorePatterns, ['fixtures/', '/legacy/*.js', '**/*.generated.js']);
  assert.deepEqual(json.findings.map((f) => f.file), ['legacy/nested/keep.js', 'src/index.js']);
  assert.deepEqual(JSON.parse(run(['check', fixture('valid-project'), '--json']).stdout).ignorePatterns, []);
});

test('a malformed .shipshapeignore exits 2 with the offending line', (t) => {
  const root = tempCopy('valid-project', t);
  write(root, '.shipshapeignore', '# ok\n[abc].js\n');
  const { code, stdout, stderr } = run(['check', root]);
  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /^Error: \.shipshapeignore line 2: character classes/);
});

test('an unreadable .shipshapeignore exits 2', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'requires non-root POSIX permissions' }, (t) => {
  const root = tempCopy('valid-project', t);
  write(root, '.shipshapeignore', 'dist/\n');
  const file = `${root}/.shipshapeignore`;
  fs.chmodSync(file, 0o000);
  let result;
  try {
    result = run(['check', root]);
  } finally {
    fs.chmodSync(file, 0o644);
  }
  assert.equal(result.code, 2);
  assert.match(result.stderr, /\.shipshapeignore could not be read \(EACCES\)/);
});

test('secrets stay hidden when an ignore file is present', (t) => {
  const root = tempCopy('ignore-project', t);
  write(root, '.env', 'API_KEY=fake-secret-TopSecretValue987\n');
  write(root, 'src/config.js', 'export const k = process.env.API_KEY;\n');
  write(root, '.env.example', 'API_KEY=placeholder-value-not-printed\n');
  for (const args of [[], ['--json']]) {
    const { stdout, stderr } = run(['check', root, ...args]);
    assert.ok(!(stdout + stderr).includes('TopSecretValue987'));
    assert.ok(!(stdout + stderr).includes('placeholder-value-not-printed'));
  }
});

test("the repository's own .shipshapeignore hides fixtures but not real source problems", (t) => {
  const root = tempCopy('valid-project', t);
  fs.copyFileSync(new URL('../../.shipshapeignore', import.meta.url), `${root}/.shipshapeignore`);
  write(root, 'test/fixtures/broken/index.js', 'import x from "./fixture-missing";');
  write(root, 'examples/demo/index.js', 'import y from "./example-missing";');
  write(root, 'src/real.js', 'import z from "./real-missing";');
  const report = JSON.parse(run(['check', root, '--json']).stdout);
  assert.deepEqual(report.findings.map((f) => [f.ruleId, f.file]), [['IMP001', 'src/real.js']]);
  assert.equal(report.exitCode, 1);
});

test('invalid usage exits 2 with a message on stderr', () => {
  const cases = [
    [['check', '.', '--bogus']],
    [['deploy']],
    [[]],
    [['check', 'a', 'b']],
    [['check', '.', '--json', '--quiet']],
  ];
  for (const [args] of cases) {
    const { code, stdout, stderr } = run(args, { cwd: fixture('valid-project') });
    assert.equal(code, 2, args.join(' '));
    assert.equal(stdout, '');
    assert.match(stderr, /^Error: /);
  }
});

test('unreadable or invalid targets exit 2', () => {
  const missing = run(['check', fixture('nope-not-here')]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /Target path does not exist/);
  const file = run(['check', fixture('valid-project/package.json')]);
  assert.equal(file.code, 2);
  assert.match(file.stderr, /not a directory/);
});

test('--no-color and FORCE_COLOR control ANSI output', () => {
  const forced = run(['check', fixture('broken-imports')], { env: { ...process.env, NO_COLOR: '', FORCE_COLOR: '1' } });
  assert.ok(forced.stdout.includes('\u001b['));
  const disabled = run(['check', fixture('broken-imports'), '--no-color'], { env: { ...process.env, NO_COLOR: '', FORCE_COLOR: '1' } });
  assert.ok(!disabled.stdout.includes('\u001b['));
});
