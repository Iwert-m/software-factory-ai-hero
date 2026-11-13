import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
  useNotificationStore,
} from "@knocklabs/react";
import type { FeedItem as KnockFeedItem } from "@knocklabs/client";
import { Bell, Check, CheckCheck, Inbox, X } from "lucide-react";
import { buildFeedView } from "~/lib/feed-view";
import { cn, formatRelativeTime } from "~/lib/utils";

type NotificationsProps = {
  userId: number;
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
};

const notificationData = z.object({ body: z.string(), url: z.string() });

/** Bell, badge and drawer. Only render this for a signed-in person. */
export function Notifications({
  userId,
  publicApiKey,
  feedChannelId,
  userToken,
}: NotificationsProps) {
  // Knock's client needs the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <KnockProvider
      apiKey={publicApiKey}
      user={{ id: String(userId) }}
      userToken={userToken}
    >
      <KnockFeedProvider feedId={feedChannelId}>
        <BellAndDrawer />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function BellAndDrawer() {
  const { feedClient } = useKnockFeed();
  const items = useNotificationStore(feedClient, (state) => state.items);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");

  useEffect(() => {
    feedClient.fetch();
  }, [feedClient]);

  const view = buildFeedView<KnockFeedItem>(items, new Date());
  const shown = tab === "unread" ? view.unread : view.visible;

  function open(item: KnockFeedItem) {
    const data = notificationData.safeParse(item.data);
    feedClient.markAsRead(item);
    setIsOpen(false);
    if (data.success) navigate(data.data.url);
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative rounded-md p-2 hover:bg-accent"
        aria-label={
          view.badgeLabel
            ? `Notifications, ${view.unreadCount} unread`
            : "Notifications"
        }
      >
        <Bell className="size-5" />
        {view.badgeLabel && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {view.badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setIsOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-screen w-[28rem] max-w-full flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 border-b px-5 py-2">
              {(["unread", "all"] as const).map((tabName) => (
                <button
                  key={tabName}
                  onClick={() => setTab(tabName)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    tab === tabName
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  {tabName === "unread" ? `Unread (${view.unreadCount})` : "All"}
                </button>
              ))}
              {view.unreadCount > 0 && (
                <button
                  onClick={() => feedClient.markAllAsRead()}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <CheckCheck className="size-3.5" /> Mark all as read
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {shown.length === 0 && (
                <div className="flex flex-col items-center gap-2 pt-16 text-sm text-muted-foreground">
                  <Inbox className="size-8" />
                  {tab === "unread" ? "You're all caught up" : "No Notifications"}
                </div>
              )}
              {shown.map((item) => {
                const data = notificationData.safeParse(item.data);
                const isUnread = item.read_at === null;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border p-3",
                      isUnread && "border-blue-600/40 bg-blue-600/5"
                    )}
                  >
                    <button
                      onClick={() => open(item)}
                      className="w-full text-left"
                    >
                      <div className={cn("text-sm", isUnread && "font-semibold")}>
                        {data.success ? data.data.body : "Notification"}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span suppressHydrationWarning>
                        {formatRelativeTime(item.inserted_at)}
                      </span>
                      {isUnread ? (
                        <button
                          onClick={() => feedClient.markAsRead(item)}
                          className="flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-accent"
                        >
                          <Check className="size-3" /> Mark as read
                        </button>
                      ) : (
                        <span>Read</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
