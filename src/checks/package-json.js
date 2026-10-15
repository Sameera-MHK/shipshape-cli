import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../findings.js';

const FILE = 'package.json';
const NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NPM_INIT_TEST_PLACEHOLDER = 'echo "Error: no test specified" && exit 1';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
// Dependencies that indicate the project has a build step.
const BUILD_TOOLS = ['vite', 'webpack', 'next', 'react-scripts', 'parcel', 'rollup', 'esbuild', 'nuxt', 'astro', '@angular/cli', 'tsup', 'typescript'];

/** Convert a JSON.parse error position into a line and column without echoing file content. */
function jsonErrorLocation(err, text) {
  const match = /position (\d+)/.exec(err.message);
  if (!match) return {};
  const before = text.slice(0, Number(match[1]));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function checkPackageJson(root) {
  const findings = [];
  const file = path.join(root, FILE);

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      findings.push(finding({
        ruleId: 'PKG001',
        severity: 'error',
        message: 'package.json is missing',
        fix: 'Run "npm init" or add a package.json to the project root.',
      }));
    } else {
      findings.push(finding({
        ruleId: 'PKG001',
        severity: 'error',
        message: `package.json could not be read (${err.code || 'unknown error'})`,
        file: FILE,
      }));
    }
    return findings;
  }

  let pkg;
  try {
    pkg = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    findings.push(finding({
      ruleId: 'PKG002',
      severity: 'error',
      message: 'package.json is not valid JSON',
      file: FILE,
      ...jsonErrorLocation(err, text),
      fix: 'Fix the JSON syntax (check for trailing commas, comments, or unquoted keys).',
    }));
    return findings;
  }

  if (!isPlainObject(pkg)) {
    findings.push(finding({
      ruleId: 'PKG003',
      severity: 'error',
      message: 'package.json must contain a JSON object',
      file: FILE,
    }));
    return findings;
  }

  const isPrivate = pkg.private === true;

  if (pkg.name === undefined) {
    if (!isPrivate) {
      findings.push(finding({
        ruleId: 'PKG004',
        severity: 'warning',
        message: 'package.json has no "name" field',
        file: FILE,
        fix: 'Add a "name" field, or set "private": true if this package is never published.',
      }));
    }
  } else if (typeof pkg.name !== 'string' || pkg.name.length > 214 || !NAME_PATTERN.test(pkg.name)) {
    if (!isPrivate) {
      findings.push(finding({
        ruleId: 'PKG005',
        severity: 'error',
        message: '"name" is not a valid npm package name',
        file: FILE,
        fix: 'Use lowercase letters, digits, "-", "." or "_" (optionally scoped as @scope/name), at most 214 characters.',
      }));
    }
  }

  if (pkg.version === undefined) {
    if (!isPrivate) {
      findings.push(finding({
        ruleId: 'PKG006',
        severity: 'warning',
        message: 'package.json has no "version" field',
        file: FILE,
        fix: 'Add a semantic version such as "0.1.0", or set "private": true.',
      }));
    }
  } else if (typeof pkg.version !== 'string' || !SEMVER_PATTERN.test(pkg.version)) {
    findings.push(finding({
      ruleId: 'PKG006',
      severity: 'error',
      message: '"version" is not a valid semantic version',
      file: FILE,
      fix: 'Use a version in MAJOR.MINOR.PATCH form, such as "1.0.0".',
    }));
  }

  if (pkg.type !== undefined && pkg.type !== 'module' && pkg.type !== 'commonjs') {
    findings.push(finding({
      ruleId: 'PKG012',
      severity: 'error',
      message: '"type" must be "module" or "commonjs"',
      file: FILE,
    }));
  }

  for (const field of DEPENDENCY_FIELDS) {
    if (pkg[field] !== undefined && !isPlainObject(pkg[field])) {
      findings.push(finding({
        ruleId: 'PKG011',
        severity: 'error',
        message: `"${field}" must be an object mapping package names to versions`,
        file: FILE,
      }));
    }
  }

  let scripts = {};
  if (pkg.scripts !== undefined) {
    if (isPlainObject(pkg.scripts)) {
      scripts = pkg.scripts;
    } else {
      findings.push(finding({
        ruleId: 'PKG007',
        severity: 'error',
        message: '"scripts" must be an object mapping script names to commands',
        file: FILE,
      }));
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') {
      findings.push(finding({
        ruleId: 'PKG008',
        severity: 'error',
        message: `Script "${name}" must be a string command`,
        file: FILE,
      }));
    } else if (command.trim() === '') {
      findings.push(finding({
        ruleId: 'PKG008',
        severity: 'error',
        message: `Script "${name}" is empty`,
        file: FILE,
        fix: `Add a command for "${name}" or remove the script.`,
      }));
    }
  }

  if (scripts.test === undefined) {
    findings.push(finding({
      ruleId: 'PKG009',
      severity: 'warning',
      message: 'No "test" script is defined',
      file: FILE,
      fix: 'Add a "test" script so "npm test" runs your test suite in CI.',
    }));
  } else if (typeof scripts.test === 'string' && scripts.test.trim() === NPM_INIT_TEST_PLACEHOLDER) {
    findings.push(finding({
      ruleId: 'PKG009',
      severity: 'warning',
      message: 'The "test" script is still the npm init placeholder and always fails',
      file: FILE,
      fix: 'Replace it with a command that runs your tests.',
    }));
  }

  if (scripts.build === undefined) {
    const deps = { ...(isPlainObject(pkg.dependencies) ? pkg.dependencies : {}), ...(isPlainObject(pkg.devDependencies) ? pkg.devDependencies : {}) };
    const tool = BUILD_TOOLS.find((name) => Object.hasOwn(deps, name));
    if (tool) {
      findings.push(finding({
        ruleId: 'PKG010',
        severity: 'info',
        message: `No "build" script is defined, but "${tool}" is a dependency`,
        file: FILE,
        fix: 'Add a "build" script if this project has a build step.',
      }));
    }
  }

  return findings;
}

export default {
  id: 'package-json',
  title: 'Package configuration',
  section: 'PROJECT',
  passMessage: 'package.json is valid',
  run(context) {
    return { findings: checkPackageJson(context.root) };
  },
};
