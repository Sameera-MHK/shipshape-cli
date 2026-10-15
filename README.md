# ShipShape

**Know what's broken before you ship.**

ShipShape is a lightweight command-line preflight check for JavaScript and React projects that finds broken package configuration, unresolved relative imports, undocumented environment variables, and missing project files before handoff, CI, or deployment.

> **Status:** v0.1.0 is an initial release. Rules and output may change before 1.0.

## Why

Small mistakes slip through until a build fails in CI or a teammate clones the repo: an import pointing at a file that was renamed, an environment variable nobody added to `.env.example`, an empty npm script, a missing `.gitignore`. ShipShape catches these in one fast, read-only pass, with no account, no network access, and no telemetry.

## Install and quick start

Requires Node.js 20 or later.

```bash
npx shipshape-cli check .
```

The package is named `shipshape-cli`; the command it installs is `shipshape`. Or install it as a dev dependency and add it to your scripts:

```bash
npm install --save-dev shipshape-cli
```

```json
{
  "scripts": {
    "preflight": "shipshape check ."
  }
}
```

> Use `npx shipshape-cli`, not `npx shipshape`: the unscoped `shipshape` package on npm is an unrelated project.

## Usage

```text
shipshape check [path] [options]
shipshape --help
shipshape --version
```

| Option | Description |
| --- | --- |
| `--json` | Print a machine-readable JSON report |
| `--quiet` | Print only errors, warnings and the summary |
| `--strict` | Exit with code 1 when warnings are found |
| `--no-color` | Disable colored output |
| `-h`, `--help` | Show usage |
| `-v`, `--version` | Show the installed version |

`path` defaults to the current directory. Colors are used only when output is a terminal; `NO_COLOR`, `FORCE_COLOR` and `TERM=dumb` are respected.

## Sample output

Running ShipShape on [`examples/broken-react-app`](examples/broken-react-app):

```text
ShipShape v0.1.0
Scanning: examples/broken-react-app
Source files analyzed: 3

PROJECT
  ✗ PKG008 Script "lint" is empty (package.json)
      Fix: Add a command for "lint" or remove the script.
  ! PKG009 No "test" script is defined (package.json)
      Fix: Add a "test" script so "npm test" runs your test suite in CI.
  i PKG010 No "build" script is defined, but "vite" is a dependency (package.json)
      Fix: Add a "build" script if this project has a build step.
  ! HYG001 README.md is missing
      Fix: Add a README.md describing what the project does and how to run it.
  ! HYG002 .gitignore is missing
      Fix: Add a .gitignore that excludes node_modules, build output, and local .env files.

IMPORTS
  ✗ IMP001 Cannot resolve import "./components/Footer" (src/App.jsx:2:20)
      Fix: Check the path and file name (including letter case), or create the missing file.
  ✗ IMP001 Cannot resolve import "./utils/date" (src/App.jsx:3:28)
      Fix: Check the path and file name (including letter case), or create the missing file.
  ✗ IMP001 Cannot resolve import "./styles.css" (src/main.jsx:4:8)
      Fix: Check the path and file name (including letter case), or create the missing file.

ENVIRONMENT
  ! ENV001 VITE_SENTRY_DSN is referenced but missing from .env.example (src/App.jsx:6:35)
      Fix: Add "VITE_SENTRY_DSN=" with a placeholder value to .env.example.
  i ENV002 VITE_ANALYTICS_ID is listed in .env.example but not referenced in scanned source files (.env.example)
      Fix: Remove it if it is no longer used. It may still be read by tooling outside JavaScript source (for example a framework or database config).

Summary: 4 errors, 4 warnings, 2 info
```

A check that has nothing to analyze is shown as skipped (for example `- Import integrity skipped: no JavaScript or TypeScript source files found`), never as passed.

## Supported checks

Symbols: `✗` error, `!` warning, `i` info, `✓` passed, `-` skipped.

### Package configuration

| Rule | Severity | What it finds |
| --- | --- | --- |
| PKG001 | error | `package.json` is missing or unreadable |
| PKG002 | error | `package.json` is not valid JSON (with line and column) |
| PKG003 | error | `package.json` is not a JSON object |
| PKG004 | warning | No `name` (skipped for `"private": true`) |
| PKG005 | error | `name` is not a valid npm package name (skipped for `"private": true`) |
| PKG006 | warning / error | `version` missing (warning, skipped for private packages) or not valid semver (error) |
| PKG007 | error | `scripts` is not an object |
| PKG008 | error | A script is empty or not a string |
| PKG009 | warning | No `test` script, or the `npm init` placeholder test script |
| PKG010 | info | No `build` script although a build tool (Vite, webpack, Next.js, etc.) is a dependency |
| PKG011 | error | A dependency field is not an object |
| PKG012 | error | `type` is not `"module"` or `"commonjs"` |

### Import integrity

| Rule | Severity | What it finds |
| --- | --- | --- |
| IMP001 | error | A relative import (`./` or `../`) that does not resolve to a file |
| IMP002 | warning | A source file that could not be fully parsed |

