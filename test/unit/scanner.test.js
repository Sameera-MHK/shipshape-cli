import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan, resolveTarget, FatalError, MAX_FILE_BYTES } from '../../src/scanner.js';
import { tempCopy, write, ruleIds } from '../helpers.js';

const canChmod = process.platform !== 'win32' && process.getuid?.() !== 0;

test('excluded directories are not scanned', (t) => {
  const root = tempCopy('valid-project', t);
  for (const dir of ['node_modules/pkg', 'dist', 'build', 'coverage', '.git', '.next']) {
    write(root, `${dir}/broken.js`, 'import x from "./does-not-exist"; process.env.HIDDEN_VAR;');
  }
  const result = scan(root);
  // Only hygiene findings about the generated directories themselves are expected.
  assert.deepEqual(result.findings.filter((f) => !f.ruleId.startsWith('HYG')), []);
  assert.ok(!JSON.stringify(result).includes('HIDDEN_VAR'));
  assert.equal(result.filesScanned, 6);
});

test('symbolic links are not followed', (t) => {
  const root = tempCopy('valid-project', t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshape-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'evil.js'), 'import x from "./missing-outside";');
  fs.symlinkSync(outside, path.join(root, 'src', 'linked-dir'));
  fs.symlinkSync(path.join(outside, 'evil.js'), path.join(root, 'src', 'linked-file.js'));
  const result = scan(root);
  assert.deepEqual(result.findings, []);
  assert.equal(result.filesScanned, 6);
});

test('oversized and binary files are skipped with an info finding', (t) => {
  const root = tempCopy('valid-project', t);
  write(root, 'src/huge.js', 'import x from "./nope";\n' + '//'.padEnd(MAX_FILE_BYTES, 'x'));
  write(root, 'src/binary.js', Buffer.from([0x69, 0x6d, 0x00, 0x01, 0x02]));
  const result = scan(root);
  assert.deepEqual(result.findings.map((f) => [f.ruleId, f.severity, f.file]).sort(), [
    ['SCAN002', 'info', 'src/binary.js'],
    ['SCAN002', 'info', 'src/huge.js'],
  ]);
});

test('unreadable files are reported and the rest of the scan continues', { skip: !canChmod && 'requires non-root POSIX permissions' }, (t) => {
  const root = tempCopy('broken-imports', t);
  const locked = path.join(root, 'src', 'locked.js');
  fs.writeFileSync(locked, 'export default 1;');
  fs.chmodSync(locked, 0o000);
  let result;
  try {
    result = scan(root);
  } finally {
    fs.chmodSync(locked, 0o644);
  }
  assert.ok(result.findings.some((f) => f.ruleId === 'SCAN001' && f.file === 'src/locked.js' && f.severity === 'warning'));
  assert.equal(result.findings.filter((f) => f.ruleId === 'IMP001').length, 3);
});

test('unreadable directories are reported and skipped', { skip: !canChmod && 'requires non-root POSIX permissions' }, (t) => {
  const root = tempCopy('valid-project', t);
  const locked = path.join(root, 'locked');
  write(root, 'locked/a.js', 'import x from "./nope";');
  fs.chmodSync(locked, 0o000);
  let result;
  try {
    result = scan(root);
  } finally {
    fs.chmodSync(locked, 0o755);
  }
  assert.deepEqual(ruleIds(result.findings), ['SCAN001']);
  assert.equal(result.findings[0].file, 'locked');
});

test('target validation rejects missing paths, files, the filesystem root and home directory', (t) => {
  assert.throws(() => resolveTarget('/definitely/not/here'), FatalError);
  const root = tempCopy('valid-project', t);
  assert.throws(() => resolveTarget(path.join(root, 'package.json')), /not a directory/);
  assert.throws(() => resolveTarget(path.parse(process.cwd()).root), /filesystem root/);
  assert.throws(() => resolveTarget(os.homedir()), /home directory/);
});

test('scanning never modifies the project', (t) => {
  const root = tempCopy('broken-imports', t);
  const snapshot = () => fs.readdirSync(root, { recursive: true }).sort().map((p) => {
    const abs = path.join(root, p);
    return fs.statSync(abs).isFile() ? `${p}:${fs.readFileSync(abs, 'utf8')}` : p;
  });
  const before = snapshot();
  scan(root);
  assert.deepEqual(snapshot(), before);
});
