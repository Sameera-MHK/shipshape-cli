import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from '@babel/parser';
import { finding } from './findings.js';
import packageJsonCheck from './checks/package-json.js';
import projectFilesCheck from './checks/project-files.js';
import importsCheck from './checks/imports.js';
import envExampleCheck from './checks/env-example.js';

export const CHECKS = [packageJsonCheck, projectFilesCheck, importsCheck, envExampleCheck];

export const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.output',
]);

export const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_FILES = 20000;

/** Error that maps to exit code 2 (usage problem or fatal execution error). */
export class FatalError extends Error {}

export function resolveTarget(input) {
  const root = path.resolve(input);
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    throw new FatalError(`Target path does not exist: ${input}`);
  }
  if (!stat.isDirectory()) {
    throw new FatalError(`Target path is not a directory: ${input}`);
  }
  try {
    fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    throw new FatalError(`Target directory is not readable: ${input}`);
  }
  const real = fs.realpathSync(root);
  if (real === path.parse(real).root) {
    throw new FatalError('Refusing to scan the filesystem root. Point ShipShape at a project directory.');
  }
  if (real === fs.realpathSync(os.homedir())) {
    throw new FatalError('Refusing to scan your home directory. Point ShipShape at a project directory.');
  }
  return real;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Walk the project, skipping excluded directories and all symbolic links,
 * and return relative paths of candidate source files.
 */
function collectSourceFiles(root, scanFindings) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      scanFindings.push(finding({
        ruleId: 'SCAN001',
        severity: 'warning',
        message: `Directory could not be read (${err.code || 'unknown error'}); its files were not checked`,
        file: toPosix(path.relative(root, dir)) || '.',
      }));
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) stack.push(abs);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.mts') || entry.name.endsWith('.d.cts')) continue;
        files.push(abs);
        if (files.length > MAX_FILES) {
          throw new FatalError(
            `More than ${MAX_FILES} source files found. Is this the right directory? ShipShape stops to avoid scanning far more than a single project.`,
          );
        }
      }
    }
  }
  return files.sort();
}

function parserPlugins(ext) {
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ['typescript', 'decorators-legacy'];
  if (ext === '.tsx') return ['typescript', 'jsx', 'decorators-legacy'];
  return ['jsx', 'decorators-legacy'];
}

export function parseSource(code, ext) {
  return parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: true,
    allowUndeclaredExports: true,
    errorRecovery: true,
    plugins: parserPlugins(ext),
  });
}

function loadSourceFile(root, abs, scanFindings) {
  const rel = toPosix(path.relative(root, abs));
  const ext = path.extname(abs);
  let buffer;
  try {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_FILE_BYTES) {
      scanFindings.push(finding({
        ruleId: 'SCAN002',
        severity: 'info',
        message: `File is larger than ${MAX_FILE_BYTES / 1024} KB and was skipped`,
        file: rel,
      }));
      return null;
    }
    buffer = fs.readFileSync(abs);
  } catch (err) {
    scanFindings.push(finding({
      ruleId: 'SCAN001',
      severity: 'warning',
      message: `File could not be read (${err.code || 'unknown error'}) and was not checked`,
      file: rel,
    }));
    return null;
  }
  if (buffer.subarray(0, 8000).includes(0)) {
    scanFindings.push(finding({
      ruleId: 'SCAN002',
      severity: 'info',
      message: 'File appears to be binary and was skipped',
      file: rel,
    }));
    return null;
  }

  const file = { rel, abs, ext, ast: null, parseError: null };
  try {
    file.ast = parseSource(buffer.toString('utf8'), ext);
    const firstError = file.ast.errors?.[0];
    if (firstError) file.parseError = firstError;
  } catch (err) {
    file.parseError = err;
  }
  return file;
}

/**
 * Scan a target directory and run every check against a shared context.
 * The scanned project is only read, never written to or executed.
 */
export function scan(targetInput) {
  const root = resolveTarget(targetInput);
  const scanFindings = [];
  const sourceFiles = collectSourceFiles(root, scanFindings)
    .map((abs) => loadSourceFile(root, abs, scanFindings))
    .filter(Boolean);

  const context = { root, sourceFiles };
  const checks = [];

  for (const check of CHECKS) {
    let result;
    try {
      result = check.run(context);
    } catch (err) {
      result = { skipped: `check failed to run (${err.message})`, findings: [] };
      scanFindings.push(finding({
        ruleId: 'SCAN003',
        severity: 'warning',
        message: `The ${check.title} check failed to run and was skipped`,
      }));
    }
    const findings = result.findings || [];
    let status = 'passed';
    if (result.skipped) status = 'skipped';
    else if (findings.some((f) => f.severity !== 'info')) status = 'issues';
    checks.push({
      id: check.id,
      title: check.title,
      section: check.section,
      status,
      ...(result.skipped ? { reason: result.skipped } : {}),
      ...(status === 'passed' ? { passMessage: check.passMessage } : {}),
      findings,
    });
  }

  if (scanFindings.length > 0) {
    checks.push({ id: 'scan', title: 'Scan', section: 'SCAN', status: 'issues', findings: scanFindings });
  }

  return {
    root,
    filesScanned: sourceFiles.length,
    checks,
    findings: checks.flatMap((c) => c.findings),
  };
}
