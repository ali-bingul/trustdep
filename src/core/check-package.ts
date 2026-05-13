// filepath: src/core/check-package.ts
import pLimit from "p-limit";
import { Cache } from "../cache/cache.js";
import { NpmClient } from "../registry/npm-client.js";
import { analyseTyposquat, verifyTyposquatSignals } from "../analysers/typosquat.js";
import { fetchPointDownloads } from "../registry/downloads-api.js";
import { analyseSupplyChain, previousVersionOf } from "../analysers/supply-chain.js";
import { auditScripts } from "../analysers/script-auditor.js";
import { lookupOsv, osvSignals } from "../analysers/osv-lookup.js";
import { detectPhantomDependencies } from "../analysers/phantom-dependency.js";
import { calculateScore, scoreToLevel } from "../scorer/risk-scorer.js";
import { loadTopPackages } from "../data/top-packages.js";
import type { PackageResult, PkgsafeConfig, Signal } from "../types.js";
import { PackageNotFoundError } from "../types.js";

export interface CheckOptions {
  config: PkgsafeConfig;
  cache?: Cache | undefined;
  useCache?: boolean | undefined;
  client?: NpmClient | undefined;
}

export async function checkPackage(
  name: string,
  version: string | undefined,
  opts: CheckOptions
): Promise<PackageResult> {
  const useCache = opts.useCache ?? true;
  const client =
    opts.client ??
    new NpmClient({
      ...(opts.cache ? { cache: opts.cache } : {}),
      cacheTtlHours: opts.config.cacheTtlHours,
      useCache,
    });

  const top10k = await loadTopPackages();
  const checkedAt = Date.now();

  const signals: Signal[] = [];

  // 1. typosquat — pattern matching (sync, no network)
  const typoResult = analyseTyposquat(name, top10k);

  // 1b. Verify candidates against npm downloads to filter false positives.
  //     Cached per (candidate name) for 24h.
  const downloadsLookup = async (n: string): Promise<number> => {
    const key = `dl:${n}`;
    if (opts.cache && useCache) {
      const cached = opts.cache.get<number>(key);
      if (typeof cached === "number") return cached;
    }
    const dl = await fetchPointDownloads(n, "last-week");
    if (opts.cache && useCache) opts.cache.set(key, dl, opts.config.cacheTtlHours);
    return dl;
  };
  const verifiedTypo = await verifyTyposquatSignals(name, typoResult, downloadsLookup);
  signals.push(...verifiedTypo.signals);

  let resolvedVersion = version ?? "unknown";
  let fromCache = false;
  let error: string | undefined;

  try {
    const { packument, fromCache: pkgFromCache } = await client.fetchPackument(name);
    fromCache = pkgFromCache;
    resolvedVersion = client.resolveVersion(packument, version);
    const current = packument.versions[resolvedVersion];
    if (!current) {
      throw new Error(`Version ${resolvedVersion} not in packument`);
    }
    const previous = previousVersionOf(packument, resolvedVersion);

    // 2. supply-chain
    signals.push(...analyseSupplyChain(packument, current));

    // 3. script auditor
    const scriptResult = auditScripts(current, previous);
    signals.push(...scriptResult.signals);

    // 4. phantom deps
    signals.push(...detectPhantomDependencies(current, previous));

    // 5. OSV
    const vulns = await lookupOsv(name, resolvedVersion, opts.cache, useCache);
    signals.push(...osvSignals(vulns));
  } catch (err) {
    if (err instanceof PackageNotFoundError) {
      error = `Package not found in registry: ${name}`;
    } else if (err instanceof Error) {
      error = err.message;
    } else {
      error = String(err);
    }
  }

  const riskScore = calculateScore(signals);
  const riskLevel = scoreToLevel(riskScore);

  return {
    name,
    version: resolvedVersion,
    riskScore,
    riskLevel,
    signals,
    checkedAt,
    fromCache,
    ...(error ? { error } : {}),
  };
}

export async function checkPackages(
  packages: Array<{ name: string; version?: string | undefined }>,
  opts: CheckOptions,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<PackageResult[]> {
  const limit = pLimit(opts.config.concurrency);
  let done = 0;
  const total = packages.length;

  const results = await Promise.all(
    packages.map(p =>
      limit(async () => {
        const r = await checkPackage(p.name, p.version, opts);
        done++;
        onProgress?.(done, total, p.name);
        return r;
      })
    )
  );
  return results;
}
