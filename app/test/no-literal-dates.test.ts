import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";

// A Date built from a calendar literal ages: once the real clock passes it,
// a comparison with code that reads the clock flips and the test turns flaky.
// Compute test dates from `new Date()` with the helpers in `app/test/dates.ts`.
// Freezing the clock with `vi.setSystemTime(new Date("…"))` stays allowed,
// because then nothing reads the real clock.
const LITERAL_DATE = /new Date\(\s*(\d|["'`]\d)|Date\.UTC\(/;
const FROZEN_CLOCK = /vi\.setSystemTime\(/;

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return /\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("test dates", () => {
  it("are computed, not written as calendar literals", () => {
    const offenders = testFiles(appDir).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${path.relative(appDir, file)}:${i + 1}` }))
        .filter(({ line }) => LITERAL_DATE.test(line) && !FROZEN_CLOCK.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`)
    );

    expect(
      offenders,
      "Use addDays/addHours from ~/test/dates on a `new Date()` base instead"
    ).toEqual([]);
  });
});
