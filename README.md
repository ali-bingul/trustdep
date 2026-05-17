# trustdep

> npm supply chain scanner — scan before you install.

[![npm version](https://img.shields.io/npm/v/trustdep)](https://npmjs.com/package/trustdep)
[![CI](https://github.com/ali-bingul/trustdep/actions/workflows/ci.yml/badge.svg)](https://github.com/ali-bingul/trustdep/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/trustdep)](LICENSE)
[![node](https://img.shields.io/node/v/trustdep)](package.json)
[![downloads](https://img.shields.io/npm/dm/trustdep)](https://npmjs.com/package/trustdep)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

`npm audit` only checks for known CVEs.
`trustdep` works differently — it analyses every package's history and detects anomalies.

## Why?

Between 2025 and 2026, the npm ecosystem suffered serious attacks:

- **Sept 2025** — Shai-Hulud worm: 500+ packages compromised
- **Sept 2025** — chalk/debug: 18 packages, 2.6B weekly downloads affected
- **Mar 2026** — Axios: 100M+ weekly downloads, RAT installed via phantom dependency

What they have in common: `npm audit` caught none of them.

## Install

```bash
npm install -g trustdep
```

## Usage

```bash
# Check a single package
trustdep check axios
trustdep check lodash@4.17.21

# Scan all dependencies in package.json
trustdep scan

# CI integration (exit 1 if risk > high)
trustdep scan --fail-on high --json

# Re-scan automatically when lock file changes
trustdep watch
```

## CI Integration

```yaml
# .github/workflows/security.yml
name: Supply Chain Check
on: [push, pull_request]

jobs:
  trustdep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx trustdep scan --fail-on high --json > trustdep-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: trustdep-report
          path: trustdep-report.json
```

## What it Checks

| Signal | Description | Weight |
|--------|-------------|--------|
| OSV / known malicious | OpenSSF database match | 70-100 |
| New lifecycle script | postinstall/preinstall appeared | 45 |
| Dangerous script content | curl pipe, eval, external URL | 50 |
| Maintainer change | new account added / old removed | 30-40 |
| Provenance lost | CI publish → manual publish | 35 |
| Phantom dependency | added but not used | 30 |
| Publish spike | 3+ versions in 24h | 25 |
| Typosquatting | Levenshtein + homoglyph + combosquat | 10-25 |

## Risk Levels

| Level | Score | Recommendation |
|-------|-------|----------------|
| clean | 0 | ✓ Safe |
| low | 1-19 | Informational |
| medium | 20-49 | Manual review recommended |
| high | 50-74 | Investigate before installing |
| critical | 75-100 | Do not install |

## Configuration

`trustdep.config.json` or a `"trustdep"` key inside `package.json`:

```json
{
  "trustdep": {
    "failOn": "high",
    "ignore": ["@company/*", "internal-*"],
    "threshold": 60,
    "cacheTtlHours": 24,
    "concurrency": 5
  }
}
```

## Privacy

trustdep only contacts `registry.npmjs.org` and `api.osv.dev`.
Package contents are never downloaded — only metadata is analysed.
Results are cached locally in `~/.trustdep/cache.db`.
No telemetry is collected.

## Contributing

```bash
git clone https://github.com/ali-bingul/trustdep
cd trustdep
npm install
npm run dev
npm test
```

## License

MIT © 2026
