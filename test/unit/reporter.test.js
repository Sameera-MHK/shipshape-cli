import test from 'node:test';
import assert from 'node:assert/strict';
import { formatText, formatJson, shouldUseColor } from '../../src/reporter.js';

const report = {
  version: '0.1.0',
  target: './app',
  filesScanned: 2,
  summary: { errors: 1, warnings: 1, info: 1 },
  exitCode: 1,
  checks: [
    { id: 'package-json', title: 'Package configuration', section: 'PROJECT', status: 'passed', passMessage: 'package.json is valid', findings: [] },
    { id: 'project-files', title: 'Project hygiene', section: 'PROJECT', status: 'issues', findings: [{ ruleId: 'HYG001', severity: 'warning', message: 'README.md is missing' }] },
    { id: 'imports', title: 'Import integrity', section: 'IMPORTS', status: 'issues', findings: [{ ruleId: 'IMP001', severity: 'error', message: 'Cannot resolve import "./x"', file: 'a.js', line: 1, column: 8, fix: 'Fix it.' }] },
    { id: 'env-example', title: 'Environment configuration', section: 'ENVIRONMENT', status: 'skipped', reason: 'nothing to check', findings: [] },
    { id: 'scan', title: 'Scan', section: 'SCAN', status: 'issues', findings: [{ ruleId: 'SCAN002', severity: 'info', message: 'skipped big file', file: 'big.js' }] },
  ],
};
report.findings = report.checks.flatMap((c) => c.findings);

test('text output groups by section and shows skipped checks explicitly', () => {
  const text = formatText(report);
  assert.match(text, /^shipshape-cli v0\.1\.0\nScanning: \.\/app\n/);
  assert.match(text, /PROJECT\n  ✓ package\.json is valid\n  ! HYG001 README\.md is missing\n/);
  assert.match(text, /✗ IMP001 Cannot resolve import "\.\/x" \(a\.js:1:8\)\n      Fix: Fix it\./);
  assert.match(text, /- Environment configuration skipped: nothing to check/);
  assert.ok(!text.includes('✓ Referenced'));
  assert.match(text, /Summary: 1 error, 1 warning, 1 info\n$/);
  assert.ok(!text.includes('\u001b['), 'no ANSI codes without color');
});

test('quiet output prints only errors, warnings and the summary', () => {
  const text = formatText(report, { quiet: true });
  assert.ok(!text.includes('shipshape-cli v'));
  assert.ok(!text.includes('SCAN002'));
  assert.ok(text.includes('IMP001') && text.includes('HYG001'));
  assert.match(text, /Summary: 1 error, 1 warning, 1 info\n$/);
});

test('color output uses ANSI codes', () => {
  assert.ok(formatText(report, { color: true }).includes('\u001b[31m'));
});

test('JSON output contains the same findings tagged with their check', () => {
  const json = JSON.parse(formatJson(report));
  assert.equal(json.tool, 'shipshape');
  assert.equal(json.exitCode, 1);
  assert.deepEqual(json.summary, report.summary);
  assert.equal(json.findings.length, report.findings.length);
  assert.deepEqual(json.findings[1], { check: 'imports', ruleId: 'IMP001', severity: 'error', message: 'Cannot resolve import "./x"', file: 'a.js', line: 1, column: 8, fix: 'Fix it.' });
  assert.deepEqual(json.checks[3], { id: 'env-example', title: 'Environment configuration', status: 'skipped', reason: 'nothing to check' });
});

test('color detection respects NO_COLOR, FORCE_COLOR, TERM and TTY', () => {
  const tty = { isTTY: true };
  assert.equal(shouldUseColor(tty, {}), true);
  assert.equal(shouldUseColor({ isTTY: false }, {}), false);
  assert.equal(shouldUseColor(tty, { NO_COLOR: '1' }), false);
  assert.equal(shouldUseColor(tty, { TERM: 'dumb' }), false);
  assert.equal(shouldUseColor({ isTTY: false }, { FORCE_COLOR: '1' }), true);
  assert.equal(shouldUseColor(tty, { FORCE_COLOR: '0' }), false);
});
