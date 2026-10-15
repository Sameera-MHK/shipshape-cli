const SECTION_ORDER = ['PROJECT', 'IMPORTS', 'ENVIRONMENT', 'SCAN'];
const SYMBOLS = { error: '✗', warning: '!', info: 'i', passed: '✓', skipped: '-' };

export function shouldUseColor(stream, env = process.env) {
  if ('NO_COLOR' in env && env.NO_COLOR !== '') return false;
  if ('FORCE_COLOR' in env) return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  if (env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

function painter(enabled) {
  const wrap = (code) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : text);
  return { red: wrap(31), yellow: wrap(33), green: wrap(32), cyan: wrap(36), dim: wrap(2), bold: wrap(1) };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function summaryLine(summary) {
  return `Summary: ${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}, ${summary.info} info`;
}

function location(f) {
  if (!f.file) return '';
  let loc = f.file;
  if (f.line) loc += `:${f.line}`;
  if (f.line && f.column) loc += `:${f.column}`;
  return ` (${loc})`;
}

function formatFinding(f, c) {
  const color = f.severity === 'error' ? c.red : f.severity === 'warning' ? c.yellow : c.cyan;
  const lines = [`  ${color(SYMBOLS[f.severity])} ${color(f.ruleId)} ${f.message}${c.dim(location(f))}`];
  if (f.fix) lines.push(c.dim(`      Fix: ${f.fix}`));
  return lines;
}

/** Human-readable report. In quiet mode only errors, warnings and the summary are printed. */
export function formatText(report, { color = false, quiet = false } = {}) {
  const c = painter(color);
  const out = [];

  if (quiet) {
    for (const f of report.findings) {
      if (f.severity !== 'info') out.push(...formatFinding(f, c));
    }
    out.push(summaryLine(report.summary));
    return out.join('\n') + '\n';
  }

  out.push(c.bold(`ShipShape v${report.version}`));
  out.push(`Scanning: ${report.target}`);
  out.push(c.dim(`Source files analyzed: ${report.filesScanned}`));

  for (const section of SECTION_ORDER) {
    const checks = report.checks.filter((check) => check.section === section);
    if (checks.length === 0) continue;
    out.push('', c.bold(section));
    for (const check of checks) {
      if (check.status === 'skipped') {
        out.push(`  ${c.dim(SYMBOLS.skipped)} ${check.title} skipped: ${check.reason}`);
        continue;
      }
      if (check.status === 'passed') out.push(`  ${c.green(SYMBOLS.passed)} ${check.passMessage}`);
      for (const f of check.findings) out.push(...formatFinding(f, c));
    }
  }

  out.push('');
  const { errors, warnings } = report.summary;
  const line = summaryLine(report.summary);
  out.push(errors > 0 ? c.red(line) : warnings > 0 ? c.yellow(line) : c.green(line));
  return out.join('\n') + '\n';
}

/** Machine-readable report built from the same findings as the text output. */
export function formatJson(report) {
  const json = {
    tool: 'shipshape',
    version: report.version,
    target: report.target,
    filesScanned: report.filesScanned,
    summary: report.summary,
    exitCode: report.exitCode,
    checks: report.checks.map((check) => ({
      id: check.id,
      title: check.title,
      status: check.status,
      ...(check.reason ? { reason: check.reason } : {}),
    })),
    findings: report.checks.flatMap((check) => check.findings.map((f) => ({ check: check.id, ...f }))),
  };
  return JSON.stringify(json, null, 2) + '\n';
}
