// filepath: src/registry/npm-client.ts
import got, { HTTPError } from "got";
import type { Cache } from "../cache/cache.js";
import { PackageNotFoundError, type Packument, type PackumentVersion } from "../types.js";

const REGISTRY = "https://registry.npmjs.org";
const USER_AGENT = "trustdep/1.0.0 (https://github.com/ali-bingul/trustdep)";
const TIMEOUT_MS = 30_000;

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
      return await got(url, {
        timeout: { request: TIMEOUT_MS },
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
        retry: {
          limit: 2,
          methods: ["GET"],
          statusCodes: [408, 429, 500, 502, 503, 504],
        },
      }).json<T>();
    } catch (err) {
      if (err instanceof HTTPError) {
        if (err.response.statusCode === 404) {
          throw new PackageNotFoundError(url);
        }
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
    if (!requested || requested === "latest") {
      const latest = packument["dist-tags"]?.latest;
      if (latest) return latest;
    }
    if (requested && packument.versions[requested]) return requested;
    if (requested && packument["dist-tags"]?.[requested]) {
      return packument["dist-tags"][requested]!;
    }
    // Fallback: pick last version key
    const versions = Object.keys(packument.versions);
    const last = versions[versions.length - 1];
    if (!last) throw new Error(`No versions available for ${packument.name}`);
    return last;
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
