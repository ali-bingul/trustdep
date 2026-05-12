// filepath: src/analysers/supply-chain.ts
import semver from "semver";
import type { Packument, PackumentVersion, Signal } from "../types.js";

/**
 * Automation / CI accounts that legitimately publish on behalf of project
 * maintainers. When one of these is the "new publisher" or the "removed
 * maintainer", the signal is almost certainly a false positive and is
 * suppressed.
 */
const BOT_PUBLISHERS: ReadonlySet<string> = new Set([
  "github-actions[bot]",
  "github-actions",
  "github actions",
  "githubactions",
  "npm-cli-ops",
  "renovate-bot",
  "renovate[bot]",
  "dependabot",
  "dependabot[bot]",
  "semantic-release-bot",
  "vitestbot",
  "vercel-release-bot",
  "release-please[bot]",
  "google-cloud-ci-bot",
]);

function isBot(name: string | null | undefined): boolean {
  if (!name) return false;
  return BOT_PUBLISHERS.has(name.toLowerCase().trim());
}

function recentVersions(packument: Packument, count: number): string[] {
  const versions = Object.keys(packument.versions)
    .filter(v => semver.valid(v))
    .sort(semver.rcompare);
  return versions.slice(0, count);
}

export function detectMaintainerChange(packument: Packument): Signal[] {
  const signals: Signal[] = [];
  const recent = recentVersions(packument, 3);
  if (recent.length < 2) return signals;

  const userOf = (v: string): string | null => {
    const ver = packument.versions[v];
    return ver?._npmUser?.name ?? null;
  };

  const previousUsers = new Set<string>();
  for (let i = 1; i < recent.length; i++) {
    const u = userOf(recent[i]!);
    if (u) previousUsers.add(u);
  }
  const currentUser = userOf(recent[0]!);
  // Suppress when the "new" publisher is a known automation bot — most repos
  // hand off the actual `npm publish` step to GitHub Actions / release bots
  // even when human maintainers remain unchanged.
  if (
    currentUser &&
    !isBot(currentUser) &&
    previousUsers.size > 0 &&
    !previousUsers.has(currentUser)
  ) {
    signals.push({
      id: "maintainer_added",
      title: "New publisher detected",
      description: `Latest version published by '${currentUser}', not seen in previous versions`,
      weight: 30,
      level: "high",
      evidence: `previous publishers: ${[...previousUsers].join(", ")}`,
    });
  }

  // Top-level maintainers list — if known prior maintainer is missing
  const currentMaintainers = new Set((packument.maintainers ?? []).map(m => m.name));
  const knownPriorPublishers = new Set<string>();
  for (const v of recent.slice(1)) {
    const u = userOf(v);
    if (u) knownPriorPublishers.add(u);
  }
  for (const prior of knownPriorPublishers) {
    if (isBot(prior)) continue; // bots are not real maintainers; ignore their "removal"
    if (!currentMaintainers.has(prior)) {
      signals.push({
        id: "maintainer_removed",
        title: "Maintainer removed",
        description: `Previous publisher '${prior}' is no longer in the maintainers list`,
        weight: 40,
        level: "critical",
        evidence: `current maintainers: ${[...currentMaintainers].join(", ") || "(none)"}`,
      });
      break;
    }
  }

  return signals;
}

export function detectPublishSpike(packument: Packument): Signal[] {
  const signals: Signal[] = [];
  const times = Object.entries(packument.time)
    .filter(([k]) => k !== "created" && k !== "modified")
    .map(([v, t]) => ({ version: v, time: new Date(t).getTime() }))
    .filter(e => Number.isFinite(e.time))
    .sort((a, b) => b.time - a.time);

  if (times.length < 2) return signals;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within24h = times.filter(t => now - t.time <= day).length;
  const within7d = times.filter(t => now - t.time <= 7 * day).length;

  if (within24h >= 3) {
    signals.push({
      id: "publish_spike_24h",
      title: "Publish spike (24h)",
      description: `${within24h} versions published in the last 24 hours`,
      weight: 25,
      level: "high",
    });
  }

  // historical average per 7d
  const totalSpan = times[0]!.time - times[times.length - 1]!.time;
  if (totalSpan > 0) {
    const avgPer7d = (times.length / totalSpan) * 7 * day;
    if (within7d > avgPer7d * 3 && within7d >= 3) {
      signals.push({
        id: "publish_spike_7d",
        title: "Publish spike (7d)",
        description: `${within7d} versions in last 7 days, >3x historical average`,
        weight: 15,
        level: "medium",
      });
    }
  }

  return signals;
}

export function detectProvenanceLoss(
  current: PackumentVersion,
  previous: PackumentVersion | undefined
): Signal | null {
  if (!previous) return null;
  const prev = previous.dist?.attestations?.provenance;
  const curr = current.dist?.attestations?.provenance;
  if (prev && !curr) {
    return {
      id: "provenance_lost",
      title: "Provenance lost",
      description: `Previous version had CI provenance attestation, current version does not`,
      weight: 35,
      level: "high",
      evidence: `previous version: ${previous.version}`,
    };
  }
  return null;
}

export function detectVeryNewPackage(packument: Packument): Signal | null {
  const created = packument.time?.created;
  if (!created) return null;
  const age = Date.now() - new Date(created).getTime();
  if (age < 48 * 60 * 60 * 1000 && age >= 0) {
    const hours = Math.round(age / (60 * 60 * 1000));
    return {
      id: "very_new_package",
      title: "Very new package",
      description: `Package was first published ${hours} hours ago`,
      weight: 10,
      level: "low",
    };
  }
  return null;
}

export function previousVersionOf(packument: Packument, version: string): PackumentVersion | undefined {
  const versions = Object.keys(packument.versions)
    .filter(v => semver.valid(v))
    .sort(semver.rcompare);
  const idx = versions.indexOf(version);
  if (idx < 0 || idx === versions.length - 1) return undefined;
  const prev = versions[idx + 1];
  return prev ? packument.versions[prev] : undefined;
}

export function analyseSupplyChain(
  packument: Packument,
  current: PackumentVersion
): Signal[] {
  const signals: Signal[] = [];
  signals.push(...detectMaintainerChange(packument));
  signals.push(...detectPublishSpike(packument));
  const prev = previousVersionOf(packument, current.version);
  const provLoss = detectProvenanceLoss(current, prev);
  if (provLoss) signals.push(provLoss);
  const veryNew = detectVeryNewPackage(packument);
  if (veryNew) signals.push(veryNew);
  return signals;
}
