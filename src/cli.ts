// filepath: src/cli.ts
import { Command } from "commander";
import { check } from "./commands/check.js";
import { scan } from "./commands/scan.js";
import { watch } from "./commands/watch.js";
import type { RiskLevel } from "./types.js";

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== "undefined" ? __VERSION__ : "1.0.0";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("trustdep")
  .description("npm supply chain security scanner")
  .version(VERSION);

program
  .command("check <packages...>")
  .description("Check one or more npm packages (e.g. lodash react axios@1.2.3)")
  .option("--json", "JSON output")
  .option("--sarif", "SARIF output")
  .option("--no-cache", "Skip cache")
  .option("--verbose", "Show all signals")
  .action((specs: string[], opts: { json?: boolean; sarif?: boolean; cache?: boolean; verbose?: boolean }) => {
    void check(specs, opts);
  });

program
  .command("scan")
  .description("Scan all dependencies in package.json")
  .option("--json", "JSON output")
  .option("--sarif", "SARIF output")
  .option("--fail-on <level>", "Exit 1 on this level (clean|low|medium|high|critical)")
  .option("--no-cache", "Skip cache")
  .option("--verbose", "Show all signals")
  .option("--ignore <pattern>", "Ignore packages matching glob (repeatable)", collect, [] as string[])
  .option("--include-peers", "Include peerDependencies")
  .option("--cwd <path>", "Project directory")
  .action((opts: {
    json?: boolean;
    sarif?: boolean;
    failOn?: RiskLevel;
    cache?: boolean;
    verbose?: boolean;
    ignore?: string[];
    includePeers?: boolean;
    cwd?: string;
  }) => {
    void scan(opts);
  });

program
  .command("watch")
  .description("Watch lock file and scan on changes")
  .option("--json", "JSON output for changes")
  .option("--fail-on <level>", "Highlight when threshold is exceeded")
  .option("--cwd <path>", "Project directory")
  .action((opts: { json?: boolean; failOn?: RiskLevel; cwd?: string }) => {
    void watch(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`trustdep: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
