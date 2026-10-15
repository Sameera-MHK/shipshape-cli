import fs from 'node:fs';
import path from 'node:path';
import { walk, position } from '../ast.js';
import { finding } from '../findings.js';

const EXAMPLE_FILE = '.env.example';
// Variables provided by Node.js tooling or Vite itself, not by the project's environment.
const BUILT_IN_PROCESS_ENV = new Set(['NODE_ENV']);
const BUILT_IN_IMPORT_META_ENV = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);
const MAX_LISTED = 10;

function isProcessEnv(node) {
  return (
    (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

function isImportMetaEnv(node) {
  return (
    (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
    !node.computed &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    node.object.property.name === 'meta' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

function keyName(node, computed) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

/**
 * Collect environment variable names read from process.env and import.meta.env.
 * `dynamic` is true when the env object is accessed in a way names cannot be known statically.
 */
export function collectEnvReferences(ast) {
  const refs = [];
  let dynamic = false;

  walk(ast, (node, parent) => {
    const processEnv = isProcessEnv(node);
    if (!processEnv && !isImportMetaEnv(node)) return;
    const builtIns = processEnv ? BUILT_IN_PROCESS_ENV : BUILT_IN_IMPORT_META_ENV;
    const add = (name, keyNode) => {
      if (!builtIns.has(name)) refs.push({ name, ...position(keyNode) });
    };

    if (parent && (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.object === node) {
      const name = keyName(parent.property, parent.computed);
      if (name === null) dynamic = true;
      else add(name, parent.property);
    } else if (parent && parent.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'ObjectPattern') {
      for (const prop of parent.id.properties) {
        const name = prop.type === 'ObjectProperty' ? keyName(prop.key, prop.computed) : null;
        if (name === null) dynamic = true;
        else add(name, prop.key);
      }
    } else {
      dynamic = true;
    }
  });

  return { refs, dynamic };
}

/** Parse variable names from .env.example. Values are never returned or stored. */
export function parseEnvExampleNames(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

export function checkEnvExample(root, sourceFiles) {
  const findings = [];
  const firstUse = new Map();
  let dynamic = false;

  for (const file of sourceFiles) {
    if (!file.ast) continue;
    const result = collectEnvReferences(file.ast);
    if (result.dynamic) dynamic = true;
    for (const ref of result.refs) {
      if (!firstUse.has(ref.name)) firstUse.set(ref.name, { file: file.rel, line: ref.line, column: ref.column });
    }
  }

  let exampleText = null;
  try {
    exampleText = fs.readFileSync(path.join(root, EXAMPLE_FILE), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return {
        skipped: `${EXAMPLE_FILE} could not be read (${err.code || 'unknown error'})`,
        findings: [],
      };
    }
  }

  if (firstUse.size === 0 && exampleText === null) {
    return { skipped: 'no process.env or import.meta.env references found', findings };
  }

  if (exampleText === null) {
    const names = [...firstUse.keys()].sort();
    const listed = names.slice(0, MAX_LISTED).join(', ') + (names.length > MAX_LISTED ? `, and ${names.length - MAX_LISTED} more` : '');
    findings.push(finding({
      ruleId: 'ENV003',
      severity: 'warning',
      message: `${EXAMPLE_FILE} is missing, but the code references ${names.length} environment variable${names.length === 1 ? '' : 's'}: ${listed}`,
      fix: `Add a ${EXAMPLE_FILE} listing each variable with a placeholder value (never real secrets).`,
    }));
    return { findings };
  }

  const documented = parseEnvExampleNames(exampleText);

  for (const name of [...firstUse.keys()].sort()) {
    if (!documented.has(name)) {
      findings.push(finding({
        ruleId: 'ENV001',
        severity: 'warning',
        message: `${name} is referenced but missing from ${EXAMPLE_FILE}`,
        ...firstUse.get(name),
        fix: `Add "${name}=" with a placeholder value to ${EXAMPLE_FILE}.`,
      }));
    }
  }

  // Unused entries are only reported when every env access could be resolved statically.
  if (!dynamic) {
    for (const name of [...documented].sort()) {
      if (!firstUse.has(name)) {
        findings.push(finding({
          ruleId: 'ENV002',
          severity: 'info',
          message: `${name} is listed in ${EXAMPLE_FILE} but not referenced in scanned source files`,
          file: EXAMPLE_FILE,
          fix: 'Remove it if it is no longer used. It may still be read by tooling outside JavaScript source (for example a framework or database config).',
        }));
      }
    }
  }

  return { findings };
}

export default {
  id: 'env-example',
  title: 'Environment configuration',
  section: 'ENVIRONMENT',
  passMessage: 'Referenced environment variables are listed in .env.example',
  run(context) {
    if (context.sourceFiles.length === 0) {
      return { skipped: 'no JavaScript or TypeScript source files found', findings: [] };
    }
    return checkEnvExample(context.root, context.sourceFiles);
  },
};
