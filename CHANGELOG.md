# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-05-26

### Added
- **Richer vulnerability reporting.** OSV findings now extract and display:
  - associated **CVE identifiers** alongside the GHSA id;
  - a parsed **CVSS base score and severity bucket** (e.g. `CVSS 7.5 (High)`), with CVSS v3 and v4 vector support;
  - the first known **fixed version** (`affected.ranges`);
  - an **advisory URL** (`More:` link).
- New `Signal.meta` field on the public types (`advisoryId`, `cveIds`, `cvssScore`, `cvssSeverity`, `cvssVector`, `fixedVersion`, `url`, `recommendation`). Carried through JSON/SARIF output automatically.
- **Recommended actions** summary block in the terminal report. Aggregates per-package upgrade targets (highest fix version wins), flags malicious packages for removal, and calls out advisories with no published fix.

### Changed
- Terminal signal rendering: severity-coloured headers (critical → red bold, high → red, medium/low → yellow), wrapped description, and dedicated `Severity:` / `Fix:` / `More:` lines instead of a single truncated `Evidence:` blob.
- `OsvVulnerability` type extended with `aliases`, `references`, `affected` (non-breaking).

### Fixed
- **CI (`update-top10k` workflow):** documented and worked around the "GitHub Actions is not permitted to create or approve pull requests" failure. The PR step now uses `${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}`, and the workflow includes inline guidance for enabling the repo setting or supplying a PAT.

## [1.1.0] - 2026-05-18

### Changed
- **Dependency footprint reduced from 8 to 4 runtime dependencies.**
- Replaced `got` with Node 18+ native `fetch` (new `src/registry/http.ts` helper with retry + AbortController timeout).
- Replaced `p-limit` with a ~15-line inline worker-pool concurrency limiter in `src/core/check-package.ts`.
- Replaced `ora` with a minimal stderr spinner (`src/output/spinner.ts`) that gracefully degrades in non-TTY contexts.
- Removed unused `cli-table3` dependency.
- Upgraded `tsup` to `^8.5.1` (fixes GHSA-3mv9-4h5g-vhg3).
- Upgraded `vitest` to `^2.1.9` (fixes GHSA-9crc-q9x8-hgqq).

### Security
- `npm audit --omit=dev` now reports **0 vulnerabilities**.
- Self-scan (`trustdep scan`) on its own deps: 2 high + 2 medium findings → reduced to 1 medium (known false-positive on `commander` new-publisher signal).

## [1.0.1] - 2026-05-18

### Fixed
- Corrected repository, homepage and bugs URLs in `package.json` (were pointing to old package name).
- Updated README Why section with detailed attack descriptions.
- Renamed all internal references from old package name to `trustdep`.

## [1.0.0] - 2026-05-16

### Added
- `check` command: analyse one or more npm packages (multi-package support).
- `scan` command: scan all dependencies declared in `package.json`.
- `watch` command: re-scan automatically when a lock file changes.
- Six analysers:
  - **Typosquat** — Damerau–Levenshtein, homoglyph, combosquat, word-order, delimiter-swap, plural variants.
  - **Supply chain** — maintainer changes, publish spikes, provenance loss, very-new packages.
  - **Script auditor** — postinstall / preinstall / dangerous shell patterns.
  - **Phantom dependency** — runtime imports without a declared dependency.
  - **OSV lookup** — known vulnerabilities via `api.osv.dev`.
  - **Downloads sanity check** — filters out unpopular typosquat false positives.
- Three reporters: human-readable terminal, JSON, SARIF (for GitHub Code Scanning).
- SQLite-backed registry cache (`~/.trustdep/cache.db`) with configurable TTL.
- Lock-file parser for `package-lock.json` v1/v2/v3, `yarn.lock`, and `pnpm-lock.yaml`.
- Bundled `data/top10k.json` (10 000 most-installed packages) refreshed weekly via a CI workflow.
- Three GitHub Actions workflows: `ci.yml`, `update-top10k.yml`, `security.yml`.

### Security
- Bot publishers allowlist (GitHub Actions, Renovate, Dependabot, semantic-release, etc.) prevents legitimate automated publishes from triggering "new publisher" / "maintainer removed" false positives.
- Trusted-scope allowlist (`@nestjs`, `@babel`, `@types`, `@angular`, `@aws-sdk`, …) exempts known-good organisations from typosquat heuristics.
- Distance-based typosquat matching is skipped for very short package names (< 5 characters) to avoid noise.

[Unreleased]: https://github.com/ali-bingul/trustdep/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/ali-bingul/trustdep/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ali-bingul/trustdep/releases/tag/v1.0.0
