# Shallow-modules review — decisions

Review date: 2026-11-18. Each item: finding → agreed fix. Status: noted, not implemented.

## 1. Lesson action checks access per intent; two intents miss it — AGREED

`app/routes/courses.$slug.lessons.$lessonId.tsx` action (~:817). Only comment and
bookmark/note intents call `requireContentAccess`; `mark-complete` and `submit-quiz`
only check sign-in, and nothing scopes `lessonId` to the course in the URL (except the
bookmark branch). Any signed-in user can record progress / quiz attempts on any course.

**Fix:** add `requireLessonAccess(request, slug, lessonId) → { access, course, lesson }`
to `app/lib/access.server.ts` (404 unknown course or lesson-not-in-course, 401 signed
out, 403 no content access). Call it once at the top of the action; drop the per-intent
`requireContentAccess` calls, the bookmark branch's own scoping block, and the separate
sign-in check. Quiz-belongs-to-lesson scoping goes with item 4 (`submitQuizAttempt`).

**Tests first (/tdd):** unenrolled user → 403 on `mark-complete` and `submit-quiz`;
lesson from another course → 404.

## 2. Routes rebuild the access checks by hand — AGREED

7 instructor routes and 4 admin routes hand-roll sign-in → role → course → ownership
checks (loader and action each) instead of using `access.server.ts`. The 401/403 wording
differs per copy; the same route parses `courseId` with `parseInt` in the loader and zod in
the action.

**Fix (in `app/lib/access.server.ts`):**
- `requireCourseStaff(request, params.courseId) → { access, course }` — zod-parses the
  param; 400/401/403/404. Used by `instructor.$courseId*.tsx`.
- `requireAdmin(request) → { userId, user }` — new; replaces the copies in
  `admin.courses/users/categories.tsx` and `requirePlatformAdmin` in `admin.refunds.tsx`.
- Adopt existing `requireInstructorOrAdmin` in `instructor.tsx`, `instructor.new.tsx`.
- `requireStaff` / `requireContentAccess` call `requireUserId` → one 401 message.

