import fs from 'node:fs';
import path from 'node:path';
import { FatalError } from './errors.js';

export const IGNORE_FILE = '.shipshapeignore';

function escapeRegExp(text) {
  return text.replace(/[.+^${}()|\\]/g, '\\$&');
}

/**
 * Compile one ignore pattern (a subset of .gitignore syntax) into a matcher.
 * - "name" without a slash matches a file or directory with that name at any depth.
 * - A pattern containing a slash, or starting with "/", is relative to the project root.
 * - A trailing "/" matches directories only.
 * - "*" and "?" match within one path segment; "**" matches across segments.
 */
export function compilePattern(raw) {
  let pattern = raw;
  const dirOnly = pattern.endsWith('/');
  if (dirOnly) pattern = pattern.replace(/\/+$/, '');
  const anchored = pattern.startsWith('/') || pattern.includes('/');
  pattern = pattern.replace(/^\/+/, '');

  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }

  const regex = new RegExp(anchored ? `^${source}$` : `^(?:.*/)?${source}$`);
  return { pattern: raw, test: (relPath, isDirectory) => (!dirOnly || isDirectory) && regex.test(relPath) };
}

/** Parse ignore file text. Throws FatalError naming the line for unsupported syntax. */
export function parseIgnoreFile(text) {
  const matchers = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const where = `${IGNORE_FILE} line ${index + 1}`;
    if (line.startsWith('!')) {
      throw new FatalError(`${where}: negated patterns ("!") are not supported.`);
    }
    if (/[[\]\\]/.test(line)) {
      throw new FatalError(`${where}: character classes and backslash escapes are not supported.`);
    }
    if (line.replace(/\//g, '') === '') {
      throw new FatalError(`${where}: pattern "${line}" would ignore the whole project.`);
    }
    if (line.split('/').includes('..')) {
      throw new FatalError(`${where}: patterns cannot contain "..".`);
    }
    matchers.push(compilePattern(line));
  });
  return matchers;
}

/**
 * Load .shipshapeignore from the project root.
 * Returns { patterns, isIgnored(relPath, isDirectory) }; with no file, nothing is ignored.
 */
export function loadIgnore(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, IGNORE_FILE), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { patterns: [], isIgnored: () => false };
    throw new FatalError(`${IGNORE_FILE} could not be read (${err.code || 'unknown error'}).`);
  }
  const matchers = parseIgnoreFile(text);
  return {
    patterns: matchers.map((m) => m.pattern),
    isIgnored: (relPath, isDirectory) => matchers.some((m) => m.test(relPath, isDirectory)),
  };
}
