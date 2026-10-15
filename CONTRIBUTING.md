# Contributing to ShipShape

Thanks for helping improve ShipShape.

## Setup

Requires Node.js 20 or later.

```bash
npm install
npm test
```

Run the CLI locally:

```bash
node bin/shipshape.js check examples/clean-node-app
node bin/shipshape.js check examples/broken-react-app --json
```

## Project layout

```
bin/shipshape.js          Executable entry point
src/cli.js                Argument parsing and exit codes
src/scanner.js            Target validation, file discovery, parsing, running checks
src/reporter.js           Text and JSON output
src/findings.js           Shared finding schema, summary and exit-code rules
src/ast.js                AST helpers
src/checks/*.js           One module per check
test/unit, test/integration, test/fixtures
examples/                 Example projects used in the README
```

## Adding or changing a rule

1. Put the logic in the relevant module in `src/checks/`. Each check exports `{ id, title, section, passMessage, run(context) }` and returns `{ findings }` or `{ skipped: reason, findings: [] }`.
2. Create findings with `finding()` from `src/findings.js`. Use a new, stable rule ID; never reuse or renumber existing IDs.
3. Prefer silence over false positives. If a result is not reliable, do not report it, or report it as `info`.
4. Never print file contents or environment values in messages.
5. Add a fixture under `test/fixtures/` and tests asserting the exact findings.
6. Document the rule in the README and add a CHANGELOG entry.

## Pull requests

- Keep changes focused and dependencies minimal; explain any new dependency.
- Run `npm test` and `npm run pack:check` before opening a PR.
