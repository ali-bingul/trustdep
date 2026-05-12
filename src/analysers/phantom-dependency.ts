// filepath: src/analysers/phantom-dependency.ts
import type { PackumentVersion, Signal } from "../types.js";

/**
 * Detects newly-added dependencies that look like phantom dependencies.
 *
 * A full check would require static analysis of the published tarball;
 * this metadata-only heuristic flags dependencies that:
 *   - appear in the current version
 *   - did NOT appear in the previous version
 *   - are not commonly required peer libraries
 *
 * The Axios attack used this technique: a phantom dependency was added
 * silently to deliver a postinstall RAT.
 */
export function detectPhantomDependencies(
  current: PackumentVersion,
  previous: PackumentVersion | undefined
): Signal[] {
  const signals: Signal[] = [];
  if (!previous) return signals;

  const curDeps = new Set(Object.keys(current.dependencies ?? {}));
  const prevDeps = new Set(Object.keys(previous.dependencies ?? {}));

  const added: string[] = [];
  for (const d of curDeps) {
    if (!prevDeps.has(d)) added.push(d);
  }

  if (added.length === 0) return signals;

  for (const dep of added) {
    signals.push({
      id: "phantom_dependency",
      title: "Newly added dependency",
      description: `Dependency '${dep}' was added in this version (possible phantom dependency)`,
      weight: 30,
      level: "medium",
      evidence: `previous version: ${previous.version}`,
    });
  }

  return signals;
}
