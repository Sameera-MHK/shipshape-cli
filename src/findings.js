export const SEVERITIES = ['error', 'warning', 'info'];

/**
 * Create a finding using the shared schema.
 * Optional fields are omitted when not provided so JSON output stays compact.
 */
export function finding({ ruleId, severity, message, file, line, column, fix }) {
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`Unknown severity "${severity}" for ${ruleId}`);
  }
  const result = { ruleId, severity, message };
  if (file) result.file = file;
  if (Number.isInteger(line)) result.line = line;
  if (Number.isInteger(column)) result.column = column;
  if (fix) result.fix = fix;
  return result;
}

export function summarize(findings) {
  const summary = { errors: 0, warnings: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === 'error') summary.errors++;
    else if (f.severity === 'warning') summary.warnings++;
    else summary.info++;
  }
  return summary;
}

export function exitCodeFor(summary, { strict = false } = {}) {
  if (summary.errors > 0) return 1;
  if (strict && summary.warnings > 0) return 1;
  return 0;
}
