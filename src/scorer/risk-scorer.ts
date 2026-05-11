// filepath: src/scorer/risk-scorer.ts
import type { RiskLevel, Signal } from "../types.js";

export const SIGNAL_WEIGHTS: Record<string, number> = {
  osv_malicious: 100,
  osv_vulnerability: 70,

  new_install_script: 45,
  new_postinstall_script: 45,
  new_preinstall_script: 45,
  new_prepack_script: 30,
  new_prepare_script: 30,
  dangerous_script_pattern: 50,
  changed_install_script: 30,

  maintainer_removed: 40,
  maintainer_added: 30,
  provenance_lost: 35,

  phantom_dependency: 30,

  publish_spike_24h: 25,
  publish_spike_7d: 15,

  typosquat_distance_1: 25,
  typosquat_distance_2: 15,
  typosquat_homoglyph: 20,
  typosquat_combosquat: 10,

  very_new_package: 10,
};

/**
 * Combines signals into a 0-100 risk score using highest + partial sum.
 */
export function calculateScore(signals: Signal[]): number {
  if (signals.length === 0) return 0;
  const sorted = signals.map(s => s.weight).sort((a, b) => b - a);
  const highest = sorted[0]!;
  const rest = sorted.slice(1).reduce((acc, w) => acc + w * 0.4, 0);
  return Math.min(100, Math.round(highest + rest));
}

export function scoreToLevel(score: number): RiskLevel {
  if (score === 0) return "clean";
  if (score < 20) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "critical";
}

const ORDER: Record<RiskLevel, number> = {
  clean: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function compareLevel(a: RiskLevel, b: RiskLevel): number {
  return ORDER[a] - ORDER[b];
}

export function levelAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return ORDER[level] >= ORDER[threshold];
}
