// filepath: src/analysers/typosquat.ts
import type { Signal } from "../types.js";
import { fetchPointDownloads } from "../registry/downloads-api.js";

/**
 * Minimum weekly downloads for a package to be considered a "popular" typosquat
 * target. Packages below this threshold are too obscure to be worth attacking,
 * and matching against them produces false positives.
 */
export const POPULARITY_THRESHOLD = 10_000;

/**
 * Minimum length of the unscoped package name to apply distance-based typosquat
 * matching. Very short names (`cli`, `core`, `ui`, `api`, `js`) produce
 * excessive false positives because random scope-suffixes like `@nestjs/core`
 * land within edit distance of every short word in the top list.
 */
const MIN_NAME_LENGTH_FOR_DISTANCE = 5;

/**
 * Verified, well-known organisation scopes published by trusted maintainers.
 * Any package under one of these scopes is exempted from typosquat heuristics
 * because the scope itself acts as a strong authenticity signal.
 */
const TRUSTED_SCOPES: ReadonlySet<string> = new Set([
  "@nestjs", "@babel", "@types", "@angular", "@aws-sdk", "@aws-crypto",
  "@vue", "@nuxt", "@vitejs", "@mui", "@emotion", "@reduxjs", "@apollo",
  "@graphql-tools", "@testing-library", "@tanstack", "@radix-ui",
  "@swc", "@rollup", "@parcel", "@playwright", "@cypress",
  "@prisma", "@trpc", "@solidjs", "@hapi", "@nestjs-modules",
  "@octokit", "@sentry", "@stripe", "@firebase", "@google-cloud",
  "@azure", "@microsoft", "@aws-amplify", "@auth0",
  "@typescript-eslint", "@eslint", "@stylistic", "@unhead",
  "@storybook", "@chakra-ui", "@headlessui", "@heroicons",
  "@floating-ui", "@dnd-kit", "@tabler", "@mantine",
  "@nestjs/microservices", "@nestjs/platform-express",
  "@modelcontextprotocol", "@anthropic-ai", "@openai",
]);

const HOMOGLYPHS: Record<string, string> = {
  "0": "o",
  "1": "l",
  "5": "s",
  "6": "b",
  rn: "m",
  vv: "w",
  cl: "d",
  "\u03B5": "e",
  "\u0131": "i",
  "\u00F6": "o",
  "\u00E9": "e",
  "\u00E8": "e",
  "\u00E0": "a",
  "\u00E1": "a",
  "\u00FC": "u",
};

const SUSPICIOUS_AFFIXES = [
  "-official",
  "-security",
  "-safe",
  "-stable",
  "-fix",
  "-update",
  "-plus",
  "-pro",
  "-helper",
  "-utils",
  "-js",
  "-lib",
  "official-",
  "safe-",
  "secure-",
  "real-",
];

/**
 * Standard Levenshtein distance.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]!;
  }
  return prev[n]!;
}

/**
 * Damerau-Levenshtein distance (handles transpositions as a single operation).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = val;
    }
  }
  return d[m]![n]!;
}

/**
 * Normalize visually similar characters to canonical form.
 */
export function normalizeHomoglyphs(input: string): string {
  let out = input.toLowerCase();
  // Multi-character substitutions first
  const multi = Object.keys(HOMOGLYPHS).filter(k => k.length > 1);
  for (const key of multi) {
    out = out.split(key).join(HOMOGLYPHS[key]!);
  }
  let result = "";
  for (const ch of out) {
    result += HOMOGLYPHS[ch] ?? ch;
  }
  return result;
}

function stripScope(name: string): string {
  return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
}

export function isCombosquat(pkg: string, topPackages: string[]): { match: string; affix: string } | null {
  const lower = pkg.toLowerCase();
  const set = new Set(topPackages);
  for (const affix of SUSPICIOUS_AFFIXES) {
    if (affix.endsWith("-") && lower.startsWith(affix)) {
      const base = lower.slice(affix.length);
      if (set.has(base)) return { match: base, affix };
    }
    if (affix.startsWith("-") && lower.endsWith(affix)) {
      const base = lower.slice(0, -affix.length);
      if (set.has(base)) return { match: base, affix };
    }
  }
  return null;
}

function splitWords(name: string): string[] {
  return name.split(/[-_.]/g).filter(Boolean);
}

