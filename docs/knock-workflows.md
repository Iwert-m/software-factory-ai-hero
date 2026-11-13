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
