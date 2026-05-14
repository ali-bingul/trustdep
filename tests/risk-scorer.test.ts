// filepath: tests/risk-scorer.test.ts
import { describe, test, expect } from "vitest";
import { calculateScore, scoreToLevel, levelAtLeast } from "../src/scorer/risk-scorer.js";
import type { Signal } from "../src/types.js";

function sig(weight: number, level: Signal["level"] = "high"): Signal {
  return {
    id: "x",
    title: "t",
    description: "d",
    weight,
    level,
  };
}

describe("calculateScore", () => {
  test("empty signals → 0", () => {
    expect(calculateScore([])).toBe(0);
  });

  test("single signal → its weight", () => {
    expect(calculateScore([sig(50)])).toBe(50);
  });

  test("multiple signals: highest + 0.4 * rest", () => {
    // highest=50, rest=30+20=50, *0.4 = 20 → 70
    expect(calculateScore([sig(50), sig(30), sig(20)])).toBe(70);
  });

  test("clamped to 100", () => {
    expect(calculateScore([sig(100), sig(100), sig(100)])).toBe(100);
  });
});

describe("scoreToLevel", () => {
  test("0 → clean", () => expect(scoreToLevel(0)).toBe("clean"));
  test("10 → low", () => expect(scoreToLevel(10)).toBe("low"));
  test("30 → medium", () => expect(scoreToLevel(30)).toBe("medium"));
  test("60 → high", () => expect(scoreToLevel(60)).toBe("high"));
  test("80 → critical", () => expect(scoreToLevel(80)).toBe("critical"));
});

describe("levelAtLeast", () => {
  test("critical >= high", () => expect(levelAtLeast("critical", "high")).toBe(true));
  test("low < high", () => expect(levelAtLeast("low", "high")).toBe(false));
  test("equal", () => expect(levelAtLeast("medium", "medium")).toBe(true));
});
