// filepath: src/cache/cache.ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  get<T>(key: string): T | null {
    const file = this.fileFor(key);
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }

    let entry: CacheEntry<T> | null;
    try {
      entry = JSON.parse(raw) as CacheEntry<T>;
    } catch {
      this.removeFile(file);
      return null;
    }

    if (!entry || typeof entry.expiresAt !== "number") {
      this.removeFile(file);
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.removeFile(file);
      return null;
    }
    return entry.value;
  }

  set<T>(key: string, value: T, ttlHours: number): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlHours * 3600 * 1000,
    };
    const file = this.fileFor(key);
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {
      this.removeFile(tmp);
    }
  }

  delete(key: string): void {
    this.removeFile(this.fileFor(key));
  }

  cleanup(): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }

    const now = Date.now();
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.dir, name);
      try {
        const entry = JSON.parse(fs.readFileSync(file, "utf8")) as CacheEntry<unknown> | null;
        if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt < now) {
          this.removeFile(file);
        }
      } catch {
        this.removeFile(file);
      }
    }
  }

  close(): void {
    return;
  }

  private fileFor(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return path.join(this.dir, `${hash}.json`);
  }

  private removeFile(file: string): void {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      return;
    }
  }

  static getDefaultPath(): string {
    return path.join(os.homedir(), ".trustdep", "cache");
  }
}
