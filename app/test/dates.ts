/**
 * Test dates are computed relative to a base (usually `new Date()`), never
 * written as calendar literals. A literal date silently ages: once the real
 * clock passes it, any comparison with code that reads the clock flips.
 * `app/test/no-literal-dates.test.ts` enforces this.
 */
export function addDays(date: Date, days: number): Date {
  const when = new Date(date);
  when.setDate(when.getDate() + days);
  return when;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