**Decision:** ownership is the rule (admin, or the course's `instructorId`), as in
`requireStaff`. Drop the extra "role must be Instructor" check the hand-rolled copies have.

## 3. Lesson progress copy-pasted into 6 routes — AGREED

`calculateProgress` + `getCourseLessonIds` are byte-identical in `courses.tsx`,
`dashboard.tsx`, `layout.app.tsx`, `courses.$slug.tsx`, `instructor.$courseId.tsx`,
`instructor.$courseId.students.tsx`. Every call passes `weightByDuration = false`, so the
weighted branch (and its `?? 1` duration rule) is dead. 12× `or(...)!` breaks the no-`!`
standard. 3 queries per call; the two roster pages call it per student (N+1).

**Fix:** new `app/lib/progress.server.ts`:
- `getCourseProgress(db, userId, courseId) → number` (0–100, by lesson count)
- `getCourseProgressForUsers(db, courseId, userIds) → Map<number, number>` (one grouped
  query; used by the two roster pages)
- `getCourseLessonIds(db, courseId) → number[]` (one join, no `!`)

Delete the six copies. **Decision: remove the weighted mode entirely** (unused).
`instructor.analytics.tsx` progress code is handled in item 5.

**Tests first:** empty course, partial, complete; batch variant matches single.

## 4. Quiz grading lives in the lesson route — AGREED

`computeResult` in `courses.$slug.lessons.$lessonId.tsx:464-567`. Bugs: ignores
`quizzes.passingScore` (hard-coded `> 0.7`); `>` fails exactly-at-threshold; `quizId` from
raw formData never scoped to the lesson; attempt + answers inserted without a transaction.
Also 5× `any`, catch-all → `null` → 500, duplicate MC/TF branches with per-question
queries, answers hand-parsed without zod.

**Fix:** new `app/lib/quizzes.server.ts`:
- `submitQuizAttempt(db, { userId, lessonId, quizId, answers }) → QuizResult` — 404 unless
  quiz belongs to lesson; one query for questions + correct options;
  `passed = score >= quiz.passingScore`; attempt + answers in one transaction; typed result.
- Pure `scoreQuiz(questions, answers)` for DB-free tests.
- Route parses with a zod `submitQuizSchema` and calls the module.

**Decision: drop the A–F letter grade** (`calculateGrade`, `grade` field, UI at ~:1583).
Show percentage + passed/failed only.

**Tests first:** exactly at threshold passes, custom passing score, no answers, zero
questions, quiz from another lesson → 404.

## 5. Two routes hold whole domain modules — AGREED

### 5a. `instructor.$courseId.tsx` (2,264 lines) → `app/lib/course-editor.server.ts`
~25 private Drizzle helpers (:62-550) + 15-branch intent chain (:685-850). The
"module/lesson belongs to this course" check is hand-written 7×; not-found is *returned*
as 404 instead of thrown; `reorder-*` `JSON.parse` into `number[]` without zod and
`reorderModules` doesn't validate the id set; `moveLessonToModule` (3 updates) and
`deleteModule` (2 deletes) aren't transactional.

**Fix:** module functions all scoped by `courseId`, throw 404 when the module/lesson isn't
in the course: `renameModule`, `deleteModule` (tx), `addLesson`, `renameLesson`,
`deleteLesson`, `reorderModules` (validates id set), `reorderLessons`, `moveLesson` (tx),
`getCourseEditorData` (uses item 3 batch progress). Action = `requireCourseStaff` (item 2)
→ zod discriminated union on `intent` → one call per intent. UI stays in the route.

**Decision: merge the six `update-*` intents** (title, description, status, price,
ppp-enabled, sales-copy) into one `updateCourseDetails(db, courseId, patch)`.

### 5b. `instructor.analytics.tsx` (:201-797) → `app/lib/analytics.server.ts`
~600 lines of revenue/buyers/ratings/funnel/quiz/country SQL in the route; `lib/analytics.ts`
only formats. **Fix:** move queries into `analytics.server.ts` behind
`getInstructorAnalytics(db, instructorId, range, courseId?)` (one function per panel);
route keeps param parsing, access, UI. Progress parts use item 3's module. Add tests for
the revenue maths.

## 6. Pricing chain in `ppp.ts` — AGREED

`ppp.ts` exports 4 stacked one-liners; 5 call sites (`courses.tsx:315`,
`courses.$slug.tsx:428`, `courses.$slug.purchase.tsx:272` loader + `:314` action — the
charged price) hand-write `pppEnabled ? calculatePppPrice(...) : price`. The "PPP applies"
rule also lives inside `checkPppAccess`. `tierInfo` is computed regardless of `pppEnabled`.
(Withdrawn: `getDevCountry` in home/layout is only the DevUI picker — fine.)

**Fix:** pure `priceFor(course, country) → { price, discountApplied, tier, discount, label }`.
Make `getTierForCountry` / `calculatePppPrice` private; keep `getCountryTierInfo` for the
DevUI; `checkPppAccess` and `priceFor` share one private "PPP applies" helper. Routes:
`resolveCountry` → `priceFor`. Tests in `ppp.test.ts`: disabled, free, tier 1, tier 4.

## 7. `formatDuration` flags no caller varies — AGREED

`app/lib/utils.ts:52` `formatDuration(minutes, showHours, showSeconds, padZeros)`; all 12
call sites in 6 routes pass `true, false, false`. Dead `showSeconds` / `padZeros` /
no-hours branches; untested.

**Fix:** `formatDuration(minutes)` (h/m only); update 12 call sites. **Tests first:**
0 → `0m`, 45 → `45m`, 60 → `1h`, 90 → `1h 30m`.

## 8. Enrolment two-step → really: purchase flow lives in the route — AGREED

Original finding dropped: `enrollStudentInTransaction` + notify has one caller
(`seat-claims.server.ts`), which already hides the order behind public `claimSeat` /
private `claimSeatInTransaction`. Fine as is.

Real issue: `courses.$slug.purchase.tsx:319-334` does `createPurchase` then `enrollStudent`
as separate writes (no shared transaction) → enrol failure (e.g. double-submit race)
leaves a Purchase with no Enrollment. Already-enrolled check duplicated in route + lib.
No lib module or tests for the money flow.

**Fix:** new `app/lib/purchases.server.ts`, shaped like `claimSeat`:
- `purchaseCourse(db, { userId, course, country, now, notifications })` — one tx:
  already-enrolled check → `createPurchase` (price via item 6 `priceFor`) →
  `enrollStudentInTransaction`; after commit `notifyInstructorOfEnrollment`.
- **Decision: include team purchase** — `purchaseTeamLicence(db, { userId, course,
  country, quantity, now })` replaces route-level `createTeamPurchase` + price × quantity.
- Route action: `resolveCountry` → module call → redirect.

**Tests first:** success creates both rows + notifies; already enrolled → no purchase row;
enrol failure rolls back the purchase; team licence total = priceFor × quantity.

## 9. Small wrappers and duplicates — AGREED (a–e), f left alone

- **a.** `type Db = BetterSQLite3Database<typeof schema>` in 7 lib files, `Tx` derived in 2
  → export `Db` and `Tx` once from `app/db/index.ts`.
- **b.** `validation.ts` `parseFormData` / `parseJsonBody` share an identical
  error-flattening block → private `firstFieldErrors(error)`.
- **c.** `markdown.server.ts` and `comment-markdown.server.ts` each create their own Shiki
  highlighter → one shared lazy `getHighlighter()`; trusted/untrusted render rules stay
  separate.
- **d.** Inline `archiveForCommentSafely` (one caller, `comments.server.ts:241`).
- **e.** `toNotificationPerson` exists because `refunds.server.ts` loads full `users` rows →
  use `findNotificationPerson` where only a notification person is needed; delete
  `toNotificationPerson`.
- **f.** `timeAgo` in `notification-feed.tsx` — **leave**: deliberately compact format;
  sharing would need a flag.

---

## Suggested order

Dependencies: 1 → 4 (lesson scoping); 2 → 5a (`requireCourseStaff`); 3 → 5a, 5b
(progress); 6 → 8 (`priceFor`); 9a → everything that adds a lib module.

1. **9a** — `Db`/`Tx` types (tiny, unblocks the rest)
2. **1** — `requireLessonAccess` (security gap)
3. **4** — `submitQuizAttempt` (bugs: pass mark, quiz scoping)
4. **2** — `requireCourseStaff` / `requireAdmin`
5. **6** → **8** — `priceFor`, then `purchaseCourse` / `purchaseTeamLicence` (money)
6. **3** — `progress.server.ts`
7. **5a**, **5b** — course editor, analytics
8. **7**, **9b–e** — independent cleanup, any time
