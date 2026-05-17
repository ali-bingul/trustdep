// filepath: src/output/terminal-reporter.ts
import chalk from "chalk";
import type { PackageResult, RiskLevel, ScanResult, Signal } from "../types.js";

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
    lines.push(`    ${branch} ${signalLevelTag(s.level)} ${s.title}`);
    lines.push(`    ${cont}             ${chalk.gray(s.description)}`);
    if (s.evidence) {
      const evidence = s.evidence.split("\n").slice(0, 3).join(" ");
      const truncated = evidence.length > 120 ? evidence.slice(0, 117) + "..." : evidence;
      lines.push(`    ${cont}             ${chalk.gray("Evidence: " + truncated)}`);
    }
  });
  return lines.join("\n");
}

export interface TerminalReportOptions {
  verbose?: boolean | undefined;
  version?: string | undefined;
  cwd?: string | undefined;
}

export function reportSingle(result: PackageResult, opts: TerminalReportOptions = {}): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`trustdep v${opts.version ?? "1.0.0"} — npm supply chain scanner`));
  if (result.signals.length > 0) {
    lines.push(formatSignalTree(result.signals));
  } else if (opts.verbose) {
    lines.push(chalk.gray("    (no signals)"));
  }
  lines.push("");
  lines.push(divider());
  lines.push(`  ${verdict(result.riskLevel)}`);
  lines.push(divider());
  return lines.join("\n");
}

export function reportScan(scan: ScanResult, opts: TerminalReportOptions = {}): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`trustdep v${opts.version ?? "1.0.0"} — npm supply chain scanner`));
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
