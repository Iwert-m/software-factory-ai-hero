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

## `refund-request-decided`

- Sent when a Platform Admin approves or declines a Refund Request, to the
  buyer of that Purchase (the Student for an Individual Purchase, the Team
  Admin for a Team Licence). Not sent to a Platform Admin deciding on their own
  Purchase, nor for a losing or failed decision.
- Channel: in-app feed only.
- Template: body `{{ body }}`, link `{{ url }}` (the Purchase page,
  `/purchases/<id>`). The body says "approved", or "declined: “<note>”".
- Data sent: `body`, `url`.
