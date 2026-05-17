# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
