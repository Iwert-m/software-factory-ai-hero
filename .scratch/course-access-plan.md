# Course Access package — decisions

Date: 2026-11-20. Status: agreed, not implemented.
Source: architecture review of `app/lib/access.server.ts` (candidate 1, with candidate 2's
lesson-scoped interface), followed by a design-it-twice pass (design C picked).

Supersedes items 1 and 2 of `shallow-modules-review.md` (2026-11-18) where they conflict:
access moves into a package rather than growing `app/lib/access.server.ts`.

## Why

`access.server.ts` has no tests and can't easily get any: it imports the shared `db`, reads
the session cookie, and works out the country itself. Only 4 routes use it, and the lesson
route has three access bugs:

- The loader sends lesson body, video, repo link and quiz to everyone, including signed-out,
  unenrolled, Lapsed and Country-Locked visitors. Only comments, bookmark and note are gated.
- `mark-complete` and `submit-quiz` only check sign-in, and `api.video-tracking` does the same.
  Any signed-in user can write progress, quiz attempts and Watched time for any lesson.
- Comment intents check the course from the URL slug but not that the lesson belongs to it.
  Enrolled in course A → can comment on course B's lessons via `/courses/A/lessons/<B-lesson>`.

## Package: `app/packages/course-access/`

- Entry point: `service.server.ts` only. Implementation in `lib/`, tests in `tests/`
  (follow `instructor-analytics/`).
- `db` is injected (same `Db` type as instructor-analytics). Never sees a `Request`, never
  throws HTTP errors; returns values. Synchronous.
- Viewer arrives already worked out: `{ userId: number | null; country: string | null }`.

### Interface (design C)

```ts
export type Viewer    = { userId: number | null; country: string | null };
export type LessonRef = { courseId: number; lessonId: number };

export type Refusal =
  | { reason: "signed-out" }
  | { reason: "not-found" }            // course missing, or lesson not in that course
  | { reason: "no-enrollment"; userId: number }
  | { reason: "country-lock"; userId: number; purchaseCountry: string; currentCountry: string }
  | { reason: "not-course-staff"; userId: number }
  | { reason: "not-instructor"; userId: number };

export function lessonAccess(db, viewer, lesson: LessonRef):
  { ok: true; userId; canModerate; tracksProgress }
  | Refused<"signed-out" | "not-found" | "no-enrollment" | "country-lock">;

export function courseStaffAccess(db, viewer, courseId):
  { ok: true; userId; isAdmin } | Refused<"signed-out" | "not-found" | "not-course-staff">;

export function instructorAccess(db, viewer):
  { ok: true; userId; isAdmin } | Refused<"signed-out" | "not-instructor">;
```

Sketch, not final. Each function's return type lists only the refusals it can produce.

- `canModerate`: owning Instructor or Platform Admin.
- `tracksProgress`: has an Enrollment (mark in progress, record Watched time).

**Invariants**
- `ok: true` always carries a real `userId`. A refusal never carries content.
- Check order: not-found → signed-out → staff → Enrollment → Country Lock.
- A `userId` with no user row counts as signed-out.
- Staff never get `no-enrollment` or `country-lock`.

**Behind the seam:** user and role lookup, course ownership, lesson → module → course
membership, Enrollment lookup, Purchase lookup for the purchase country, the Country Lock
rule (`checkPppAccess`, moved here), and the order of checks.

## Route adapter: `app/lib/course-access.server.ts`

- `viewerOf(request)`: `getCurrentUserId` + `resolveCountry`.
- One table mapping every `Refusal` reason to a status (401 / 404 / 403) and one message each.
- Exports `requireLessonAccess`, `requireCourseStaff`, `requireInstructor`,
  `getLessonAccess` (throws only on not-found; returns the refusal as the paywall reason),
  and `requireUserId` (session only, no db).
- Delete `app/lib/access.server.ts`; no re-export.

## Callers in this change

- **`courses.$slug.lessons.$lessonId.tsx` loader:** `getLessonAccess`. Without Course
  Access, send title and outline only (no body, video, repo link, quiz). Mark in progress
  only when `ok && tracksProgress`. `canModerate` from the result.
- **Same route, action:** one `requireLessonAccess` at the top for every intent (comments,
  bookmark, note, mark-complete, submit-quiz). Drop the separate `getCurrentUserId` check,
  the per-intent `requireContentAccess` calls and `requireLessonInCourse`.
- **`api.video-tracking.ts`:** `requireLessonAccess`. `app/components/youtube-player.tsx`
  sends `courseId` with `lessonId`.
- **`instructor.questions.tsx`:** loader `requireInstructor`, action `requireCourseStaff`
  (drop the dead `if (!authorId)` check).
- **`instructor.analytics.tsx`:** `requireInstructor`; result is the `AnalyticsViewer`.
- **`saved.tsx`:** `requireUserId` from the adapter.

## Rules settled

- Owning a course (`course.instructorId`) is enough to count as staff, whatever the role.
- Country Lock keeps today's Purchase lookup (any Purchase for user + course). Pin it with
  a test; the fix is follow-up candidate 4.
- Not-found is checked before signed-out.
- `checkPppAccess` moves into the package's `lib/`. Its cases in `ppp.test.ts` are rewritten
  as tests through `service.server.ts`. Pricing functions stay in `app/lib/ppp.ts`.

## Deliberate behaviour changes

- Country-Locked Students are no longer marked in progress.
- A lesson outside its course gets 404 even when signed out (was 401).
- `mark-complete`, `submit-quiz` and video-tracking return 401/403/404 without Course Access.
- Lesson content is no longer in the loader payload without Course Access.

## Tests

Through `service.server.ts` only, with `createTestDb()` + `seedBaseData()`, as one table:
signed-out; deleted user; Student without Enrollment; Student with Enrollment; Country Lock
(Purchasing-Power Price purchase viewed from another country, same country, unknown current
country, free course, Purchasing-Power Price off); Purchase lookup pinned as today; owning
Instructor without Enrollment; another Instructor; Platform Admin; lesson in another course;
missing course. Write them first (/tdd).

## Glossary

Added to `GLOSSARY.md`: **Course Access**, **Purchasing-Power Price**, **Country Lock**.

## Follow-ups (not in this change)

1. **Move the ~20 hand-written checks** to the package (candidate 3): `admin.*.tsx`,
   `instructor.$courseId*.tsx`, `instructor.tsx`, `instructor.new.tsx`, the local
   `isUserEnrolled` in `courses.$slug.tsx` / `courses.$slug.$moduleId.tsx` /
   `courses.$slug.welcome.tsx`, and the bare 401 checks. Add named entry points as needed
   (e.g. an "Enrollment, Country Lock or not" check for the rating action).
2. **Decide which Purchase sets the Country Lock** (candidate 4): today it can pick a Team
   Licence the Student bought for others, and a Claimed Seat is never locked after claiming.
   Domain decision; constrained by ADR-0004 and ADR-0009.
