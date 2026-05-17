# Security Policy

## Supported versions

The latest minor release of `trustdep` receives security fixes.

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |
| < 1.0   | ❌        |

## Reporting a vulnerability

`trustdep` is itself a security tool — we take vulnerability reports seriously.

**Please do not open a public GitHub issue.**

Instead:

1. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository, or
2. Email the maintainers directly (see `package.json` for contact).

Include:

- A description of the issue and its impact.
- Steps to reproduce (proof of concept welcome).
- Your assessment of severity (CVSS optional).
- Whether you'd like public credit in the advisory.

## Response timeline

- **Acknowledgement**: within 3 business days.
- **Triage + initial assessment**: within 7 days.
- **Patch release**: target 30 days for high/critical severity.

## Disclosure policy

We follow coordinated disclosure. After a fix is released, we publish a GitHub Security Advisory and request a CVE if applicable. Reporters are credited unless they request otherwise.

## Out of scope

- Reports against false-positive or false-negative detection results — please open a normal issue with a reproduction.
- Vulnerabilities in third-party packages that trustdep analyses (those should be reported to OSV / the upstream maintainer).