export function isWordOrderSwap(pkg: string, topPackages: string[]): string | null {
  const words = splitWords(pkg.toLowerCase());
  if (words.length < 2 || words.length > 4) return null;
  const reversed = [...words].reverse().join("-");
  const set = new Set(topPackages);
  if (set.has(reversed) && reversed !== pkg.toLowerCase()) return reversed;
  return null;
}

export function isDelimiterSwap(pkg: string, topPackages: string[]): string | null {
  const lower = pkg.toLowerCase();
  const condensed = lower.replace(/[-_.]/g, "");
  for (const top of topPackages) {
    if (top === lower) return null;
    if (top.replace(/[-_.]/g, "") === condensed) return top;
  }
  return null;
}

export function isPluralVariant(pkg: string, topPackages: string[]): string | null {
  const lower = pkg.toLowerCase();
  const set = new Set(topPackages);
  if (lower.endsWith("s") && set.has(lower.slice(0, -1))) return lower.slice(0, -1);
  if (set.has(`${lower}s`)) return `${lower}s`;
  if (lower.endsWith("js") && set.has(lower.slice(0, -2))) return lower.slice(0, -2);
  if (set.has(`${lower}js`)) return `${lower}js`;
  return null;
}

export interface TyposquatCandidate {
  name: string;
  distance: number;
  algorithm: string;
}

export interface TyposquatResult {
  isTyposquat: boolean;
  candidates: TyposquatCandidate[];
  normalizedName: string;
  signals: Signal[];
}

export function analyseTyposquat(packageName: string, top10k: string[]): TyposquatResult {
  const result: TyposquatResult = {
    isTyposquat: false,
    candidates: [],
    normalizedName: normalizeHomoglyphs(stripScope(packageName)),
    signals: [],
  };

  // Trusted scopes are exempt from all typosquat heuristics.
  if (packageName.startsWith("@")) {
    const scope = packageName.split("/")[0] ?? "";
    if (TRUSTED_SCOPES.has(scope)) {
      return result;
    }
  }

  const target = stripScope(packageName).toLowerCase();
  if (top10k.includes(target)) {
    return result; // exact match — this IS the popular package
  }

  // 1. Damerau-Levenshtein scan — skip for very short names to avoid noise.
  if (target.length >= MIN_NAME_LENGTH_FOR_DISTANCE) {
    for (const top of top10k) {
      if (top.length < MIN_NAME_LENGTH_FOR_DISTANCE) continue;
      if (Math.abs(top.length - target.length) > 2) continue;
      const dist = damerauLevenshtein(target, top);
      if (dist > 0 && dist <= 2) {
        result.candidates.push({ name: top, distance: dist, algorithm: "damerau-levenshtein" });
      }
    }
  }

  // 2. Homoglyph
  const normalized = result.normalizedName;
  if (normalized !== target && top10k.includes(normalized)) {
    result.candidates.push({ name: normalized, distance: 0, algorithm: "homoglyph" });
  }

  // 3. Combosquat
  const combo = isCombosquat(target, top10k);
  if (combo) {
    result.candidates.push({ name: combo.match, distance: 0, algorithm: `combosquat:${combo.affix}` });
  }

  // 4. Word order
  const wos = isWordOrderSwap(target, top10k);
  if (wos) {
    result.candidates.push({ name: wos, distance: 0, algorithm: "word-order" });
  }

  // 5. Delimiter swap
  const ds = isDelimiterSwap(target, top10k);
  if (ds) {
    result.candidates.push({ name: ds, distance: 0, algorithm: "delimiter-swap" });
  }

  // 6. Plural / singular
  const pl = isPluralVariant(target, top10k);
  if (pl) {
    result.candidates.push({ name: pl, distance: 0, algorithm: "plural" });
  }

  // dedupe by name keeping smallest distance
  const seen = new Map<string, TyposquatCandidate>();
  for (const c of result.candidates) {
    const existing = seen.get(c.name);
    if (!existing || c.distance < existing.distance) {
      seen.set(c.name, c);
    }
  }
  result.candidates = [...seen.values()].sort((a, b) => a.distance - b.distance).slice(0, 5);
  result.isTyposquat = result.candidates.length > 0;

  // Build signals
  for (const cand of result.candidates) {
    if (cand.algorithm === "damerau-levenshtein" && cand.distance === 1) {
      result.signals.push({
        id: "typosquat_distance_1",
        title: "Possible typosquat (distance 1)",
        description: `'${packageName}' is 1 edit away from popular package '${cand.name}'`,
        weight: 25,
        level: "high",
        evidence: `damerau-levenshtein distance = 1 vs ${cand.name}`,
      });
    } else if (cand.algorithm === "damerau-levenshtein" && cand.distance === 2) {
      result.signals.push({
        id: "typosquat_distance_2",
        title: "Possible typosquat (distance 2)",
        description: `'${packageName}' is 2 edits away from popular package '${cand.name}'`,
        weight: 15,
        level: "medium",
        evidence: `damerau-levenshtein distance = 2 vs ${cand.name}`,
      });
    } else if (cand.algorithm === "homoglyph") {
      result.signals.push({
        id: "typosquat_homoglyph",
        title: "Homoglyph typosquat",
        description: `'${packageName}' normalizes to popular package '${cand.name}'`,
        weight: 20,
        level: "high",
        evidence: `normalized form: ${result.normalizedName}`,
      });
    } else if (cand.algorithm.startsWith("combosquat")) {
      result.signals.push({
        id: "typosquat_combosquat",
        title: "Combosquat (suspicious affix)",
        description: `'${packageName}' uses suspicious affix on popular package '${cand.name}'`,
        weight: 10,
        level: "medium",
        evidence: cand.algorithm,
      });
    } else if (cand.algorithm === "word-order") {
      result.signals.push({
        id: "typosquat_combosquat",
        title: "Word order swap",
        description: `'${packageName}' is a word-order swap of '${cand.name}'`,
        weight: 10,
        level: "medium",
      });
    } else if (cand.algorithm === "delimiter-swap") {
      result.signals.push({
        id: "typosquat_combosquat",
        title: "Delimiter swap",
        description: `'${packageName}' differs only by delimiters from '${cand.name}'`,
        weight: 10,
        level: "medium",
      });
    } else if (cand.algorithm === "plural") {
      result.signals.push({
        id: "typosquat_distance_1",
        title: "Plural/singular variant",
        description: `'${packageName}' is plural/singular variant of '${cand.name}'`,
        weight: 25,
        level: "high",
      });
    }
  }

  return result;
}

