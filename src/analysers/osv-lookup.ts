// filepath: src/analysers/osv-lookup.ts
import { httpJson } from "../registry/http.js";
import type { Cache } from "../cache/cache.js";
import type { OsvVulnerability, Signal, SignalMeta } from "../types.js";
import { USER_AGENT } from "../version.js";

const OSV_URL = "https://api.osv.dev/v1/query";

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

/**
 * Best-effort CVSS base-score parser. OSV stores severity as the full CVSS
 * vector string (e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L"); we
 * approximate the base score from the impact + exploitability metrics so we
 * can show a familiar "7.5 (High)" style label without pulling in a full
 * CVSS library.
 */
function parseCvssScore(vector: string): number | undefined {
  // Some OSV entries append a numeric score; honour it when present.
  const numeric = vector.match(/\b(10(?:\.0)?|[0-9](?:\.[0-9])?)\s*$/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (!Number.isNaN(n) && n >= 0 && n <= 10) return n;
  }
  const c = /\bVC:([NLH])\b/.exec(vector)?.[1] ?? /\bC:([NLH])\b/.exec(vector)?.[1];
  const i = /\bVI:([NLH])\b/.exec(vector)?.[1] ?? /\bI:([NLH])\b/.exec(vector)?.[1];
  const a = /\bVA:([NLH])\b/.exec(vector)?.[1] ?? /\bA:([NLH])\b/.exec(vector)?.[1];
  const av = /\bAV:([NALP])\b/.exec(vector)?.[1];
  const ac = /\bAC:([LH])\b/.exec(vector)?.[1];
  if (!c || !i || !a) return undefined;
  const impactWeight = (m: string): number => (m === "H" ? 3 : m === "L" ? 1.5 : 0);
  const impact = impactWeight(c) + impactWeight(i) + impactWeight(a);
  const reach = (av === "N" ? 2 : av === "A" ? 1.2 : av === "L" ? 0.6 : 0.3) * (ac === "L" ? 1 : 0.7);
  const score = Math.min(10, Math.round((impact + reach) * 10) / 10);
  return score;
}

function severityBucket(score: number): string {
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  if (score > 0) return "Low";
  return "None";
}

function pickPrimaryCvss(vuln: OsvVulnerability): {
  vector?: string;
  score?: number;
  severity?: string;
} {
  if (!vuln.severity || vuln.severity.length === 0) return {};
  const ordered = [...vuln.severity].sort((a, b) => {
    const rank = (t: string): number =>
      t === "CVSS_V4" ? 0 : t === "CVSS_V3" ? 1 : t === "CVSS_V2" ? 2 : 3;
    return rank(a.type) - rank(b.type);
  });
  const best = ordered[0]!;
  const score = parseCvssScore(best.score);
  if (score === undefined) return { vector: best.score };
  return { vector: best.score, score, severity: severityBucket(score) };
}

function extractFixedVersion(vuln: OsvVulnerability): string | undefined {
  if (!vuln.affected) return undefined;
  for (const aff of vuln.affected) {
    for (const range of aff.ranges ?? []) {
      for (const ev of range.events) {
        if (ev.fixed) return ev.fixed;
      }
    }
  }
  return undefined;
}

function extractCves(vuln: OsvVulnerability): { cves: string[]; others: string[] } {
  const cves: string[] = [];
  const others: string[] = [];
  for (const alias of vuln.aliases ?? []) {
    if (/^CVE-/i.test(alias)) cves.push(alias.toUpperCase());
    else if (alias !== vuln.id) others.push(alias);
  }
  return { cves, others };
}

function primaryUrl(vuln: OsvVulnerability): string | undefined {
  const ref = vuln.references?.find(r => r.type === "ADVISORY") ?? vuln.references?.[0];
  if (ref?.url) return ref.url;
  if (vuln.id.startsWith("GHSA-")) return `https://github.com/advisories/${vuln.id}`;
  if (vuln.id.startsWith("CVE-")) return `https://nvd.nist.gov/vuln/detail/${vuln.id}`;
  return undefined;
}

export function osvSignals(vulns: OsvVulnerability[]): Signal[] {
  return vulns.map((v): Signal => {
    const isMalicious = v.id.startsWith("MAL-");
    const { cves, others } = extractCves(v);
    const cvss = pickPrimaryCvss(v);
    const fixedVersion = extractFixedVersion(v);
    const url = primaryUrl(v);

    const idTokens = [v.id, ...cves].filter(Boolean).join(", ");
    const title = isMalicious
      ? `Known malicious package (${idTokens})`
      : `Known vulnerability (${idTokens})`;

    const evidenceParts: string[] = [];
    if (cvss.score !== undefined && cvss.severity) {
      evidenceParts.push(`CVSS ${cvss.score.toFixed(1)} (${cvss.severity})`);
    } else if (cvss.vector) {
      evidenceParts.push(cvss.vector);
    }

    const meta: SignalMeta = {
      advisoryId: v.id,
      cveIds: cves,
      aliases: others,
      ...(cvss.score !== undefined ? { cvssScore: cvss.score } : {}),
      ...(cvss.severity ? { cvssSeverity: cvss.severity } : {}),
      ...(cvss.vector ? { cvssVector: cvss.vector } : {}),
      ...(fixedVersion ? { fixedVersion } : {}),
      ...(url ? { url } : {}),
      recommendation: isMalicious
        ? `Uninstall ${v.id} immediately; do not publish or deploy.`
        : fixedVersion
          ? `Upgrade to ${fixedVersion} or later.`
          : `No fixed version published yet — pin a safe alternative or apply a workaround.`,
    };

    const sig: Signal = {
      id: isMalicious ? "osv_malicious" : "osv_vulnerability",
      title,
      description: v.summary || v.id,
      weight: isMalicious ? 100 : 70,
      level: "critical",
      meta,
    };
    if (evidenceParts.length > 0) sig.evidence = evidenceParts.join(" · ");
    return sig;
  });
}
