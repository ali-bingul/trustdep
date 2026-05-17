// filepath: src/output/json-reporter.ts
import type { PackageResult, ScanResult, Signal } from "../types.js";

export interface JsonReport {
  version: string;
  timestamp: string;
  summary: ScanResult["summary"] & { durationMs: number };
  packages: Array<{
    name: string;
    version: string;
    riskScore: number;
    riskLevel: string;
    fromCache: boolean;
    signals: Signal[];
    error?: string;
  }>;
}

export function toJsonReport(scan: ScanResult, version = "1.0.0"): JsonReport {
  return {
    version,
    timestamp: new Date().toISOString(),
    summary: { ...scan.summary, durationMs: scan.summary.duration },
    packages: scan.packages.map(p => ({
      name: p.name,
      version: p.version,
      riskScore: p.riskScore,
      riskLevel: p.riskLevel,
      fromCache: p.fromCache,
      signals: p.signals,
      ...(p.error ? { error: p.error } : {}),
    })),
  };
}

export function toJsonSingle(result: PackageResult, version = "1.0.0"): unknown {
  return {
    version,
    timestamp: new Date().toISOString(),
    package: {
      name: result.name,
      version: result.version,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      fromCache: result.fromCache,
      signals: result.signals,
      ...(result.error ? { error: result.error } : {}),
    },
  };
}

interface SarifResult {
  ruleId: string;
  level: "none" | "note" | "warning" | "error";
  message: { text: string };
  properties: { weight: number; package: string; version: string };
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: "none" | "note" | "warning" | "error" };
}

function levelToSarif(level: string): "none" | "note" | "warning" | "error" {
  switch (level) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "note";
    default:
      return "none";
  }
}

export function toSarif(scan: ScanResult, version = "1.0.0"): unknown {
  const rules = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const pkg of scan.packages) {
    for (const sig of pkg.signals) {
      if (!rules.has(sig.id)) {
        rules.set(sig.id, {
          id: sig.id,
          name: sig.id,
          shortDescription: { text: sig.title },
          defaultConfiguration: { level: levelToSarif(sig.level) },
        });
      }
      results.push({
        ruleId: sig.id,
        level: levelToSarif(sig.level),
        message: { text: `${pkg.name}@${pkg.version}: ${sig.description}` },
        properties: { weight: sig.weight, package: pkg.name, version: pkg.version },
      });
    }
  }

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "trustdep",
            version,
            informationUri: "https://github.com/ali-bingul/trustdep",
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}
