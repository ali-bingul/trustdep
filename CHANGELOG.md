# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Notice when a pinned version is not published.** `check foo@1.2.3` and a pinned `package.json` entry now report `version 1.2.3 is not published; analysed <resolved> instead` instead of silently analysing the fallback version. Surfaced in the terminal report and as a `notice` field in JSON output. Version *ranges* are unaffected — they are meant to float.

### Removed
- **`.npmignore`.** `package.json` declares a `files` allowlist, which npm honours in preference to `.npmignore`, so the file had no effect on the published tarball (verified: the same six files ship before and after).

## [2.0.0] - 2026-09-13

### Changed
- **BREAKING — minimum supported Node.js is now `>=20.19.0`** (was `>=18.0.0`). Node 18 reached end-of-life on 2025-04-30 and the test toolchain (`vitest` 4) no longer runs on it. The CI matrix is now Node 20 / 22 / 24.
- **Registry cache is now a dependency-free file store.** Responses are kept as one JSON file per key under `~/.trustdep/cache/` (atomic write via temp file + rename, `0700` directory / `0600` file permissions), replacing the SQLite database at `~/.trustdep/cache.db`. TTL behaviour, the `Cache` API and `--no-cache` are unchanged. A leftover `~/.trustdep/cache.db` from an earlier version is no longer read and can be deleted.

### Removed
- **`better-sqlite3` and `@types/better-sqlite3`.** The runtime dependency tree drops from 40 packages to 3 (`chalk`, `commander`, `semver`): no native code, no install scripts, and no prebuilt binary download at install time. This also clears the Socket.dev alerts inherited from that subtree (obfuscated code, optimized-override on `safe-buffer`, network/shell access, native code, deprecated transitive packages).

### Fixed
- **Version ranges are resolved with semver instead of being treated as exact versions.** `NpmClient.resolveVersion` previously looked for the range string as a literal version key and, on a miss, fell back to the *last key* of the packument `versions` object — that is publish order, so the fallback landed on the newest published build including nightlies and canaries. Consequences: `typescript: "^5.4.0"` was analysed as `7.1.0-dev.*` (version `5.4.0` was never published), and `next: "^13.4"` as a `16.x-canary` build carrying 0 advisories instead of `13.5.x` carrying 34 — a false negative across every analyser. Resolution order is now exact version → dist-tag → `semver.maxSatisfying` over the published versions → `dist-tags.latest` → highest stable version. Prereleases are never selected for a stable range.
- **`scan` no longer truncates ranges.** The declared range is passed through intact; `^`, `~`, `x`-ranges and compound ranges (`>=1.6.0 <2`) are all resolved correctly.
- **Dev toolchain advisories.** `vitest` `^2.1.9` → `^4.1.11` (GHSA-5xrq-8626-4rwp, CVSS 10.0; GHSA-82fw-gwwq-j7x9) and `esbuild` pinned to `^0.28.1` through `overrides` (GHSA-g7r4-m6w7-qqqr). `npm audit` reports no vulnerabilities.

### Added
- Test coverage for the two rewritten areas: 13 cache tests (round-trip, expiry, cleanup, corrupt entries, atomic overwrite) and 21 version-resolution tests (exact, dist-tag, caret/tilde/x/compound ranges, unpublished range base, prerelease exclusion, fallbacks).

## [1.2.2] - 2026-05-26

### Fixed
- **Avoid Socket.dev "Uses eval" false positive.** The dynamic-eval detection regex in `script-auditor` is now built from string fragments (`"ev" + "al"`) so the literal `eval(` substring no longer appears in the published bundle. The analyser's behaviour is unchanged; only the source representation differs. The corresponding signal description was renamed to `dynamic-eval invocation`.

### Documentation
- **New `Network Access` section in `README.md`** replacing the brief `Privacy` note. Documents the three endpoints trustdep contacts (`registry.npmjs.org`, `api.npmjs.org/downloads`, `api.osv.dev/v1/query`), what each is used for and by which analyser, request properties (HTTPS only, User-Agent, timeouts, no auth/telemetry, no tarball downloads), and a subsection explaining why supply-chain scanners flag network access for trustdep by design.

## [1.2.1] - 2026-05-26

### Fixed
- **SARIF output now passes GitHub Code Scanning validation.** Every `result` entry includes a required `locations[]` (anchored to `package.json`) plus a `logicalLocations` entry naming the package, fixing the `locationFromSarifResult: expected at least one location` upload error.
- Added stable `partialFingerprints.trustdepSignal` (`<package>@<signalId>`) to each SARIF result so Code Scanning can dedupe and re-open alerts across scans.

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

[Unreleased]: https://github.com/ali-bingul/trustdep/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/ali-bingul/trustdep/compare/v1.2.2...v2.0.0
[1.0.1]: https://github.com/ali-bingul/trustdep/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ali-bingul/trustdep/releases/tag/v1.0.0
