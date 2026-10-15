import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../findings.js';

// Generated or dependency directories that should normally be ignored by git.
const GENERATED_DIRS = ['node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo', '.output'];

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

/**
 * Return true when a top-level directory name is ignored by simple .gitignore rules.
 * Handles plain names, leading/trailing slashes, "/**" suffixes, "**\/" prefixes and "*" wildcards.
 * Negations and nested paths are ignored, so unusual files are treated as "ignored" (no warning).
 */
export function isIgnored(dirName, gitignoreText) {
  let ignored = false;
  for (const raw of gitignoreText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      // Negation rules make simple matching unreliable; stay quiet.
      return true;
    }
    let pattern = line.replace(/^\*\*\//, '').replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
    if (pattern.includes('/')) continue;
    if (globToRegExp(pattern).test(dirName)) ignored = true;
  }
  return ignored;
}

function hasReadme(root) {
  return fs.readdirSync(root).some((name) => /^readme(\.(md|markdown|txt|rst))?$/i.test(name));
}

export function checkProjectFiles(root) {
  const findings = [];

  if (!hasReadme(root)) {
    findings.push(finding({
      ruleId: 'HYG001',
      severity: 'warning',
      message: 'README.md is missing',
      fix: 'Add a README.md describing what the project does and how to run it.',
    }));
  }

  let gitignore = null;
  try {
    gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      findings.push(finding({
        ruleId: 'SCAN001',
        severity: 'warning',
        message: `.gitignore could not be read (${err.code || 'unknown error'})`,
        file: '.gitignore',
      }));
      return findings;
    }
  }

  if (gitignore === null) {
    findings.push(finding({
      ruleId: 'HYG002',
      severity: 'warning',
      message: '.gitignore is missing',
      fix: 'Add a .gitignore that excludes node_modules, build output, and local .env files.',
    }));
    return findings;
  }

  for (const dir of GENERATED_DIRS) {
    let stat;
    try {
      stat = fs.lstatSync(path.join(root, dir));
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    if (!isIgnored(dir, gitignore)) {
      findings.push(finding({
        ruleId: 'HYG003',
        severity: 'warning',
        message: `Generated directory "${dir}/" exists but is not listed in .gitignore`,
        file: '.gitignore',
        fix: `Add "${dir}/" to .gitignore so it is not committed.`,
      }));
    }
  }

  return findings;
}

export default {
  id: 'project-files',
  title: 'Project hygiene',
  section: 'PROJECT',
  passMessage: 'README.md and .gitignore are present',
  run(context) {
    return { findings: checkProjectFiles(context.root) };
  },
};
