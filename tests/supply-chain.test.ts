// filepath: tests/supply-chain.test.ts
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  detectMaintainerChange,
  detectProvenanceLoss,
  previousVersionOf,
} from "../src/analysers/supply-chain.js";
import type { Packument } from "../src/types.js";

const compromised = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "packument-compromised.json"), "utf8")
) as Packument;

const clean = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "packument-clean.json"), "utf8")
) as Packument;

describe("maintainer change detection", () => {
  test("detects new publisher in compromised packument", () => {
    const signals = detectMaintainerChange(compromised);
    expect(signals.some(s => s.id === "maintainer_added")).toBe(true);
  });

  test("clean packument has no maintainer signals", () => {
    const signals = detectMaintainerChange(clean);
    expect(signals.length).toBe(0);
  });

  test("suppresses signal when new publisher is a known bot account", () => {
    const botPackument: Packument = {
      name: "test",
      "dist-tags": { latest: "2.0.0" },
      time: { created: "2024-01-01T00:00:00Z", modified: "2024-06-01T00:00:00Z" },
      versions: {
        "1.0.0": {
          name: "test",
          version: "1.0.0",
          _npmUser: { name: "humanmaintainer", email: "h@example.com" },
          dist: { tarball: "", shasum: "" },
        },
        "2.0.0": {
          name: "test",
          version: "2.0.0",
          _npmUser: { name: "github-actions[bot]", email: "ci@example.com" },
          dist: { tarball: "", shasum: "" },
        },
      },
      maintainers: [{ name: "humanmaintainer", email: "h@example.com" }],
    };
    const signals = detectMaintainerChange(botPackument);
    expect(signals.some(s => s.id === "maintainer_added")).toBe(false);
    expect(signals.some(s => s.id === "maintainer_removed")).toBe(false);
  });
});

describe("provenance loss", () => {
  test("flags loss between 1.14.0 and 1.14.1", () => {
    const current = compromised.versions["1.14.1"]!;
    const previous = compromised.versions["1.14.0"]!;
    const sig = detectProvenanceLoss(current, previous);
    expect(sig).not.toBeNull();
    expect(sig?.id).toBe("provenance_lost");
  });

  test("clean packument keeps provenance", () => {
    const current = clean.versions["1.0.1"]!;
    const previous = clean.versions["1.0.0"]!;
    expect(detectProvenanceLoss(current, previous)).toBeNull();
  });
});

describe("previousVersionOf", () => {
  test("returns previous semver version", () => {
    const prev = previousVersionOf(compromised, "1.14.1");
    expect(prev?.version).toBe("1.14.0");
  });
});
