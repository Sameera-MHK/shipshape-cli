# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

Initial release.

### Added

- `shipshape check [path]` with `--json`, `--quiet`, `--strict` and `--no-color`.
- Package configuration checks (PKG001-PKG012).
- Relative import integrity checks for JS, JSX, TS and TSX (IMP001-IMP002).
- Environment variable checks against `.env.example` (ENV001-ENV003).
- Project hygiene checks for README, `.gitignore` and generated directories (HYG001-HYG003).
- Scan safety: no symlink following, excluded generated directories, size and binary limits, refusal to scan the filesystem root or home directory.
- Exit codes 0 (no errors), 1 (errors), 2 (usage or fatal error).
- `.shipshapeignore` for explicitly excluding paths (such as intentionally broken fixtures) from a scan.

### Fixed

- Imports of TypeScript declaration files (`./types` resolving to `types.d.ts`) are no longer reported as broken.
