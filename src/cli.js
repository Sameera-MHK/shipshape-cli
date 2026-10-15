import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { scan, FatalError, EXCLUDED_DIRS, MAX_FILE_BYTES } from './scanner.js';
import { summarize, exitCodeFor } from './findings.js';
import { formatText, formatJson, shouldUseColor } from './reporter.js';

export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const HELP = `shipshape-cli v${VERSION}
Know what's broken before you ship.

Usage:
  shipshape check [path] [options]
  shipshape --help
  shipshape --version

Commands:
  check [path]     Scan a project directory (default: current directory)

Options:
  --json           Print a machine-readable JSON report
  --quiet          Print only errors, warnings and the summary
  --strict         Exit with code 1 when warnings are found
  --no-color       Disable colored output (NO_COLOR is also respected)
  -h, --help       Show this help
  -v, --version    Show the installed version

Scan scope:
  shipshape-cli reads package.json, .gitignore, .env.example and
  JS/JSX/TS/TSX source files inside the target directory. It never reads .env
  files, never runs project scripts, never follows symbolic links and never
  modifies files.
  Skipped directories: ${[...EXCLUDED_DIRS].join(', ')}.
  Files larger than ${MAX_FILE_BYTES / 1024} KB are skipped.
  Paths listed in a .shipshapeignore file at the target root are skipped;
  the report lists the patterns in use.

Exit codes:
  0  No errors found
  1  Errors found (or warnings found with --strict)
  2  Invalid usage, unreadable target, or fatal execution error
`;

/**
 * Run the CLI. Returns the process exit code instead of exiting so it can be tested.
 */
export function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: 'boolean' },
        quiet: { type: 'boolean' },
        strict: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    stderr.write(`Error: ${err.message}\nRun "shipshape --help" for usage.\n`);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command, target = '.', ...extra] = positionals;
  if (command === undefined) {
    stderr.write(`Error: missing command.\n\n${HELP}`);
    return 2;
  }
  if (command !== 'check') {
    stderr.write(`Error: unknown command "${command}".\nRun "shipshape --help" for usage.\n`);
    return 2;
  }
  if (extra.length > 0) {
    stderr.write(`Error: expected a single path, got ${positionals.length - 1}.\nRun "shipshape --help" for usage.\n`);
    return 2;
  }
  if (values.json && values.quiet) {
    stderr.write('Error: --json and --quiet cannot be used together.\n');
    return 2;
  }

  let result;
  try {
    result = scan(target);
  } catch (err) {
    if (err instanceof FatalError) {
      stderr.write(`Error: ${err.message}\n`);
    } else {
      stderr.write(`Error: shipshape-cli failed unexpectedly: ${err.message}\n`);
    }
    return 2;
  }

  const summary = summarize(result.findings);
  const exitCode = exitCodeFor(summary, { strict: values.strict });
  const report = {
    version: VERSION,
    target,
    ignorePatterns: result.ignorePatterns,
    filesScanned: result.filesScanned,
    checks: result.checks,
    findings: result.findings,
    summary,
    exitCode,
  };

  if (values.json) {
    stdout.write(formatJson(report));
  } else {
    const color = !values['no-color'] && shouldUseColor(stdout, env);
    stdout.write(formatText(report, { color, quiet: values.quiet }));
  }
  return exitCode;
}
