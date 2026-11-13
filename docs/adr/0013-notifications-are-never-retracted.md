# Notifications are never retracted

A Notification is a snapshot of something that happened. It stays in the recipient's feed until it expires, even when its subject later disappears: a Comment is deleted, a lesson is removed, or a Student Lapses and can no longer open the lesson. Clicking it opens whatever its link leads to today, which may be a lesson without that Question or a "not available" page. Retracting it would mean every delete, removal and loss of access has to find and withdraw the matching Notifications. That is extra work for a rare case, and it would tie the Notification lifecycle to every part of Cadence that removes things.

## Considered Options

- **Retract the Notification when its subject goes away.** Rejected for the reason above.
- **Mark it as unavailable in the feed.** Rejected for the same reason: the feed would still have to learn about every removal.

## Consequences

A Notification can point to something that no longer exists. Every page a Notification links to must handle a missing subject gracefully, instead of assuming it is there.
