// filepath: src/registry/npm-client.ts
import semver from "semver";
import { httpJson, HttpError } from "./http.js";
import type { Cache } from "../cache/cache.js";
import { PackageNotFoundError, type Packument, type PackumentVersion } from "../types.js";
import { USER_AGENT } from "../version.js";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 30_000;

function highestVersion(versions: string[], name: string): string {
  const valid = versions.filter(v => semver.valid(v));
  const stable = valid.filter(v => semver.prerelease(v) === null);
  const pool = stable.length > 0 ? stable : valid;
  const highest = [...pool].sort(semver.rcompare)[0];
  if (!highest) throw new Error(`No versions available for ${name}`);
  return highest;
}

export interface NpmClientOptions {
  cache?: Cache | undefined;
  cacheTtlHours?: number | undefined;
  useCache?: boolean | undefined;
}

export class NpmClient {
  private cache: Cache | undefined;
  private ttl: number;
  private useCache: boolean;

  constructor(opts: NpmClientOptions = {}) {
    this.cache = opts.cache;
    this.ttl = opts.cacheTtlHours ?? 24;
    this.useCache = opts.useCache ?? true;
  }

  private async getJson<T>(url: string): Promise<T> {
    try {
      return await httpJson<T>(url, {
        timeoutMs: TIMEOUT_MS,
        retries: 2,
        headers: { "user-agent": USER_AGENT },
      });
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        throw new PackageNotFoundError(url);
      }
      throw err;
    }
  }

  async fetchPackument(name: string): Promise<{ packument: Packument; fromCache: boolean }> {
    const key = `pkg:${name}`;
    if (this.cache && this.useCache) {
      const cached = this.cache.get<Packument>(key);
      if (cached) return { packument: cached, fromCache: true };
    }
    const url = `${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`;
    try {
      const packument = await this.getJson<Packument>(url);
      if (this.cache && this.useCache) {
        this.cache.set(key, packument, this.ttl);
      }
      return { packument, fromCache: false };
    } catch (err) {
      if (err instanceof PackageNotFoundError) {
        throw new PackageNotFoundError(name);
      }
      throw err;
    }
  }

  async fetchVersion(name: string, version: string): Promise<PackumentVersion> {
    const { packument } = await this.fetchPackument(name);
    const v = packument.versions[version];
    if (!v) {
      throw new Error(`Version ${version} of ${name} not found`);
    }
    return v;
  }

  resolveVersion(packument: Packument, requested?: string): string {
    const versions = Object.keys(packument.versions ?? {});
    const latest = packument["dist-tags"]?.latest;

    if (!requested || requested === "latest") {
      if (latest) return latest;
      return highestVersion(versions, packument.name);
    }

    if (packument.versions?.[requested]) return requested;

    const tagged = packument["dist-tags"]?.[requested];
    if (tagged) return tagged;

    if (semver.validRange(requested)) {
      const match = semver.maxSatisfying(versions, requested);
      if (match) return match;
    }

    if (latest) return latest;
    return highestVersion(versions, packument.name);
  }

  async fetchDownloads(
    name: string,
    period: "last-week" | "last-month" = "last-week"
  ): Promise<number> {
    const url = `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(name)}`;
    try {
      const res = await this.getJson<{ downloads: number }>(url);
      return res.downloads ?? 0;
    } catch {
      return 0;
    }
  }
}
