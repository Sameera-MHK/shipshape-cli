import test from 'node:test';
import assert from 'node:assert/strict';
import { finding, summarize, exitCodeFor } from '../../src/findings.js';

test('finding omits empty optional fields', () => {
  assert.deepEqual(finding({ ruleId: 'X001', severity: 'info', message: 'm' }), { ruleId: 'X001', severity: 'info', message: 'm' });
  assert.deepEqual(
    finding({ ruleId: 'X001', severity: 'error', message: 'm', file: 'a.js', line: 2, column: 3, fix: 'f' }),
    { ruleId: 'X001', severity: 'error', message: 'm', file: 'a.js', line: 2, column: 3, fix: 'f' },
  );
});

test('finding rejects unknown severities', () => {
  assert.throws(() => finding({ ruleId: 'X001', severity: 'fatal', message: 'm' }));
});

test('summarize counts severities and exitCodeFor maps them', () => {
  const summary = summarize([
    { severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }, { severity: 'info' },
  ]);
  assert.deepEqual(summary, { errors: 1, warnings: 2, info: 1 });
  assert.equal(exitCodeFor(summary), 1);
  assert.equal(exitCodeFor({ errors: 0, warnings: 2, info: 0 }), 0);
  assert.equal(exitCodeFor({ errors: 0, warnings: 2, info: 0 }, { strict: true }), 1);
  assert.equal(exitCodeFor({ errors: 0, warnings: 0, info: 5 }, { strict: true }), 0);
});
