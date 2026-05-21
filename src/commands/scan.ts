// filepath: src/commands/scan.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { createSpinner } from "../output/spinner.js";
import { loadConfig } from "../config.js";
import { Cache } from "../cache/cache.js";
import { checkPackages } from "../core/check-package.js";
import { reportScan } from "../output/terminal-reporter.js";
import { toJsonReport, toSarif } from "../output/json-reporter.js";
import { levelAtLeast } from "../scorer/risk-scorer.js";
import type { PackageResult, RiskLevel, ScanResult } from "../types.js";

export interface ScanCmdOptions {
  json?: boolean;
  sarif?: boolean;
  failOn?: RiskLevel;
  cache?: boolean;
  verbose?: boolean;
  ignore?: string[];
  includePeers?: boolean;
  cwd?: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function findPackageJson(start: string): Promise<string> {
  const candidate = path.join(start, "package.json");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    throw new Error(`No package.json found in ${start}`);
  }
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function shouldIgnore(name: string, patterns: string[]): boolean {
  return patterns.some(p => globToRegExp(p).test(name));
}

function summarize(packages: PackageResult[], duration: number): ScanResult {
  const summary = {
    total: packages.length,
    clean: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    duration,
  };
  for (const p of packages) {
    summary[p.riskLevel] += 1;
  }
  return { packages, summary };
}

export async function scan(opts: ScanCmdOptions): Promise<void> {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const config = await loadConfig(cwd);
  const failOn = opts.failOn ?? config.failOn;
  const useCache = opts.cache !== false;
  const ignore = [...config.ignore, ...(opts.ignore ?? [])];

  const isMachineOutput = opts.json || opts.sarif;

  let pkgPath: string;
  try {
    pkgPath = await findPackageJson(cwd);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
    return;
  }

  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as PackageJson;

  const deps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...(opts.includePeers ? pkg.peerDependencies : {}),
  };

  const targets = Object.entries(deps)
    .filter(([name]) => !shouldIgnore(name, ignore))
    .map(([name, range]) => ({ name, version: cleanRange(range) }));

  if (targets.length === 0) {
    process.stdout.write("No dependencies to scan.\n");
    process.exit(0);
    return;
  }

  const cache = useCache ? new Cache(Cache.getDefaultPath()) : undefined;
  const spinner = isMachineOutput
    ? null
    : createSpinner(`Scanning ${targets.length} packages...`);

  const start = Date.now();
  const results = await checkPackages(
    targets,
    { config, cache, useCache },
    (done, total) => {
      if (spinner) spinner.text = `Scanning packages... [${done}/${total}]`;
    }
  );
  const duration = Date.now() - start;
  spinner?.stop();

  const scanResult = summarize(results, duration);

  if (opts.sarif) {
    process.stdout.write(JSON.stringify(toSarif(scanResult), null, 2) + "\n");
  } else if (opts.json) {
    process.stdout.write(JSON.stringify(toJsonReport(scanResult), null, 2) + "\n");
  } else {
    process.stdout.write(reportScan(scanResult, { verbose: opts.verbose, cwd }) + "\n");
  }

  cache?.close();
  const worst = worstLevel(results);
  const exitCode = worst && levelAtLeast(worst, failOn) ? 1 : 0;
  process.exit(exitCode);
}

function cleanRange(range: string): string | undefined {
  if (!range) return undefined;
  // strip leading ^ ~ >= etc — npm-client.resolveVersion will pick latest if not exact
  const cleaned = range.replace(/^[~^=<>]+/, "").trim();
  // git/url/file specs — leave as undefined to fetch latest packument
  if (/^(git|http|file|link|workspace)/i.test(cleaned)) return undefined;
  if (cleaned === "*" || cleaned === "" || cleaned === "latest") return undefined;
  return cleaned;
}

function worstLevel(results: PackageResult[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  const order: RiskLevel[] = ["clean", "low", "medium", "high", "critical"];
  for (const r of results) {
    if (!worst || order.indexOf(r.riskLevel) > order.indexOf(worst)) {
      worst = r.riskLevel;
    }
  }
  return worst;
}