/**
 * Verifies typosquat candidates by checking weekly downloads of the
 * suspected target package. Filters out signals where the matched
 * "popular" package isn't actually popular (false positives).
 *
 * Returns a new TyposquatResult with verified signals and candidates.
 *
 * Network: 1 downloads-API call per unique candidate name.
 *          Caches the result per name within a single check.
 */
export async function verifyTyposquatSignals(
  packageName: string,
  result: TyposquatResult,
  downloadsLookup?: (name: string) => Promise<number>
): Promise<TyposquatResult> {
  if (result.candidates.length === 0) return result;

  const lookup = downloadsLookup ?? ((name: string) => fetchPointDownloads(name, "last-week"));
  const downloads = new Map<string, number>();
  const uniqueNames = [...new Set(result.candidates.map(c => c.name))];

  await Promise.all(
    uniqueNames.map(async name => {
      try {
        downloads.set(name, await lookup(name));
      } catch {
        downloads.set(name, 0);
      }
    })
  );

  const verifiedCandidates = result.candidates.filter(
    c => (downloads.get(c.name) ?? 0) >= POPULARITY_THRESHOLD
  );

  if (verifiedCandidates.length === 0) {
    return {
      isTyposquat: false,
      candidates: [],
      normalizedName: result.normalizedName,
      signals: [],
    };
  }

  const verified: TyposquatResult = {
    isTyposquat: true,
    candidates: verifiedCandidates,
    normalizedName: result.normalizedName,
    signals: [],
  };

  // Filter signals to those whose evidence references a verified candidate name.
  // Add download count to evidence for transparency.
  const verifiedNames = new Set(verifiedCandidates.map(c => c.name));
  for (const sig of result.signals) {
    const referenced = verifiedCandidates.find(c => sig.description.includes(`'${c.name}'`));
    if (!referenced && !verifiedNames.has(result.normalizedName)) continue;
    const targetName = referenced?.name ?? result.normalizedName;
    const dl = downloads.get(targetName) ?? 0;
    const dlText = formatDownloads(dl);
    const evidence = sig.evidence ? `${sig.evidence} | ${targetName}: ${dlText}/week` : `${targetName}: ${dlText}/week`;
    verified.signals.push({ ...sig, evidence });
  }

  return verified;
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
