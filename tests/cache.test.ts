// filepath: tests/cache.test.ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Cache } from "../src/cache/cache.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "trustdep-cache-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Cache", () => {
  test("returns null for a missing key", () => {
    const cache = new Cache(path.join(dir, "store"));
    expect(cache.get("nope")).toBeNull();
  });

  test("round-trips a value", () => {
    const cache = new Cache(dir);
    cache.set("pkg:chalk", { name: "chalk", versions: [1, 2, 3] }, 24);
    expect(cache.get("pkg:chalk")).toEqual({ name: "chalk", versions: [1, 2, 3] });
  });

  test("keeps distinct keys apart", () => {
    const cache = new Cache(dir);
    cache.set("a", 1, 24);
    cache.set("b", 2, 24);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });

  test("survives a new Cache instance over the same directory", () => {
    new Cache(dir).set("k", "v", 24);
    expect(new Cache(dir).get("k")).toBe("v");
  });

  test("expired entries return null and are removed", () => {
    const cache = new Cache(dir);
    cache.set("stale", "v", -1);
    expect(cache.get("stale")).toBeNull();
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test("delete removes an entry", () => {
    const cache = new Cache(dir);
    cache.set("k", "v", 24);
    cache.delete("k");
    expect(cache.get("k")).toBeNull();
  });

  test("delete on a missing key is a no-op", () => {
    const cache = new Cache(dir);
    expect(() => cache.delete("missing")).not.toThrow();
  });

  test("cleanup drops expired entries and keeps live ones", () => {
    const cache = new Cache(dir);
    cache.set("live", "v", 24);
    cache.set("dead", "v", -1);
    cache.cleanup();
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect(cache.get("live")).toBe("v");
  });

  test("corrupt entries are discarded", () => {
    const cache = new Cache(dir);
    cache.set("k", "v", 24);
    const file = fs.readdirSync(dir)[0]!;
    fs.writeFileSync(path.join(dir, file), "{not json", "utf8");
    expect(cache.get("k")).toBeNull();
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  test("entries without an expiry are discarded", () => {
    const cache = new Cache(dir);
    cache.set("k", "v", 24);
    const file = fs.readdirSync(dir)[0]!;
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ value: "v" }), "utf8");
    expect(cache.get("k")).toBeNull();
  });

  test("overwrites an existing key", () => {
    const cache = new Cache(dir);
    cache.set("k", "first", 24);
    cache.set("k", "second", 24);
    expect(cache.get("k")).toBe("second");
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  test("leaves no temporary files behind", () => {
    const cache = new Cache(dir);
    cache.set("k", { big: "x".repeat(10_000) }, 24);
    expect(fs.readdirSync(dir).filter(f => f.endsWith(".tmp"))).toHaveLength(0);
  });

  test("getDefaultPath points at the trustdep home directory", () => {
    expect(Cache.getDefaultPath()).toBe(path.join(os.homedir(), ".trustdep", "cache"));
  });
});
