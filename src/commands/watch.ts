// filepath: src/commands/watch.ts
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import chalk from "chalk";
import { loadConfig } from "../config.js";
import { Cache } from "../cache/cache.js";
import { checkPackages } from "../core/check-package.js";
import { reportScan } from "../output/terminal-reporter.js";
import { toJsonReport } from "../output/json-reporter.js";
import { levelAtLeast } from "../scorer/risk-scorer.js";
import { parseLockFile } from "../lock/parse-lock.js";
import type { PackageResult, RiskLevel, ScanResult } from "../types.js";

export interface WatchCmdOptions {
  json?: boolean;
  failOn?: RiskLevel;
  cwd?: string;
}

const LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

async function findLockFile(cwd: string): Promise<string | null> {
  for (const name of LOCK_FILES) {
    const p = path.join(cwd, name);
    try {
      await fsp.access(p);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

function diffLocks(prev: Map<string, string>, curr: Map<string, string>): Array<{ name: string; version: string }> {
  const changed: Array<{ name: string; version: string }> = [];
  for (const [name, version] of curr) {
    if (prev.get(name) !== version) {
      changed.push({ name, version });
    }
  }
  return changed;
}

export async function watch(opts: WatchCmdOptions): Promise<void> {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const config = await loadConfig(cwd);
  const failOn = opts.failOn ?? config.failOn;
  const lockPath = await findLockFile(cwd);
  if (!lockPath) {
    process.stderr.write("No lock file found (package-lock.json, yarn.lock, pnpm-lock.yaml).\n");
    process.exit(2);
    return;
  }

  process.stdout.write(chalk.bold(`pkgsafe watch — ${path.basename(lockPath)}\n`));
  let previous = parseLockFile(lockPath, await fsp.readFile(lockPath, "utf8"));

  const cache = new Cache(Cache.getDefaultPath());
  let scanning = false;

  const trigger = async (): Promise<void> => {
    if (scanning) return;
    scanning = true;
    try {
      const content = await fsp.readFile(lockPath, "utf8");
      const current = parseLockFile(lockPath, content);
      const changed = diffLocks(previous, current);
      previous = current;

      if (changed.length === 0) return;
      process.stdout.write(chalk.gray(`\n[${new Date().toISOString()}] ${changed.length} packages changed\n`));

      const start = Date.now();
      const results = await checkPackages(changed, { config, cache, useCache: true });
      const duration = Date.now() - start;
      const scanResult = summarize(results, duration);

      if (opts.json) {
        process.stdout.write(JSON.stringify(toJsonReport(scanResult), null, 2) + "\n");
      } else {
        process.stdout.write(reportScan(scanResult, { cwd }) + "\n");
      }

      const worst = worstLevel(results);
      if (worst && levelAtLeast(worst, failOn)) {
        process.stdout.write(chalk.red.bold(`\n✗ Threshold '${failOn}' reached.\n`));
      }
    } finally {
      scanning = false;
    }
  };

  fs.watch(lockPath, { persistent: true }, () => {
    void trigger();
  });

  process.stdout.write(chalk.gray(`Watching ${lockPath} (Ctrl+C to stop)\n`));
}

function summarize(packages: PackageResult[], duration: number): ScanResult {
  const summary = { total: packages.length, clean: 0, low: 0, medium: 0, high: 0, critical: 0, duration };
  for (const p of packages) summary[p.riskLevel] += 1;
  return { packages, summary };
}

function worstLevel(results: PackageResult[]): RiskLevel | null {
  let worst: RiskLevel | null = null;
  const order: RiskLevel[] = ["clean", "low", "medium", "high", "critical"];
  for (const r of results) {
    if (!worst || order.indexOf(r.riskLevel) > order.indexOf(worst)) worst = r.riskLevel;
  }
  return worst;
}
