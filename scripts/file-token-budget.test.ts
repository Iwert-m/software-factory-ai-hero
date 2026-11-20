import { describe, expect, it } from "vitest";

import {
  buildBaseline,
  findOverBudget,
  isExemptFromBudget,
} from "./file-token-budget";

const LIMIT = 100;

describe("findOverBudget", () => {
  it("accepts a file at the limit", () => {
    const counts = [{ path: "app/a.ts", tokens: LIMIT }];
    expect(findOverBudget({ counts, baseline: {}, limit: LIMIT })).toEqual([]);
  });

  it("refuses a new file over the limit", () => {
    const counts = [{ path: "app/a.ts", tokens: LIMIT + 1 }];
    expect(findOverBudget({ counts, baseline: {}, limit: LIMIT })).toEqual([
      { path: "app/a.ts", tokens: LIMIT + 1, allowed: LIMIT },
    ]);
  });

  it("lets a baselined file stay at its recorded size", () => {
    const counts = [{ path: "app/big.ts", tokens: 300 }];
    const baseline = { "app/big.ts": 300 };
    expect(findOverBudget({ counts, baseline, limit: LIMIT })).toEqual([]);
  });

  it("refuses a baselined file that grows", () => {
    const counts = [{ path: "app/big.ts", tokens: 301 }];
    const baseline = { "app/big.ts": 300 };
    expect(findOverBudget({ counts, baseline, limit: LIMIT })).toEqual([
      { path: "app/big.ts", tokens: 301, allowed: 300 },
    ]);
  });
});

describe("buildBaseline", () => {
  it("records only the files over the limit, sorted by path", () => {
    const counts = [
      { path: "b.ts", tokens: 200 },
      { path: "small.ts", tokens: 50 },
      { path: "a.ts", tokens: 150 },
    ];
    expect(Object.entries(buildBaseline(counts, LIMIT))).toEqual([
      ["a.ts", 150],
      ["b.ts", 200],
    ]);
  });
});

describe("isExemptFromBudget", () => {
  it.each([
    "package-lock.json",
    "drizzle/0001_init.sql",
    "drizzle/meta/0001_snapshot.json",
    "eslint-suppressions.json",
    "file-token-baseline.json",
  ])("exempts generated file %s", (path) => {
    expect(isExemptFromBudget(path)).toBe(true);
  });

  it("holds source files to the budget", () => {
    expect(isExemptFromBudget("app/routes/courses.tsx")).toBe(false);
  });
});
