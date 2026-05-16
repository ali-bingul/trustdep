# Contributing to pkgsafe

Thank you for your interest in making the npm ecosystem safer.

## Quick start

```bash
git clone https://github.com/<your-fork>/pkgsafe
cd pkgsafe
npm install
npm test        # 45+ vitest tests, ~300ms
npm run build   # bundles to dist/cli.js
```

Link the CLI into your shell for live testing:

```bash
npm link
pkgsafe check axios
```

## Project layout

```
src/
  analysers/      # detection algorithms (typosquat, supply-chain, scripts, OSV)
  cache/          # SQLite-backed registry response cache
  commands/       # check / scan / watch CLI commands
  core/           # orchestration — runs all analysers on a package
  lock/           # package-lock / yarn.lock / pnpm-lock parsers
  output/         # terminal, JSON, SARIF reporters
  registry/       # npm registry + downloads-api clients
  scorer/         # turns signals into a numeric risk score
  cli.ts          # commander entry point
data/
  top10k.json     # popularity reference for typosquat checks
scripts/
  update-top-packages.mjs  # refreshes top10k.json from npm/npms.io
tests/            # vitest suites
```

## Coding standards

- TypeScript strict mode, `exactOptionalPropertyTypes` on. Avoid `any`.
- ESM only. Imports use `.js` extensions (TS source).
- No new runtime dependencies without discussion (CLI ships small).
- Public functions get a one-paragraph JSDoc explaining intent.

## Writing tests

- Vitest, colocated under `tests/`.
- New analysers must have a fixture-based test demonstrating both true positives and a false-positive guard.
- Run targeted: `npx vitest run tests/typosquat.test.ts`.

## Pull request checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` is green
- [ ] `npm run build` succeeds and CLI smoke test still works
- [ ] CHANGELOG.md updated under `## [Unreleased]`
- [ ] Conventional Commit message: `feat:`, `fix:`, `docs:`, `test:`, `chore:`

## Reporting vulnerabilities

Please see [SECURITY.md](SECURITY.md) — do **not** open a public issue for security reports.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful.