Files are parsed with [`@babel/parser`](https://babeljs.io/docs/babel-parser), not regular expressions. Supported forms: `import`, `export ... from`, `export * from`, `import()` and `require()` with static strings, TypeScript `import type` and `import x = require()`.

Resolution tries the exact path, then the extensions `.js .jsx .mjs .cjs .ts .tsx .mts .cts .json`, then `index.*` inside a directory (or a directory containing its own `package.json`). A `.js` import that exists as `.ts`/`.tsx` (common in TypeScript ESM projects) is accepted. Query and hash suffixes such as `?raw` are ignored. Package imports (`react`, `node:fs`, `@scope/pkg`) are never reported.

### Environment configuration

| Rule | Severity | What it finds |
| --- | --- | --- |
| ENV001 | warning | A variable read in source but missing from `.env.example` |
| ENV002 | info | A `.env.example` entry not referenced in source (only when all env access is static) |
| ENV003 | warning | Source reads environment variables but there is no `.env.example` |

Detected forms: `process.env.NAME`, `process.env['NAME']`, `process?.env?.NAME`, `const { NAME } = process.env`, and the same for `import.meta.env`. `NODE_ENV` and Vite's built-in `MODE`, `BASE_URL`, `PROD`, `DEV` and `SSR` are ignored.

### Project hygiene

| Rule | Severity | What it finds |
| --- | --- | --- |
| HYG001 | warning | No README |
| HYG002 | warning | No `.gitignore` |
| HYG003 | warning | A generated directory (`node_modules`, `dist`, `build`, `coverage`, `.next`, ...) exists at the project root but is not in `.gitignore` |

### Scan

| Rule | Severity | What it finds |
| --- | --- | --- |
| SCAN001 | warning | A file or directory could not be read; the rest of the scan continues |
| SCAN002 | info | A file was skipped because it is larger than 1 MB or appears to be binary |
| SCAN003 | warning | A check failed to run; it is reported as skipped |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | No errors found (warnings and info allowed) |
| 1 | One or more errors found, or warnings found with `--strict` |
| 2 | Invalid CLI usage, unreadable or invalid target, or a fatal execution error |

## JSON output

`shipshape check . --json` prints the same findings as the text report (run in `examples/broken-react-app`; the `findings` array is shortened here):

```json
{
  "tool": "shipshape",
  "version": "0.1.0",
  "target": ".",
  "filesScanned": 3,
  "summary": { "errors": 4, "warnings": 4, "info": 2 },
  "exitCode": 1,
  "checks": [
    { "id": "package-json", "title": "Package configuration", "status": "issues" },
    { "id": "project-files", "title": "Project hygiene", "status": "issues" },
    { "id": "imports", "title": "Import integrity", "status": "issues" },
    { "id": "env-example", "title": "Environment configuration", "status": "issues" }
  ],
  "findings": [
    {
      "check": "imports",
      "ruleId": "IMP001",
      "severity": "error",
      "message": "Cannot resolve import \"./components/Footer\"",
      "file": "src/App.jsx",
      "line": 2,
      "column": 20,
      "fix": "Check the path and file name (including letter case), or create the missing file."
    }
  ]
}
```

`status` is one of `passed`, `issues`, or `skipped` (with a `reason`). `file`, `line`, `column` and `fix` are present only when available. Paths are relative to the scanned directory.

## Supported Node.js versions

Node.js 20, 22 and 24 are tested in CI. The `engines` field requires `>=20`.

## Security and privacy

These guarantees are enforced by the code and covered by tests:

- **Read-only.** ShipShape never writes, moves or deletes files in the scanned project.
- **No code execution.** It never runs npm scripts, installs dependencies, or imports project code. Files are parsed, not executed.
- **No `.env` reading.** Only `.env.example` is read, and only variable names are kept; values are never stored or printed. Actual `.env` files are never opened.
- **No source output.** Findings contain rule IDs, messages, relative paths and positions, never source code.
- **No network and no telemetry.** ShipShape makes no network requests.
- **Bounded scope.** The target is resolved to an absolute path. Symbolic links are never followed. `node_modules`, `.git`, `dist`, `build`, `coverage`, `out`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache` and `.output` are skipped. Files over 1 MB and binary files are skipped. Imports that resolve outside the target directory are not checked. Scanning the filesystem root or your home directory is refused, and a scan stops with exit code 2 if it finds more than 20,000 source files.

## Known limitations

- **Path aliases are not resolved.** Imports such as `@/components/Button` or `~/utils` (from `tsconfig.json` `paths`, bundler aliases or `package.json` `imports`) are treated like package imports and not checked.
- **Letter case.** On case-insensitive file systems (default macOS and Windows), an import with the wrong letter case resolves locally and is not reported, even though it will fail on Linux.
- **Only static specifiers** are checked; `import(variable)` and `require(variable)` are ignored.
- **Other file types** (`.vue`, `.svelte`, `.astro`, `.mdx`) are not parsed, although imports *of* such files from JS/TS are checked.
- **Environment variables** are detected only through `process.env` and `import.meta.env`. Framework-specific loaders (for example Next.js `next.config.js` `env`, Prisma `env("...")` in `schema.prisma`, Docker or CI configuration) are not understood, which is why unused `.env.example` entries are reported only as info. Only `.env.example` is used; `.env.sample` or `.env.template` are not recognised.
- **Monorepos:** each package is scanned as its own project; run ShipShape per package.
- **`.gitignore` matching** is simplified to top-level names and simple wildcards; negation rules make the generated-directory check stay silent.
- ShipShape does not inspect git history or the git index, so it reports generated directories that are *not ignored*, not ones that are already committed.

## Dependencies

ShipShape has one runtime dependency: [`@babel/parser`](https://www.npmjs.com/package/@babel/parser), used to parse JavaScript, JSX, TypeScript and TSX reliably. Argument parsing (`node:util` `parseArgs`), file access and tests (`node:test`) use Node.js built-ins.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and how to add a rule.

```bash
npm install
npm test
node bin/shipshape.js check examples/broken-react-app
```

## Project status

v0.1.0 is an initial release. Its npm package name is `shipshape-cli`.

## License

[MIT](LICENSE)
