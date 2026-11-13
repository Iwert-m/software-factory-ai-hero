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
