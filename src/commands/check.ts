// filepath: src/commands/check.ts
import ora from "ora";
import { loadConfig } from "../config.js";
import { Cache } from "../cache/cache.js";
import { checkPackages } from "../core/check-package.js";
import { reportScan, reportSingle } from "../output/terminal-reporter.js";
import { toJsonReport, toJsonSingle, toSarif } from "../output/json-reporter.js";
import { levelAtLeast } from "../scorer/risk-scorer.js";
import type { PackageResult, RiskLevel, ScanResult } from "../types.js";

export interface CheckCmdOptions {
  json?: boolean;
  sarif?: boolean;
  cache?: boolean;
  verbose?: boolean;
}

function parseSpec(spec: string): { name: string; version?: string } {
  if (spec.startsWith("@")) {
    const at = spec.indexOf("@", 1);
    if (at === -1) return { name: spec };
    return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  }
  const at = spec.indexOf("@");
  if (at === -1) return { name: spec };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
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

export async function check(specs: string[], opts: CheckCmdOptions): Promise<void> {
  if (!specs || specs.length === 0) {
    process.stderr.write("Error: at least one package name is required.\n");
    process.exit(2);
    return;
  }

  const config = await loadConfig();
  const useCache = opts.cache !== false;
  const cache = useCache ? new Cache(Cache.getDefaultPath()) : undefined;
  const targets = specs.map(parseSpec);

  const isMachineOutput = opts.json || opts.sarif;
  const spinner = isMachineOutput
    ? null
    : ora(`Checking ${targets.length} package${targets.length === 1 ? "" : "s"}...`).start();

  try {
    const start = Date.now();
    const results = await checkPackages(targets, { config, cache, useCache }, (done, total) => {
      if (spinner) spinner.text = `Checking packages... [${done}/${total}]`;
    });
    const duration = Date.now() - start;
    spinner?.stop();

    if (results.length === 1) {
      // Preserve original single-package output for back-compat.
      const result = results[0]!;
      if (opts.sarif) {
        process.stdout.write(JSON.stringify(toSarif(summarize(results, duration)), null, 2) + "\n");
      } else if (opts.json) {
        process.stdout.write(JSON.stringify(toJsonSingle(result), null, 2) + "\n");
      } else {
        process.stdout.write(reportSingle(result, { verbose: opts.verbose }) + "\n");
      }
    } else {
      const scanResult = summarize(results, duration);
      if (opts.sarif) {
        process.stdout.write(JSON.stringify(toSarif(scanResult), null, 2) + "\n");
      } else if (opts.json) {
        process.stdout.write(JSON.stringify(toJsonReport(scanResult), null, 2) + "\n");
      } else {
        process.stdout.write(reportScan(scanResult, { verbose: opts.verbose }) + "\n");
      }
    }

    const worst = worstLevel(results);
    const exitCode = worst && levelAtLeast(worst, config.failOn) ? 1 : 0;
    cache?.close();
    process.exit(exitCode);
  } catch (err) {
    spinner?.fail("Check failed");
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    cache?.close();
    process.exit(2);
  }
}
