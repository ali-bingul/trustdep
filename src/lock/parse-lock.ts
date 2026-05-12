// filepath: src/lock/parse-lock.ts
/**
 * Parses npm/yarn/pnpm lock files into a flat Map<name, version>.
 *
 * Supported formats:
 *  - package-lock.json v1 (recursive `dependencies` tree, npm 5.x/6.x)
 *  - package-lock.json v2 (`packages` flat + legacy `dependencies`, npm 7+)
 *  - package-lock.json v3 (`packages` flat only, npm 7+)
 *  - npm-shrinkwrap.json (same shape as package-lock.json)
 *  - yarn.lock (Yarn 1 classic text format)
 *  - pnpm-lock.yaml (lightweight regex parser — full YAML not required)
 */
import path from "node:path";

export type LockMap = Map<string, string>;

interface NpmLockV1Entry {
  version?: string;
  dependencies?: Record<string, NpmLockV1Entry>;
}

interface NpmLockJson {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string; name?: string }>;
  dependencies?: Record<string, NpmLockV1Entry>;
}

/**
 * Parse a lock file's content into a flat dependency map.
 * Returns an empty map if the format cannot be recognised.
 */
export function parseLockFile(filePath: string, content: string): LockMap {
  const base = path.basename(filePath).toLowerCase();
  if (base === "package-lock.json" || base === "npm-shrinkwrap.json") {
    return parseNpmLock(content);
  }
  if (base === "yarn.lock") {
    return parseYarnLock(content);
  }
  if (base === "pnpm-lock.yaml") {
    return parsePnpmLock(content);
  }
  return new Map();
}

/**
 * Parses package-lock.json v1, v2, and v3.
 * v2/v3 use `packages` keyed by node_modules path (root key is "").
 * v1 uses `dependencies` recursively.
 * For v2 we prefer `packages`; if missing/empty we fall back to `dependencies`.
 */
export function parseNpmLock(content: string): LockMap {
  const map: LockMap = new Map();
  let json: NpmLockJson;
  try {
    json = JSON.parse(content) as NpmLockJson;
  } catch {
    return map;
  }

  if (json.packages && Object.keys(json.packages).length > 0) {
    for (const [key, entry] of Object.entries(json.packages)) {
      if (!key) continue; // root project entry
      // Key shapes:
      //   "node_modules/foo"
      //   "node_modules/@scope/bar"
      //   "node_modules/foo/node_modules/bar"  (nested -> use innermost)
      //   "workspaces/sub/node_modules/foo"     (workspace nested)
      const idx = key.lastIndexOf("node_modules/");
      if (idx === -1) continue;
      const name = key.slice(idx + "node_modules/".length);
      if (!name || !entry?.version) continue;
      // Last writer wins; topmost copy is processed first in flat lock so deepest overrides.
      // For typosquat scanning we just need the name; version is informational.
      map.set(name, entry.version);
    }
    if (map.size > 0) return map;
  }

  if (json.dependencies) {
    walkV1(json.dependencies, map);
  }
  return map;
}

function walkV1(deps: Record<string, NpmLockV1Entry>, out: LockMap): void {
  for (const [name, entry] of Object.entries(deps)) {
    if (entry?.version) out.set(name, entry.version);
    if (entry?.dependencies) walkV1(entry.dependencies, out);
  }
}

/**
 * Parses Yarn 1 classic lock files.
 * Format:
 *   "@scope/name@^1.0.0", "name@^2.0.0":
 *     version "1.2.3"
 *     resolved "..."
 *
 * Yarn Berry (v2+) lockfiles look superficially similar at top level so this
 * handles both for our limited purpose (extracting `name -> version`).
 */
export function parseYarnLock(content: string): LockMap {
  const map: LockMap = new Map();
  // Strip BOM and normalise line endings.
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  // Block boundaries: a line starting at column 0 that ends with ":" (and is not a comment).
  const blocks = text.split(/\n(?=\S.*:\s*$)/m);
  for (const block of blocks) {
    const headerMatch = block.match(/^(.+):\s*\n/);
    if (!headerMatch) continue;
    const header = headerMatch[1]!.trim();
    if (header.startsWith("#") || header === "__metadata") continue;
    const versionMatch = block.match(/\n\s+version[: ]+"?([^"\n]+)"?/);
    if (!versionMatch) continue;
    const version = versionMatch[1]!.trim();
    // Header is one or more comma-separated specifiers, each like
    //   "name@range" or '"@scope/name@range"'.
    const specs = header.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    for (const spec of specs) {
      const name = extractYarnName(spec);
      if (name) map.set(name, version);
    }
  }
  return map;
}

function extractYarnName(spec: string): string | null {
  // Handles "@scope/name@range" and "name@range".
  // Yarn Berry may include "npm:" / "patch:" / "workspace:" protocols which we strip.
  let s = spec;
  // Strip protocol prefix in the range portion (after the last @).
  if (s.startsWith("@")) {
    const at = s.indexOf("@", 1);
    if (at === -1) return s;
    return s.slice(0, at);
  }
  const at = s.indexOf("@");
  if (at === -1) return s || null;
  return s.slice(0, at) || null;
}

/**
 * Parses pnpm-lock.yaml without a full YAML dependency.
 * Looks for entries under top-level `packages:` of the form:
 *   /lodash/4.17.21:
 *   /@scope/name/1.2.3:
 *   /name@1.2.3:        (newer pnpm)
 *   /@scope/name@1.2.3: (newer pnpm)
 */
export function parsePnpmLock(content: string): LockMap {
  const map: LockMap = new Map();
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let inPackages = false;
  for (const raw of lines) {
    if (/^packages:\s*$/.test(raw)) { inPackages = true; continue; }
    if (inPackages && /^\S/.test(raw) && !/^\s/.test(raw) && raw.trim() !== "") {
      // left top-level section
      if (!/^packages:/.test(raw)) inPackages = false;
    }
    if (!inPackages) continue;
    const m = raw.match(/^\s{2}'?\/(.+?)'?:\s*$/);
    if (!m) continue;
    const key = m[1]!;
    const parsed = parsePnpmKey(key);
    if (parsed) map.set(parsed.name, parsed.version);
  }
  return map;
}

function parsePnpmKey(key: string): { name: string; version: string } | null {
  // Strip peer-deps suffix: "(react@18.0.0)" or "_react@18.0.0"
  let k = key.replace(/\(.+?\)$/, "").replace(/_.+$/, "");
  // Newer pnpm: name@version
  const atIdx = k.lastIndexOf("@");
  if (atIdx > 0 && /^\d/.test(k.slice(atIdx + 1))) {
    return { name: k.slice(0, atIdx), version: k.slice(atIdx + 1) };
  }
  // Older pnpm: /name/version  -> we already stripped leading /
  const lastSlash = k.lastIndexOf("/");
  if (lastSlash > 0) {
    const version = k.slice(lastSlash + 1);
    const name = k.slice(0, lastSlash);
    if (/^\d/.test(version)) return { name, version };
  }
  return null;
}
