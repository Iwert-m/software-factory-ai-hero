import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { z } from "zod";

// oxlint has no suppressions file, so the baseline is a config of per-file
// overrides that switch off each rule a file already broke when the linter
// arrived. Run this after fixing violations to shrink it.

const BASELINE_PATH = "oxlint-baseline.json";

const reportSchema = z.object({
  diagnostics: z.array(z.object({ code: z.string(), filename: z.string() })),
});

function toRuleName(code: string) {
  const match = /^(.+)\((.+)\)$/.exec(code);
  if (match === null) throw new Error(`Unrecognised oxlint code: ${code}`);
  const [, plugin, rule] = match;
  return plugin === "eslint" ? rule : `${plugin}/${rule}`;
}

function lintWithoutBaseline() {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ overrides: [] })}\n`);
  try {
    return execFileSync("npx", ["oxlint", "--type-aware", "-f", "json", "."], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const isLintFailure = error instanceof Error && "stdout" in error;
    if (!isLintFailure) throw error;
    return String(error.stdout);
  }
}

function buildOverrides(report: z.infer<typeof reportSchema>) {
  const rulesByFile = new Map<string, Set<string>>();
  for (const { code, filename } of report.diagnostics) {
    const rules = rulesByFile.get(filename) ?? new Set<string>();
    rules.add(toRuleName(code));
    rulesByFile.set(filename, rules);
  }
  return [...rulesByFile.keys()].sort().map((filename) => ({
    files: [filename],
    rules: Object.fromEntries(
      [...(rulesByFile.get(filename) ?? [])].sort().map((rule) => [rule, "off"])
    ),
  }));
}

const report = reportSchema.parse(JSON.parse(lintWithoutBaseline()));
const overrides = buildOverrides(report);
writeFileSync(BASELINE_PATH, `${JSON.stringify({ overrides }, null, 2)}\n`);
console.log(`Baselined ${String(overrides.length)} files.`);
