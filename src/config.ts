// filepath: src/config.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PkgsafeConfig, RiskLevel } from "./types.js";

const VALID_LEVELS: RiskLevel[] = ["clean", "low", "medium", "high", "critical"];

export const DEFAULT_CONFIG: PkgsafeConfig = {
  failOn: "high",
  ignore: [],
  threshold: 60,
  cacheTtlHours: 24,
  concurrency: 5,
};

const CONFIG_FILES = ["pkgsafe.config.json", "pkgsafe.config.js", "pkgsafe.config.mjs"];

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findConfigFile(cwd: string): Promise<{ file: string; type: "json" | "js" } | null> {
  let dir = cwd;
  while (true) {
    for (const name of CONFIG_FILES) {
      const candidate = path.join(dir, name);
      if (await fileExists(candidate)) {
        return { file: candidate, type: name.endsWith(".json") ? "json" : "js" };
      }
    }
    const pkgPath = path.join(dir, "package.json");
    if (await fileExists(pkgPath)) {
      try {
        const raw = JSON.parse(await fs.readFile(pkgPath, "utf8")) as Record<string, unknown>;
        if (raw && typeof raw === "object" && "pkgsafe" in raw) {
          return { file: pkgPath, type: "json" };
        }
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function validateConfig(raw: unknown): PkgsafeConfig {
  const cfg: PkgsafeConfig = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== "object") return cfg;
  const r = raw as Record<string, unknown>;

  if (typeof r.failOn === "string" && VALID_LEVELS.includes(r.failOn as RiskLevel)) {
    cfg.failOn = r.failOn as RiskLevel;
  }
  if (Array.isArray(r.ignore)) {
    cfg.ignore = r.ignore.filter((x): x is string => typeof x === "string");
  }
  if (typeof r.threshold === "number" && r.threshold >= 0 && r.threshold <= 100) {
    cfg.threshold = r.threshold;
  }
  if (typeof r.cacheTtlHours === "number" && r.cacheTtlHours >= 0) {
    cfg.cacheTtlHours = r.cacheTtlHours;
  }
  if (typeof r.concurrency === "number" && r.concurrency > 0) {
    cfg.concurrency = Math.floor(r.concurrency);
  }
  return cfg;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<PkgsafeConfig> {
  const found = await findConfigFile(cwd);
  if (!found) return { ...DEFAULT_CONFIG };

  try {
    if (found.file.endsWith("package.json")) {
      const raw = JSON.parse(await fs.readFile(found.file, "utf8")) as Record<string, unknown>;
      return validateConfig(raw.pkgsafe);
    }
    if (found.type === "json") {
      const raw = JSON.parse(await fs.readFile(found.file, "utf8")) as unknown;
      return validateConfig(raw);
    }
    const mod = (await import(pathToFileURL(found.file).href)) as { default?: unknown };
    return validateConfig(mod.default ?? mod);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
