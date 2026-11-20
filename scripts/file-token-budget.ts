export const TOKEN_LIMIT = 5000;

export const BASELINE_PATH = "file-token-baseline.json";

const EXEMPT_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)skills-lock\.json$/,
  /^drizzle\//,
  /_snapshot\.json$/,
  /^oxlint-baseline\.json$/,
  /^file-token-baseline\.json$/,
];

export interface TokenCount {
  path: string;
  tokens: number;
}

export type Baseline = Record<string, number>;

export interface BudgetViolation {
  path: string;
  tokens: number;
  allowed: number;
}

interface BudgetInput {
  counts: TokenCount[];
  baseline: Baseline;
  limit: number;
}

export function isExemptFromBudget(path: string) {
  return EXEMPT_PATTERNS.some((pattern) => pattern.test(path));
}

// A file already over the limit when the check arrived may stay at its
// recorded size while it waits to be split, but it may not grow.
export function findOverBudget({ counts, baseline, limit }: BudgetInput) {
  return counts.flatMap(({ path, tokens }): BudgetViolation[] => {
    const allowed = Math.max(limit, baseline[path] ?? 0);
    return tokens > allowed ? [{ path, tokens, allowed }] : [];
  });
}

export function buildBaseline(counts: TokenCount[], limit: number): Baseline {
  const overLimit = counts
    .filter(({ tokens }) => tokens > limit)
    .sort((left, right) => left.path.localeCompare(right.path));
  return Object.fromEntries(
    overLimit.map(({ path, tokens }) => [path, tokens])
  );
}
