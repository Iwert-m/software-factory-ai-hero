// The Notification feed as the UI shows it. Knock keeps feed items forever,
// so Cadence hides anything older than 60 days when it reads the feed.

export const FEED_CUTOFF_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The parts of a Knock feed item the view depends on. */
export type FeedItem = {
  id: string;
  inserted_at: string;
  read_at: string | null;
};

export type FeedView<T extends FeedItem> = {
  /** Newest first, with expired items removed. */
  visible: T[];
  unread: T[];
  unreadCount: number;
  /** null when the badge is hidden. */
  badgeLabel: string | null;
};

function badgeLabelFor(unreadCount: number): string | null {
  if (unreadCount === 0) return null;
  return unreadCount > 9 ? "9+" : String(unreadCount);
}

export function buildFeedView<T extends FeedItem>(
  items: readonly T[],
  now: Date
): FeedView<T> {
  const oldestShown = now.getTime() - FEED_CUTOFF_DAYS * DAY_MS;

  const insertedAt = (item: FeedItem) => new Date(item.inserted_at).getTime();

  const visible = items
    .filter((item) => insertedAt(item) >= oldestShown)
    .sort((a, b) => insertedAt(b) - insertedAt(a));
  const unread = visible.filter((item) => item.read_at === null);

  return {
    visible,
    unread,
    unreadCount: unread.length,
    badgeLabel: badgeLabelFor(unread.length),
  };
}
