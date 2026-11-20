import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { countTokens } from "gpt-tokenizer";
import { z } from "zod";

import {
  BASELINE_PATH,
  buildBaseline,
  findOverBudget,
  isExemptFromBudget,
  TOKEN_LIMIT,
  type TokenCount,
} from "./file-token-budget";

// Usage:
//   tsx scripts/check-file-tokens.ts                    every tracked file
//   tsx scripts/check-file-tokens.ts --staged           the staged versions
//   tsx scripts/check-file-tokens.ts --update-baseline  re-record the baseline

const baselineSchema = z.record(z.number().int().nonnegative());

function git(args: string[]) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function listPaths(isStaged: boolean) {
  const output = isStaged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    : git(["ls-files", "-z"]);
  return output
    .split("\0")
    .filter((path) => path !== "" && !isExemptFromBudget(path));
}

function readContent(path: string, isStaged: boolean) {
  if (isStaged) return git(["show", `:${path}`]);
  const isFile = existsSync(path) && statSync(path).isFile();
  return isFile ? readFileSync(path, "utf8") : "";
}

function countFileTokens(isStaged: boolean): TokenCount[] {
  return listPaths(isStaged).flatMap((path) => {
    const content = readContent(path, isStaged);
    const isBinary = content.includes("\0");
    return isBinary ? [] : [{ path, tokens: countTokens(content) }];
  });
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  const json: unknown = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  return baselineSchema.parse(json);
}

function updateBaseline() {
  const baseline = buildBaseline(countFileTokens(false), TOKEN_LIMIT);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  const fileCount = Object.keys(baseline).length;
  console.log(`Recorded ${String(fileCount)} files over the limit.`);
}

function check(isStaged: boolean) {
  const violations = findOverBudget({
    counts: countFileTokens(isStaged),
    baseline: readBaseline(),
    limit: TOKEN_LIMIT,
  });
  if (violations.length === 0) return;

  console.error(`Files over the ${String(TOKEN_LIMIT)}-token budget:\n`);
  for (const { path, tokens, allowed } of violations) {
    console.error(
      `  ${path}: ${String(tokens)} tokens (allowed ${String(allowed)})`
    );
  }
  console.error(
    "\nSplit each file into smaller ones, along a seam in what it does." +
      `\nA file listed in ${BASELINE_PATH} may not grow while it waits to be split.`
  );
  process.exitCode = 1;
}

const flags = new Set(process.argv.slice(2));
if (flags.has("--update-baseline")) {
  updateBaseline();
} else {
  check(flags.has("--staged"));
}
