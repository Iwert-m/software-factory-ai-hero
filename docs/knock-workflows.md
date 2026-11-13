# Knock workflows

Cadence sends in-app Notifications through Knock when `KNOCK_API_KEY` is set.
Without the key, each Notification is written to `.notifications/` as a JSON
file (`kind`, `recipients`, `body`, `url`) instead.

Each Notification kind is its own Knock workflow, named after the kind. Every
workflow has only the **in-app feed** channel. The template renders
`{{ body }}` and links to `{{ url }}`. Cadence triggers the workflow and
identifies the recipients inline (`{ id, name }`), so there is no user sync.

## `new-refund-request`

- Sent when a buyer raises a Refund Request, to every Platform Admin at that
  moment except the buyer.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (the admin review page for the
  Refund Request, `/admin/refunds?refund=<id>`).
- Data sent: `body`, `url`.

## `seat-claimed`

- Sent when a Student claims a Seat on a Team Licence, to the Team Licence's
  buyer (the Team Admin). Not sent when the buyer claims their own Seat, and
  not sent for the last Seat (see `all-seats-claimed`).
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (the Team Licence's Seats page,
  `/team?licence=<purchase id>`).
- Data sent: `body` ("Robin Vos claimed a Seat on “Advanced TypeScript” (8 of
  10 claimed)"), `url`.

## `all-seats-claimed`

- Sent instead of `seat-claimed` when the last Unclaimed Seat on a Team
  Licence is claimed, to the buyer. Not sent when the buyer made that claim.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (same Seats page link).
- Data sent: `body` ("All 5 Seats on “CSS Mastery” are claimed"), `url`.

## `refund-request-decided`

- Sent when a Platform Admin approves or declines a Refund Request, to the
  buyer of that Purchase (the Student for an Individual Purchase, the Team
  Admin for a Team Licence). Not sent to a Platform Admin deciding on their own
  Purchase, nor for a losing or failed decision.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (the Purchase page,
  `/purchases/<id>`). The body says "approved", or "declined: “<note>”".
- Data sent: `body`, `url`.

## `course-status-changed`

- Sent when a Platform Admin changes a course's status (draft, published or
  archived), to the course's Instructor. Nobody is notified when the person
  changing the status is that Instructor.
- Channel: in-app feed only.
- Template: body `{{ body }}` (for example "A Platform Admin unpublished
  “React Patterns”"), link `{{ url }}` (the Instructor's course page,
  `/instructor/<courseId>`). The title is the course's title at the moment of
  the change.
- Data sent: `body`, `url`.
- The page can be opened after the course is gone or reassigned; it shows
  "Course not found" or "Access denied" (ADR 0013).

## `new-question`

- Sent when a Question is posted on a lesson, to the course's Instructor.
  Nobody is told when the Instructor asked the Question.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (the lesson, scrolled to the
  Question: `/courses/<slug>/lessons/<id>#question-<commentId>`).
- Data sent: `body`, `url`. Example body: New Question from Alex Kim on
  “Intro to state machines”.
- The link may lead to a lesson without that Question, or to the "not
  available" page (ADR 0013).

## `reply`

- Sent when a Reply is posted under a Question, to the Question's author.
  Nobody is told when the author replied to their own Question. One Reply
  makes one Notification: there is no grouping.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (same Question anchor as
  `new-question`).
- Data sent: `body`, `url`. Example body: Sarah Chen replied to your Question
  on “Hooks in depth”.
