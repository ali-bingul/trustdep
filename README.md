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

Between 2025 and 2026, the npm ecosystem experienced multiple major supply-chain attacks that exposed critical gaps in traditional dependency security tooling.

**Sept 2025 — Shai-Hulud worm**
A large-scale supply-chain attack compromised 500+ npm packages through maintainer account takeovers and automated propagation across the ecosystem.

**Sept 2025 — Chalk / Debug compromise**
A coordinated phishing-based attack led to the compromise of 18 widely used packages, including `chalk` and `debug`, which collectively account for approximately 2.6 billion weekly downloads. The malicious versions introduced browser-side payloads capable of runtime manipulation and crypto/Web3 transaction tampering.

**Mar 2026 — Axios supply-chain attack**
The Axios package was compromised via a malicious "phantom dependency" injection, resulting in the distribution of a cross-platform RAT to downstream users, despite Axios being downloaded over 100 million times per week.

**Common pattern**
These incidents were not traditional vulnerability exploits — they were trusted-publisher compromises and malicious package injections. This means they were not detected by standard tools like `npm audit`, since no CVE-based vulnerability existed at detection time.

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

## Network Access

trustdep is a network-based scanner — it must reach a small set of public
metadata APIs to do its job. Nothing else is contacted, no telemetry is sent,
and **package contents (tarballs) are never downloaded** — only metadata is
analysed.

| Endpoint | Purpose | Used by |
|---|---|---|
| `https://registry.npmjs.org` | Fetch the packument (versions, maintainers, `dist`, `time`, lifecycle scripts) for the package being analysed. | typosquat verification, supply-chain analyser, script auditor, phantom-dependency analyser |
| `https://api.npmjs.org/downloads` | Look up recent download counts to distinguish legitimate packages from typosquat candidates. | typosquat analyser |
| `https://api.osv.dev/v1/query` | Query the Open Source Vulnerability database for known CVEs / GHSAs / malicious package advisories. | OSV analyser |

All requests:

- are plain HTTPS `GET`/`POST` against the URLs listed above;
- carry a `User-Agent` of `trustdep/<version> (+https://github.com/ali-bingul/trustdep)`;
- have a hard timeout (15–30 s) and a single retry;
- send no authentication, no tokens, no user identifiers, and no telemetry.

Responses are cached locally in `~/.trustdep/cache.db` (SQLite). Use
`--no-cache` to bypass the cache for a fresh fetch.

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
