import fs from 'node:fs';
import path from 'node:path';
import { walk, staticString, position } from '../ast.js';
import { finding } from '../findings.js';

const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'];
// TypeScript projects often import "./file.js" that exists on disk as "./file.ts".
const TS_SOURCE_FOR = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

export function isRelativeSpecifier(specifier) {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/** Collect static module specifiers from import, export, dynamic import() and require() forms. */
export function collectImports(ast) {
  const imports = [];
  walk(ast, (node) => {
    let source = null;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
        source = node.source;
        break;
      case 'ImportExpression':
        source = node.source;
        break;
      case 'CallExpression':
        if (node.callee.type === 'Import' || (node.callee.type === 'Identifier' && node.callee.name === 'require')) {
          source = node.arguments[0];
        }
        break;
      case 'TSImportEqualsDeclaration':
        if (node.moduleReference?.type === 'TSExternalModuleReference') source = node.moduleReference.expression;
        break;
      default:
        break;
    }
    const specifier = staticString(source);
    if (specifier !== null) imports.push({ specifier, ...position(source) });
  });
  return imports;
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve a relative specifier the way common bundlers and Node do. Returns true if a target exists. */
export function resolvesRelative(fromFile, specifier) {
  const clean = specifier.replace(/[?#].*$/, '');
  const base = path.resolve(path.dirname(fromFile), clean);

  if (isFile(base)) return true;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (isFile(base + ext)) return true;
  }
  const tsAlternatives = TS_SOURCE_FOR[path.extname(base)];
  if (tsAlternatives) {
    const stem = base.slice(0, -path.extname(base).length);
    if (tsAlternatives.some((ext) => isFile(stem + ext))) return true;
  }
  if (isDirectory(base)) {
    // A package.json in the directory may point "main" anywhere; treat it as resolvable.
    if (isFile(path.join(base, 'package.json'))) return true;
    for (const ext of RESOLVE_EXTENSIONS) {
      if (isFile(path.join(base, 'index' + ext))) return true;
    }
  }
  return false;
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function checkImports(root, sourceFiles) {
  const findings = [];
  for (const file of sourceFiles) {
    if (file.parseError) {
      const loc = file.parseError.loc;
      findings.push(finding({
        ruleId: 'IMP002',
        severity: 'warning',
        message: 'File could not be fully parsed; some imports and env references may not be checked',
        file: file.rel,
        ...(loc ? { line: loc.line, column: loc.column + 1 } : {}),
        fix: 'Fix the syntax error, or check that the file extension matches its contents.',
      }));
    }
    if (!file.ast) continue;

    for (const { specifier, line, column } of collectImports(file.ast)) {
      if (!isRelativeSpecifier(specifier)) continue;
      const target = path.resolve(path.dirname(file.abs), specifier.replace(/[?#].*$/, ''));
      // Imports that leave the project (e.g. into a monorepo sibling) are outside the scan scope.
      if (!isInside(root, target)) continue;
      if (!resolvesRelative(file.abs, specifier)) {
        findings.push(finding({
          ruleId: 'IMP001',
          severity: 'error',
          message: `Cannot resolve import "${specifier}"`,
          file: file.rel,
          line,
          column,
          fix: 'Check the path and file name (including letter case), or create the missing file.',
        }));
      }
    }
  }
  return findings;
}

export default {
  id: 'imports',
  title: 'Import integrity',
  section: 'IMPORTS',
  passMessage: 'Relative imports resolve',
  run(context) {
    if (context.sourceFiles.length === 0) {
      return { skipped: 'no JavaScript or TypeScript source files found', findings: [] };
    }
    return { findings: checkImports(context.root, context.sourceFiles) };
  },
};
