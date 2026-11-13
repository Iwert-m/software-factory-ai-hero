import { describe, it, expect } from "vitest";
import { buildFeedView, type FeedItem } from "./feed-view";

const now = new Date("2026-06-30T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function item(id: string, ageMs: number, read = false): FeedItem {
  return {
    id,
    inserted_at: new Date(now.getTime() - ageMs).toISOString(),
    read_at: read ? now.toISOString() : null,
  };
}

const ids = (items: FeedItem[]) => items.map((i) => i.id);

describe("feed view", () => {
  it("keeps an item just inside 60 days", () => {
    const view = buildFeedView([item("a", 60 * DAY - 1000)], now);
    expect(ids(view.visible)).toEqual(["a"]);
  });

  it("hides an item just outside 60 days", () => {
    const view = buildFeedView([item("a", 60 * DAY + 1000)], now);
    expect(view.visible).toEqual([]);
  });

  it("lists items newest first", () => {
    const view = buildFeedView(
      [item("old", 5 * DAY), item("new", 1 * DAY), item("mid", 3 * DAY)],
      now
    );
    expect(ids(view.visible)).toEqual(["new", "mid", "old"]);
  });

  it("returns only the Unread items as unread", () => {
    const view = buildFeedView(
      [item("a", DAY, true), item("b", 2 * DAY), item("c", 3 * DAY, true)],
      now
    );
    expect(ids(view.unread)).toEqual(["b"]);
    expect(ids(view.visible)).toEqual(["a", "b", "c"]);
  });

  it("does not count expired Unread items", () => {
    const view = buildFeedView(
      [item("a", DAY), item("expired", 90 * DAY)],
      now
    );
    expect(view.unreadCount).toBe(1);
    expect(ids(view.unread)).toEqual(["a"]);
  });

  it.each([
    [0, null],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
    [25, "9+"],
  ])("labels the badge for %i Unread as %s", (count, label) => {
    const items = Array.from({ length: count }, (_, i) =>
      item(`n${i}`, i * 1000)
    );
    expect(buildFeedView(items, now).badgeLabel).toBe(label);
  });
});
