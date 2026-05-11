// filepath: src/cache/cache.ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import Database from "better-sqlite3";

export class Cache {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  }

  get<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value, expires_at FROM cache WHERE key = ?")
      .get(key) as { value: string; expires_at: number } | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.delete(key);
      return null;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, ttlHours: number): void {
    const expiresAt = Date.now() + ttlHours * 3600 * 1000;
    this.db
      .prepare(
        "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)"
      )
      .run(key, JSON.stringify(value), expiresAt);
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
  }

  cleanup(): void {
    this.db.prepare("DELETE FROM cache WHERE expires_at < ?").run(Date.now());
  }

  close(): void {
    this.db.close();
  }

  static getDefaultPath(): string {
    return path.join(os.homedir(), ".pkgsafe", "cache.db");
  }
}
