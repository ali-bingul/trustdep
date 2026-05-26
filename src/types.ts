// filepath: src/types.ts
export type RiskLevel = "clean" | "low" | "medium" | "high" | "critical";

export interface Signal {
  id: string;
  title: string;
  description: string;
  weight: number;
  level: RiskLevel;
  evidence?: string;
  /** Optional structured metadata used for richer reporting. */
  meta?: SignalMeta;
}

export interface SignalMeta {
  /** Advisory id (e.g. GHSA-xxxx-xxxx-xxxx). */
  advisoryId?: string;
  /** Associated CVE identifiers parsed from OSV aliases. */
  cveIds?: string[];
  /** Other aliases (non-CVE) parsed from OSV. */
  aliases?: string[];
  /** Parsed CVSS score (numeric, 0–10). */
  cvssScore?: number;
  /** CVSS severity bucket (None/Low/Medium/High/Critical) derived from cvssScore. */
  cvssSeverity?: string;
  /** Raw CVSS vector string, if available. */
  cvssVector?: string;
  /** First non-vulnerable version, if known. */
  fixedVersion?: string;
  /** Primary reference URL (advisory page). */
  url?: string;
  /** Suggested remediation hint for the action summary. */
  recommendation?: string;
}

export interface PackageResult {
  name: string;
  version: string;
  riskScore: number;
  riskLevel: RiskLevel;
  signals: Signal[];
  checkedAt: number;
  fromCache: boolean;
  error?: string;
}

export interface ScanResult {
  packages: PackageResult[];
  summary: {
    total: number;
    clean: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
    duration: number;
  };
}

export interface PkgsafeConfig {
  failOn: RiskLevel;
  ignore: string[];
  threshold: number;
  cacheTtlHours: number;
  concurrency: number;
}

export interface PackumentMaintainer {
  name: string;
  email?: string;
}

export interface PackumentDist {
  shasum: string;
  tarball: string;
  integrity?: string;
  attestations?: { provenance?: unknown };
}

export interface PackumentVersion {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  _npmUser?: { name: string; email?: string };
  _nodeVersion?: string;
  dist?: PackumentDist;
}

export interface Packument {
  name: string;
  "dist-tags": Record<string, string>;
  versions: Record<string, PackumentVersion>;
  time: Record<string, string>;
  maintainers: PackumentMaintainer[];
}

export interface OsvSeverity {
  type: string;
  score: string;
}

export interface OsvReference {
  type?: string;
  url: string;
}

export interface OsvRangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvRange {
  type: string;
  events: OsvRangeEvent[];
}

export interface OsvAffected {
  package?: { name?: string; ecosystem?: string };
  ranges?: OsvRange[];
  versions?: string[];
}

export interface OsvVulnerability {
  id: string;
  summary: string;
  details?: string;
  aliases?: string[];
  severity?: OsvSeverity[];
  references?: OsvReference[];
  affected?: OsvAffected[];
}

export class PackageNotFoundError extends Error {
  constructor(public readonly packageName: string) {
    super(`Package not found: ${packageName}`);
    this.name = "PackageNotFoundError";
  }
}
