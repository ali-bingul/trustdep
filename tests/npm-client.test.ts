// filepath: tests/npm-client.test.ts
import { describe, test, expect } from "vitest";
import { NpmClient } from "../src/registry/npm-client.js";
import { toVersionRange } from "../src/commands/scan.js";
import type { Packument, PackumentVersion } from "../src/types.js";

function packument(
  name: string,
  versions: string[],
  distTags: Record<string, string> = {}
): Packument {
  const map: Record<string, PackumentVersion> = {};
  for (const v of versions) map[v] = { name, version: v };
  return {
    name,
    "dist-tags": distTags,
    versions: map,
    time: {},
    maintainers: [],
  };
}

const client = new NpmClient({ useCache: false });

describe("resolveVersion", () => {
  test("no version requested → dist-tags.latest", () => {
    const p = packument("a", ["1.0.0", "2.0.0"], { latest: "1.0.0" });
    expect(client.resolveVersion(p)).toBe("1.0.0");
  });

  test("'latest' → dist-tags.latest", () => {
    const p = packument("a", ["1.0.0", "2.0.0"], { latest: "1.0.0" });
    expect(client.resolveVersion(p, "latest")).toBe("1.0.0");
  });

  test("exact version is returned as-is", () => {
    const p = packument("a", ["1.0.0", "1.1.0"], { latest: "1.1.0" });
    expect(client.resolveVersion(p, "1.0.0")).toBe("1.0.0");
  });

  test("dist-tag is resolved", () => {
    const p = packument("a", ["1.0.0", "2.0.0-beta.1"], { latest: "1.0.0", beta: "2.0.0-beta.1" });
    expect(client.resolveVersion(p, "beta")).toBe("2.0.0-beta.1");
  });

  test("caret range resolves to the highest match, not the range base", () => {
    const p = packument("a", ["5.3.3", "5.4.2", "5.5.4", "6.0.0"], { latest: "6.0.0" });
    expect(client.resolveVersion(p, "^5.4.0")).toBe("5.5.4");
  });

  test("range base that was never published still resolves", () => {
    const p = packument("typescript", ["5.3.3", "5.4.2", "5.9.3", "7.0.2"], { latest: "7.0.2" });
    expect(client.resolveVersion(p, "^5.4.0")).toBe("5.9.3");
  });

  test("tilde range stays inside the minor", () => {
    const p = packument("a", ["1.2.0", "1.2.9", "1.3.0"], { latest: "1.3.0" });
    expect(client.resolveVersion(p, "~1.2.0")).toBe("1.2.9");
  });

  test("x-range is honoured", () => {
    const p = packument("a", ["4.17.21", "4.18.1", "5.0.0"], { latest: "5.0.0" });
    expect(client.resolveVersion(p, "4.x")).toBe("4.18.1");
  });

  test("compound range is honoured", () => {
    const p = packument("a", ["1.5.0", "1.6.0", "1.20.0", "2.0.0"], { latest: "2.0.0" });
    expect(client.resolveVersion(p, ">=1.6.0 <2")).toBe("1.20.0");
  });

  test("prereleases are not picked for a stable range", () => {
    const p = packument("next", ["13.4.0", "13.5.9", "16.4.0-canary.28"], { latest: "13.5.9" });
    expect(client.resolveVersion(p, "^13.4")).toBe("13.5.9");
  });

  test("newest published version does not win over the range", () => {
    const p = packument("a", ["1.0.0", "1.1.0", "9.9.9"], { latest: "9.9.9" });
    expect(client.resolveVersion(p, "^1.0.0")).toBe("1.1.0");
  });

  test("unsatisfiable range falls back to dist-tags.latest", () => {
    const p = packument("a", ["1.0.0", "2.0.0"], { latest: "2.0.0" });
    expect(client.resolveVersion(p, "^99.0.0")).toBe("2.0.0");
  });

  test("unparseable spec falls back to dist-tags.latest", () => {
    const p = packument("a", ["1.0.0", "2.0.0"], { latest: "1.0.0" });
    expect(client.resolveVersion(p, "not-a-range")).toBe("1.0.0");
  });

  test("without dist-tags the highest stable version wins", () => {
    const p = packument("a", ["1.0.0", "10.0.0", "2.0.0"]);
    expect(client.resolveVersion(p)).toBe("10.0.0");
  });

  test("without dist-tags prereleases are skipped when a stable exists", () => {
    const p = packument("a", ["1.0.0", "2.0.0-rc.1"]);
    expect(client.resolveVersion(p)).toBe("1.0.0");
  });

  test("prerelease-only packument still resolves", () => {
    const p = packument("a", ["1.0.0-alpha.1", "1.0.0-alpha.2"]);
    expect(client.resolveVersion(p)).toBe("1.0.0-alpha.2");
  });

  test("throws when there are no versions at all", () => {
    const p = packument("a", []);
    expect(() => client.resolveVersion(p)).toThrow(/No versions available/);
  });
});

describe("toVersionRange", () => {
  test("passes semver ranges through untouched", () => {
    expect(toVersionRange("^5.4.0")).toBe("^5.4.0");
    expect(toVersionRange("~1.2.0")).toBe("~1.2.0");
    expect(toVersionRange(">=1.6.0 <2")).toBe(">=1.6.0 <2");
    expect(toVersionRange("4.x")).toBe("4.x");
    expect(toVersionRange("1.2.3")).toBe("1.2.3");
  });

  test("trims surrounding whitespace", () => {
    expect(toVersionRange("  ^1.0.0 ")).toBe("^1.0.0");
  });

  test("wildcards and tags become undefined", () => {
    expect(toVersionRange("*")).toBeUndefined();
    expect(toVersionRange("latest")).toBeUndefined();
    expect(toVersionRange("")).toBeUndefined();
  });

  test("non-registry specs become undefined", () => {
    expect(toVersionRange("git+https://github.com/a/b.git")).toBeUndefined();
    expect(toVersionRange("file:../local")).toBeUndefined();
    expect(toVersionRange("workspace:*")).toBeUndefined();
    expect(toVersionRange("https://example.com/a.tgz")).toBeUndefined();
  });
});
