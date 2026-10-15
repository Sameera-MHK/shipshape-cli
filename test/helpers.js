import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export function fixture(name) {
  return path.join(FIXTURES, name);
}

/** Copy a fixture into a fresh temporary directory so tests can add files to it. */
export function tempCopy(name, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipshape-'));
  const target = path.join(dir, name);
  fs.cpSync(fixture(name), target, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return target;
}

export function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function ruleIds(findings) {
  return findings.map((f) => f.ruleId).sort();
}
