// filepath: src/output/terminal-reporter.ts
import chalk from "chalk";
import type { PackageResult, RiskLevel, ScanResult, Signal } from "../types.js";
import { VERSION } from "../version.js";

function levelIcon(level: RiskLevel): string {
  switch (level) {
    case "clean":
      return chalk.green("✓");
    case "low":
      return chalk.yellow("⚠");
    case "medium":
      return chalk.yellow("⚠");
    case "high":
      return chalk.red("✗");
    case "critical":
      return chalk.red.bold("✗");
  }
}

function levelLabel(level: RiskLevel): string {
  switch (level) {
    case "clean":
      return chalk.green("clean");
    case "low":
      return chalk.yellow("low");
    case "medium":
      return chalk.yellow("medium");
    case "high":
      return chalk.red("high");
    case "critical":
      return chalk.red.bold("critical");
  }
}

function signalLevelTag(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return chalk.red.bold("[CRITICAL]");
    case "high":
      return chalk.red("[HIGH]");
    case "medium":
      return chalk.yellow("[MEDIUM]");
    case "low":
      return chalk.yellow("[LOW]");
    case "clean":
      return chalk.green("[CLEAN]");
  }
}

function formatPackageLine(result: PackageResult): string {
  const icon = levelIcon(result.riskLevel);
  const label = `${result.name}@${result.version}`;
  const levelStr = levelLabel(result.riskLevel);
  const score = chalk.gray(`(${result.riskScore})`);
  return `  ${icon} ${label.padEnd(32)} ${levelStr.padEnd(18)} ${score}`;
}

function formatSignalTree(signals: Signal[]): string {
  if (signals.length === 0) return "";
  const lines: string[] = [];
  signals.forEach((s, i) => {
    const isLast = i === signals.length - 1;
    const branch = isLast ? chalk.gray("└─") : chalk.gray("├─");
    const cont = isLast ? "  " : chalk.gray("│ ");
    const indent = `    ${cont}   `;

    // Header: [LEVEL] <advisory id> [— CVE-xxx, CVE-yyy]
    lines.push(`    ${branch} ${signalLevelTag(s.level)} ${formatSignalHeader(s)}`);

    // Summary description (wrapped), coloured by severity so critical findings
    // stay visually loud while low/medium ones recede.
    const descColor = levelTextColor(s.level);
    for (const line of wrap(s.description, 84)) {
      lines.push(`${indent}${descColor(line)}`);
    }

    // Severity / fix info — built from structured meta when present, else fall
    // back to the legacy evidence string.
    const meta = s.meta;
    if (meta?.cvssScore !== undefined && meta.cvssSeverity) {
      lines.push(
        `${indent}${chalk.gray("Severity: ")}${chalk.bold(
          `CVSS ${meta.cvssScore.toFixed(1)} (${meta.cvssSeverity})`
        )}`
      );
    } else if (s.evidence) {
      const truncated = s.evidence.length > 100 ? s.evidence.slice(0, 97) + "..." : s.evidence;
      lines.push(`${indent}${chalk.gray("Severity: ")}${chalk.gray(truncated)}`);
    }

    if (meta?.fixedVersion) {
      lines.push(`${indent}${chalk.gray("Fix: ")}${chalk.green(`upgrade to ${meta.fixedVersion}`)}`);
    }
    if (meta?.url) {
      lines.push(`${indent}${chalk.gray("More: ")}${chalk.cyan(meta.url)}`);
    }
  });
  return lines.join("\n");
}

function formatSignalHeader(s: Signal): string {
  const color = levelTextColor(s.level);
  const meta = s.meta;
  if (meta?.advisoryId) {
    const ids: string[] = [chalk.bold(color(meta.advisoryId))];
    if (meta.cveIds && meta.cveIds.length > 0) {
      ids.push(chalk.bold(color(meta.cveIds.join(", "))));
    }
    const isMalicious = s.id === "osv_malicious";
    const label = color(isMalicious ? "Malicious package" : "Known vulnerability");
    return `${label} ${chalk.gray("(")}${ids.join(chalk.gray(" · "))}${chalk.gray(")")}`;
  }
  return color(s.title);
}

