import { getTierForCountry } from "~/lib/ppp";

// ─── Country Lock ───
// A Purchase made at a Purchasing-Power Price only gives Course Access from
// the country it was made in. See GLOSSARY.md.

type LockedCourse = { price: number; pppEnabled: boolean };

/**
 * The Purchase country when the viewer is Country-Locked, otherwise null.
 *
 * Never locks a free course, a course with Purchasing-Power Price turned off,
 * a full-price Purchase, a Purchase with no recorded country (ADR-0009), or a
 * viewer whose current country is unknown (ADR-0012).
 */
export function countryLock(
  course: LockedCourse,
  purchaseCountry: string | null,
  currentCountry: string | null
): { purchaseCountry: string; currentCountry: string } | null {
  if (course.price <= 0 || !course.pppEnabled) return null;
  if (!purchaseCountry || !currentCountry) return null;
  if (getTierForCountry(purchaseCountry) === 1) return null;
  if (currentCountry === purchaseCountry) return null;
  return { purchaseCountry, currentCountry };
}
