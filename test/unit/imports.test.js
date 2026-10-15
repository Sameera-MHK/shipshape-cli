import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { collectImports, isRelativeSpecifier, resolvesRelative } from '../../src/checks/imports.js';
import { parseSource, scan } from '../../src/scanner.js';
import { fixture } from '../helpers.js';

function importsOf(code, ext = '.js') {
  return collectImports(parseSource(code, ext)).map((i) => i.specifier);
}

test('collects static, re-export, dynamic and require specifiers', () => {
  const code = `
    import a from './a';
    import './side-effect.css';
    export * from './b';
    export { c } from './c';
    const d = await import('./d');
    const e = require('./e');
    const f = import(\`./f\`);
    const g = import(name);
    const h = require(variable);
  `;
  assert.deepEqual(importsOf(code), ['./a', './side-effect.css', './b', './c', './d', './e', './f']);
});

test('parses TypeScript and TSX imports, including type-only and import = require', () => {
  const code = `
    import type { A } from './types';
    import fs = require('./legacy');
    export function id<T>(x: T): T { return x; }
  `;
  assert.deepEqual(importsOf(code, '.ts'), ['./types', './legacy']);
  assert.deepEqual(importsOf('import X from "./x"; const el = <X<string> />;', '.tsx'), ['./x']);
});

test('reports line and column of the specifier', () => {
  const [first] = collectImports(parseSource('\n\nimport a from "./a";', '.js'));
  assert.deepEqual(first, { specifier: './a', line: 3, column: 15 });
});

test('only relative specifiers are checked', () => {
  for (const s of ['./a', '../a', '.', '..']) assert.equal(isRelativeSpecifier(s), true, s);
  for (const s of ['react', '@scope/pkg', 'node:fs', '/abs', '~/alias', '@/alias']) assert.equal(isRelativeSpecifier(s), false, s);
});

test('resolves extensionless, index, TS .js-to-.ts, query suffix and JSON imports', () => {
  const from = path.join(fixture('valid-project'), 'src', 'main.jsx');
  for (const spec of ['./App', './App.jsx', './components/Button', './utils', './utils/math.js', './utils/helper', './data/config.json', './data/template.txt?raw']) {
    assert.equal(resolvesRelative(from, spec), true, spec);
  }
  for (const spec of ['./Missing', './components/Nope', './utils/math.mjs', './data']) {
    assert.equal(resolvesRelative(from, spec), false, spec);
  }
});

test('valid relative imports produce no findings', () => {
  const imports = scan(fixture('valid-project')).checks.find((c) => c.id === 'imports');
  assert.equal(imports.status, 'passed');
  assert.deepEqual(imports.findings, []);
});

test('broken relative imports are reported with file and position, external packages are not', () => {
  const imports = scan(fixture('broken-imports')).checks.find((c) => c.id === 'imports');
  assert.equal(imports.status, 'issues');
  assert.deepEqual(
    imports.findings.map((f) => [f.ruleId, f.severity, f.file, f.line, f.message]),
    [
      ['IMP001', 'error', 'src/index.js', 3, 'Cannot resolve import "./lib/missing"'],
      ['IMP001', 'error', 'src/index.js', 4, 'Cannot resolve import "./nowhere.js"'],
      ['IMP001', 'error', 'src/index.js', 6, 'Cannot resolve import "./lazy-missing"'],
    ],
  );
});

test('syntax errors are reported as a recoverable warning', () => {
  const imports = scan(fixture('parse-error')).checks.find((c) => c.id === 'imports');
  assert.deepEqual(imports.findings.map((f) => [f.ruleId, f.severity, f.file]), [['IMP002', 'warning', 'broken.js']]);
});

test('paths containing spaces resolve', () => {
  const imports = scan(fixture('project with spaces')).checks.find((c) => c.id === 'imports');
  assert.deepEqual(imports.findings.map((f) => f.message), ['Cannot resolve import "./src folder/gone"']);
});
