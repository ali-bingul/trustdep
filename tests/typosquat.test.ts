// filepath: tests/typosquat.test.ts
import { describe, test, expect } from "vitest";
import {
  damerauLevenshtein,
  levenshtein,
  normalizeHomoglyphs,
  isCombosquat,
  analyseTyposquat,
  verifyTyposquatSignals,
  POPULARITY_THRESHOLD,
} from "../src/analysers/typosquat.js";

const top10k = ["lodash", "react", "axios", "express", "typescript", "moment"];

describe("levenshtein", () => {
  test("identical strings → 0", () => {
    expect(levenshtein("foo", "foo")).toBe(0);
  });
  test("single substitution → 1", () => {
    expect(levenshtein("foo", "fou")).toBe(1);
  });
});

describe("Damerau-Levenshtein", () => {
  test("detects single transposition", () => {
    expect(damerauLevenshtein("lodash", "lodsah")).toBe(1);
  });
  test("detects single deletion", () => {
    expect(damerauLevenshtein("lodash", "lodas")).toBe(1);
  });
  test("identical → 0", () => {
    expect(damerauLevenshtein("react", "react")).toBe(0);
  });
});

describe("homoglyph normalization", () => {
  test("normalizes l0dash to lodash", () => {
    expect(normalizeHomoglyphs("l0dash")).toBe("lodash");
  });
  test("normalizes rn -> m", () => {
    expect(normalizeHomoglyphs("rnoment")).toBe("moment");
  });
});

describe("combosquat", () => {
  test("detects -official suffix", () => {
    expect(isCombosquat("react-official", top10k)).toEqual({ match: "react", affix: "-official" });
  });
  test("returns null for benign name", () => {
    expect(isCombosquat("my-app", top10k)).toBeNull();
  });
});

describe("analyseTyposquat", () => {
  test("detects lodash typosquat", () => {
    const result = analyseTyposquat("lodsah", top10k);
    expect(result.isTyposquat).toBe(true);
    expect(result.candidates[0]?.name).toBe("lodash");
  });

  test("clean name passes", () => {
    const result = analyseTyposquat("some-unique-pkg-12345", top10k);
    expect(result.isTyposquat).toBe(false);
  });

  test("exact match is not a typosquat", () => {
    const result = analyseTyposquat("react", top10k);
    expect(result.isTyposquat).toBe(false);
  });

  test("trusted scope (@nestjs) is exempt from typosquat heuristics", () => {
    const result = analyseTyposquat("@nestjs/core", [...top10k, "core", "ora", "cron"]);
    expect(result.isTyposquat).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  test("trusted scope (@babel) is exempt", () => {
    const result = analyseTyposquat("@babel/core", [...top10k, "core"]);
    expect(result.isTyposquat).toBe(false);
  });

  test("very short scoped name (@scope/ui) is not flagged against short top entries", () => {
    const result = analyseTyposquat("@untrusted/ui", [...top10k, "ui", "vi", "ai"]);
    // 'ui' is too short to apply distance matching
    expect(result.candidates.every(c => c.algorithm !== "damerau-levenshtein")).toBe(true);
  });
});

describe("verifyTyposquatSignals", () => {
  test("filters candidates whose target has low downloads (false positive)", async () => {
    const result = analyseTyposquat("lodsah", top10k);
    expect(result.candidates[0]?.name).toBe("lodash");
    const verified = await verifyTyposquatSignals(
      "lodsah",
      result,
      async () => 5 // below threshold
    );
    expect(verified.isTyposquat).toBe(false);
    expect(verified.signals.length).toBe(0);
  });

  test("keeps signals when target is popular", async () => {
    const result = analyseTyposquat("lodsah", top10k);
    const verified = await verifyTyposquatSignals(
      "lodsah",
      result,
      async () => POPULARITY_THRESHOLD * 100
    );
    expect(verified.isTyposquat).toBe(true);
    expect(verified.signals.length).toBeGreaterThan(0);
    expect(verified.signals[0]?.evidence).toContain("/week");
  });

  test("empty candidates returns empty result", async () => {
    const result = analyseTyposquat("totally-unique-name-xyz", top10k);
    const verified = await verifyTyposquatSignals("totally-unique-name-xyz", result, async () => 1_000_000);
    expect(verified.isTyposquat).toBe(false);
  });
});
