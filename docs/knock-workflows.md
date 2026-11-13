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