function levelTextColor(level: RiskLevel): (s: string) => string {
  switch (level) {
    case "critical":
      return (s: string) => chalk.red.bold(s);
    case "high":
      return (s: string) => chalk.red(s);
    case "medium":
    case "low":
      return (s: string) => chalk.yellow(s);
    case "clean":
      return (s: string) => chalk.green(s);
  }
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= width) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function collectRecommendations(packages: PackageResult[]): string[] {
  // Map of pkg name → upgrade target version (the highest "fixed" we saw).
  const upgrades = new Map<string, string>();
  const malicious = new Set<string>();
  const reviewNoFix = new Set<string>();

  for (const pkg of packages) {
    for (const sig of pkg.signals) {
      if (sig.id === "osv_malicious") {
        malicious.add(`${pkg.name}@${pkg.version}`);
        continue;
      }
      if (sig.id !== "osv_vulnerability") continue;
      const fixed = sig.meta?.fixedVersion;
      if (fixed) {
        const existing = upgrades.get(pkg.name);
        if (!existing || compareVersions(fixed, existing) > 0) {
          upgrades.set(pkg.name, fixed);
        }
      } else {
        reviewNoFix.add(`${pkg.name}@${pkg.version}`);
      }
    }
  }

  const recs: string[] = [];
  for (const id of malicious) {
    recs.push(`Remove ${chalk.bold(id)} immediately — package is flagged as malicious.`);
  }
  for (const [name, version] of upgrades) {
    recs.push(`Upgrade ${chalk.bold(name)} to ${chalk.green(`>=${version}`)} to clear advisories.`);
  }
  for (const id of reviewNoFix) {
    if (upgrades.has(id.split("@")[0]!)) continue;
    recs.push(
      `Review ${chalk.bold(id)} — vulnerability has no published fix yet; consider a workaround or alternative.`
    );
  }
  return recs;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(n => parseInt(n, 10) || 0);
  const pb = b.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function formatRecommendationsBlock(packages: PackageResult[]): string {
  const recs = collectRecommendations(packages);
  if (recs.length === 0) return "";
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.bold("  Recommended actions:"));
  recs.forEach(r => lines.push(`    ${chalk.yellow("→")} ${r}`));
  return lines.join("\n");
}

export interface TerminalReportOptions {
  verbose?: boolean | undefined;
  version?: string | undefined;
  cwd?: string | undefined;
}

export function reportSingle(result: PackageResult, opts: TerminalReportOptions = {}): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`trustdep v${opts.version ?? VERSION} — npm supply chain scanner`));
  lines.push(`  ${chalk.gray("package:")} ${chalk.bold(`${result.name}@${result.version}`)}`);
  lines.push("");
  if (result.signals.length > 0) {
    lines.push(formatSignalTree(result.signals));
  } else if (opts.verbose) {
    lines.push(chalk.gray("    (no signals)"));
  }
  const recBlock = formatRecommendationsBlock([result]);
  if (recBlock) lines.push(recBlock);
  lines.push("");
  lines.push(divider());
  lines.push(`  ${verdict(result.riskLevel)}`);
  lines.push(divider());
  return lines.join("\n");
}

export function reportScan(scan: ScanResult, opts: TerminalReportOptions = {}): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`trustdep v${opts.version ?? VERSION} — npm supply chain scanner`));
  lines.push("");
  if (opts.cwd) {
    lines.push(`Scanned ${scan.packages.length} packages in ${opts.cwd}`);
  }
  lines.push("");

  for (const pkg of scan.packages) {
    if (!opts.verbose && pkg.riskLevel === "clean") {
      lines.push(formatPackageLine(pkg));
      continue;
    }
    lines.push(formatPackageLine(pkg));
    if (pkg.signals.length > 0) {
      lines.push(formatSignalTree(pkg.signals));
    }
    if (pkg.error) {
      lines.push(chalk.red(`    ! error: ${pkg.error}`));
    }
  }

  lines.push("");
  lines.push(divider());
  const s = scan.summary;
  const seconds = (s.duration / 1000).toFixed(1);
  lines.push(`  ${s.total} packages scanned in ${seconds}s`);
  lines.push(
    `  ${chalk.green(s.clean + " clean")}   ` +
      `${chalk.yellow(s.low + " low")}   ` +
      `${chalk.yellow(s.medium + " medium")}   ` +
      `${chalk.red(s.high + " high")}   ` +
      `${chalk.red.bold(s.critical + " critical")}`
  );
  const recBlock = formatRecommendationsBlock(scan.packages);
  if (recBlock) lines.push(recBlock);

  lines.push("");
  lines.push("  " + summaryVerdict(scan));
  lines.push(divider());
  return lines.join("\n");
}

function divider(): string {
  return chalk.gray("─".repeat(60));
}

function verdict(level: RiskLevel): string {
  switch (level) {
    case "clean":
    case "low":
      return chalk.green("✓ trustdep found no significant issues.");
    case "medium":
      return chalk.yellow("⚠ trustdep found medium-risk signals. Review recommended.");
    case "high":
      return chalk.red("✗ trustdep found high-risk signals. Investigate before installing.");
    case "critical":
      return chalk.red.bold("✗ trustdep found critical issues. Do not install.");
  }
}

function summaryVerdict(scan: ScanResult): string {
  if (scan.summary.critical > 0) {
    return chalk.red.bold("✗ trustdep found critical issues. Fix before proceeding.");
  }
  if (scan.summary.high > 0) {
    return chalk.red("✗ trustdep found high-risk packages.");
  }
  if (scan.summary.medium > 0) {
    return chalk.yellow("⚠ trustdep found medium-risk packages. Review recommended.");
  }
  if (scan.summary.low > 0) {
    return chalk.yellow("⚠ trustdep found low-risk informational signals.");
  }
  return chalk.green("✓ All packages clean.");
}
