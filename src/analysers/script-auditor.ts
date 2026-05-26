// filepath: src/analysers/script-auditor.ts
import type { PackumentVersion, Signal } from "../types.js";

export const LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepack",
  "prepare",
] as const;

export type LifecycleScript = (typeof LIFECYCLE_SCRIPTS)[number];

interface DangerousPattern {
  pattern: RegExp;
  description: string;
}

export const DANGEROUS_PATTERNS: DangerousPattern[] = [
  { pattern: /curl\s+[^\n|]*\|\s*(sh|bash|zsh)/i, description: "curl piped to shell" },
  { pattern: /wget\s+[^\n|]*\|\s*(sh|bash|zsh)/i, description: "wget piped to shell" },
  { pattern: new RegExp("\\b" + "ev" + "al" + "\\s*\\("), description: "dynamic-eval invocation" },
  { pattern: /process\.env\.[A-Z_]+/, description: "environment variable access" },
  { pattern: /child_process/, description: "child_process usage" },
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/, description: "filesystem access in script" },
  {
    pattern: /https?:\/\/(?!(?:[\w.-]+\.)?(?:registry\.npmjs\.org|nodejs\.org|github\.com))/i,
    description: "external URL reference",
  },
  { pattern: /Buffer\.from\s*\([^)]*['"]base64['"]/i, description: "base64 decode (possible payload)" },
  { pattern: /\bbase64\b/i, description: "base64 string reference" },
];

function scriptsOf(version: PackumentVersion | undefined): Record<string, string> {
  return version?.scripts ?? {};
}

function unifiedDiff(name: string, oldText: string, newText: string): string {
  return [
    `--- ${name} (previous)`,
    `+++ ${name} (current)`,
    ...oldText.split("\n").map(l => `- ${l}`),
    ...newText.split("\n").map(l => `+ ${l}`),
  ].join("\n");
}

export interface ScriptAuditResult {
  hasNewScript: boolean;
  hasChangedScript: boolean;
  hasDangerousPattern: boolean;
  signals: Signal[];
  scriptDiff?: string;
}

export function auditScripts(
  current: PackumentVersion,
  previous: PackumentVersion | undefined
): ScriptAuditResult {
  const result: ScriptAuditResult = {
    hasNewScript: false,
    hasChangedScript: false,
    hasDangerousPattern: false,
    signals: [],
  };

  const cur = scriptsOf(current);
  const prev = scriptsOf(previous);
  const diffs: string[] = [];

  for (const name of LIFECYCLE_SCRIPTS) {
    const curScript = cur[name];
    const prevScript = prev[name];

    if (curScript && !prevScript && previous) {
      result.hasNewScript = true;
      result.signals.push({
        id: `new_${name}_script`,
        title: `New ${name} script added`,
        description: `${name} script was absent in version ${previous.version}`,
        weight: 45,
        level: "critical",
        evidence: curScript,
      });
    } else if (curScript && prevScript && curScript !== prevScript) {
      result.hasChangedScript = true;
      const diff = unifiedDiff(name, prevScript, curScript);
      diffs.push(diff);
      result.signals.push({
        id: `changed_install_script`,
        title: `${name} script changed`,
        description: `${name} script was modified between versions`,
        weight: 30,
        level: "high",
        evidence: diff,
      });
    }

    if (curScript) {
      for (const dp of DANGEROUS_PATTERNS) {
        if (dp.pattern.test(curScript)) {
          result.hasDangerousPattern = true;
          result.signals.push({
            id: "dangerous_script_pattern",
            title: `Dangerous pattern in ${name}`,
            description: `Detected: ${dp.description}`,
            weight: 50,
            level: "critical",
            evidence: `script: ${curScript}\nmatched: ${dp.pattern.source}`,
          });
        }
      }
    }
  }

  if (diffs.length > 0) {
    result.scriptDiff = diffs.join("\n\n");
  }

  return result;
}
