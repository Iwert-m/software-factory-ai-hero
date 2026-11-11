# An approved Refund removes Access but keeps the learner's data

When an admin approves a Refund, the learner loses Access to the course, but their progress, quiz attempts, ratings and comments are kept. If the learner buys the course again, all of it comes back. We chose this over deleting the data because deletion cannot be undone, purchases are independent and a learner may well buy again, and comments and ratings are part of what other learners see.

## Consequences

- Every place that checks Access has to look at the Purchase's Refund status, not just at whether a Purchase exists.
- A learner's data outlives their Access, so a request to erase it is a separate concern from a Refund.
