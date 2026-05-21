// filepath: src/analysers/osv-lookup.ts
import { httpJson } from "../registry/http.js";
import type { Cache } from "../cache/cache.js";
import type { OsvVulnerability, Signal } from "../types.js";

const OSV_URL = "https://api.osv.dev/v1/query";
const USER_AGENT = "trustdep/1.0.0";

export async function lookupOsv(
  name: string,
  version: string,
  cache?: Cache,
  useCache = true
): Promise<OsvVulnerability[]> {
  const key = `osv:${name}@${version}`;
  if (cache && useCache) {
    const cached = cache.get<OsvVulnerability[]>(key);
    if (cached) return cached;
  }

  try {
    const res = await httpJson<{ vulns?: OsvVulnerability[] }>(OSV_URL, {
      method: "POST",
      body: {
        package: { name, ecosystem: "npm" },
        version,
      },
      timeoutMs: 15_000,
      retries: 1,
      headers: { "user-agent": USER_AGENT },
    });
    const vulns = res.vulns ?? [];
    if (cache && useCache) {
      cache.set(key, vulns, 1); // 1 hour TTL
    }
    return vulns;
  } catch {
    return [];
  }
}

export function osvSignals(vulns: OsvVulnerability[]): Signal[] {
  return vulns.map((v): Signal => {
    const isMalicious = v.id.startsWith("MAL-");
    const evidence = v.severity?.map(s => `${s.type}=${s.score}`).join(", ");
    const sig: Signal = {
      id: isMalicious ? "osv_malicious" : "osv_vulnerability",
      title: isMalicious ? `Known malicious package (${v.id})` : `Known vulnerability (${v.id})`,
      description: v.summary || v.id,
      weight: isMalicious ? 100 : 70,
      level: "critical",
    };
    if (evidence) sig.evidence = evidence;
    return sig;
  });
}
