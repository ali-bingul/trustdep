// filepath: tests/script-auditor.test.ts
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditScripts } from "../src/analysers/script-auditor.js";
import type { Packument } from "../src/types.js";

const compromised = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "packument-compromised.json"), "utf8")
) as Packument;

const typosquat = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "packument-typosquat.json"), "utf8")
) as Packument;

describe("script auditor", () => {
  test("detects new postinstall script", () => {
    const current = compromised.versions["1.14.1"]!;
    const previous = compromised.versions["1.14.0"]!;
    const result = auditScripts(current, previous);
    expect(result.hasNewScript).toBe(true);
    const sig = result.signals.find(s => s.id === "new_postinstall_script");
    expect(sig).toBeDefined();
    expect(sig?.level).toBe("critical");
  });

  test("detects dangerous curl|bash pattern", () => {
    const current = typosquat.versions["0.0.1"]!;
    const result = auditScripts(current, undefined);
    expect(result.hasDangerousPattern).toBe(true);
    expect(result.signals.some(s => s.id === "dangerous_script_pattern")).toBe(true);
  });

  test("no signals when scripts unchanged and benign", () => {
    const v: Packument["versions"][string] = {
      name: "x",
      version: "1.0.0",
      scripts: { test: "echo ok" },
    };
    const result = auditScripts(v, v);
    expect(result.hasNewScript).toBe(false);
    expect(result.hasChangedScript).toBe(false);
    expect(result.hasDangerousPattern).toBe(false);
  });
});
