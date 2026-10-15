const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'errors', 'tokens']);

/** Depth-first walk over a Babel AST, calling visit(node, parent) for every node. */
export function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visit, node);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

/** Return the string value of a string literal or expression-free template literal. */
export function staticString(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** 1-based line and column for a node. */
export function position(node) {
  if (!node?.loc) return {};
  return { line: node.loc.start.line, column: node.loc.start.column + 1 };
}
