// PROTOTYPE — throwaway. Three structurally different answers to
// "Where and how do Notifications show up, and how does marking Read work?"
//   A  Sidebar bell → compact dropdown. Live arrival: badge bumps + pulses, no toast.
//   B  Top bar bell → full-height slide-over drawer with Unread/All tabs. Live arrival: toast.
//   C  Sidebar nav entry "Notifications" → full page inbox. Live arrival: banner on the page you're on.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, Inbox, X } from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { groupByDay, useNotificationsProto, type ProtoNotification } from "./store";

export const VARIANTS = [
  { key: "A", name: "Sidebar bell + dropdown" },
  { key: "B", name: "Top bar + drawer + toast" },
  { key: "C", name: "Nav entry + full page" },
];

function useOpenNotification() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { markRead } = useNotificationsProto();
  return (n: ProtoNotification) => {
    markRead(n.id); // opening it = Read
    navigate(`${n.url}?variant=${params.get("variant") ?? "A"}`);
  };
}

function Badge({ count, pulse }: { count: number; pulse?: boolean }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white",
        pulse && "animate-bounce"
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ───────────────────────── Variant A ─────────────────────────

export function BellDropdownA() {
  const { items, unreadCount, markRead, markAllRead, allowMarkAll, lastArrivalId } = useNotificationsProto();
  const open = useOpenNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lastArrivalId) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 2000);
    return () => clearTimeout(t);
  }, [lastArrivalId]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
        title="Notifications"
      >
        <Bell className="size-4" />
        <Badge count={unreadCount} pulse={pulse} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {allowMarkAll && unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No Notifications</li>}
            {items.map((n) => (
              <li key={n.id} className={cn("group flex items-start gap-2 border-b px-3 py-2.5 last:border-0", !n.read && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-blue-600")} />
                <button onClick={() => { open(n); setIsOpen(false); }} className="flex-1 text-left">
                  <div className={cn("text-sm", !n.read && "font-semibold")}>{n.body}</div>
                  <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatRelativeTime(n.createdAt)}
                  </div>
                </button>
                {!n.read && (
                  <button
                    onClick={() => markRead(n.id)}
                    title="Mark as read"
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Variant B ─────────────────────────

export function TopBarB({ children }: { children: React.ReactNode }) {
  const { items, unreadCount, markRead, markAllRead, allowMarkAll, lastArrivalId } = useNotificationsProto();
  const open = useOpenNotification();
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const seen = useRef<string | null>(lastArrivalId);

  useEffect(() => {
    if (!lastArrivalId || seen.current === lastArrivalId) return;
    seen.current = lastArrivalId;
    const n = items.find((x) => x.id === lastArrivalId);
    if (!n) return;
    toast(n.body, {
      icon: <Bell className="size-4" />,
      action: { label: "Open", onClick: () => open(n) },
      duration: 8000,
    });
  }, [lastArrivalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = tab === "unread" ? items.filter((n) => !n.read) : items;

  return (
    <div className="flex h-screen flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b px-6">
        <button onClick={() => setDrawer(true)} className="relative rounded-md p-2 hover:bg-accent" title="Notifications">
          <Bell className="size-5" />
          <Badge count={unreadCount} />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>

      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawer(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-screen w-[28rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button onClick={() => setDrawer(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 border-b px-5 py-2">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn("rounded-full px-3 py-1 text-sm capitalize", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                >
                  {t === "unread" ? `Unread (${unreadCount})` : "All"}
                </button>
              ))}
              {allowMarkAll && unreadCount > 0 && (
                <button onClick={markAllRead} className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                  <CheckCheck className="size-3.5" /> Mark all as read
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {shown.length === 0 && (
                <div className="flex flex-col items-center gap-2 pt-16 text-sm text-muted-foreground">
                  <Inbox className="size-8" /> {tab === "unread" ? "You're all caught up" : "No Notifications"}
                </div>
              )}
              {shown.map((n) => (
                <div key={n.id} className={cn("rounded-lg border p-3", !n.read && "border-blue-600/40 bg-blue-600/5")}>
                  <button onClick={() => { open(n); setDrawer(false); }} className="w-full text-left">
                    <div className={cn("text-sm", !n.read && "font-semibold")}>{n.body}</div>
                  </button>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span suppressHydrationWarning>{formatRelativeTime(n.createdAt)}</span>
                    {!n.read ? (
                      <button onClick={() => markRead(n.id)} className="flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-accent">
                        <Check className="size-3" /> Mark as read
                      </button>
                    ) : (
                      <span>Read</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Variant C ─────────────────────────

export function NavEntryC() {
  const { unreadCount } = useNotificationsProto();
  return (
    <NavLink
      to="/notifications-prototype?variant=C"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {unreadCount > 0 && (
        <span className="ml-auto rounded-full bg-blue-600 px-2 text-xs font-semibold text-white">{unreadCount}</span>
      )}
    </NavLink>
  );
}

export function ArrivalBannerC() {
  const { lastArrivalId, items } = useNotificationsProto();
  const navigate = useNavigate();
  const [shownId, setShownId] = useState<string | null>(null);
  const seen = useRef<string | null>(lastArrivalId);

  useEffect(() => {
    if (!lastArrivalId || seen.current === lastArrivalId) return;
    seen.current = lastArrivalId;
    setShownId(lastArrivalId);
  }, [lastArrivalId]);

  const n = items.find((x) => x.id === shownId);
  if (!n) return null;
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-blue-600/30 bg-blue-600/10 px-6 py-2 text-sm">
      <Bell className="size-4 text-blue-600" />
      <span className="flex-1 truncate">{n.body}</span>
      <button onClick={() => { setShownId(null); navigate("/notifications-prototype?variant=C"); }} className="font-medium text-blue-600 hover:underline">
        View all
      </button>
      <button onClick={() => setShownId(null)} className="rounded p-0.5 hover:bg-blue-600/10">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function InboxPageC() {
  const { items, unreadCount, markRead, markAllRead, allowMarkAll } = useNotificationsProto();
  const open = useOpenNotification();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount} Unread · Notifications are removed after 60 days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "unread")} className="rounded-md border bg-background px-2 py-1 text-sm">
            <option value="all">All</option>
            <option value="unread">Unread only</option>
          </select>
          {allowMarkAll && unreadCount > 0 && (
            <button onClick={markAllRead} className="rounded-md border px-3 py-1 text-sm hover:bg-accent">
              Mark all as read
            </button>
          )}
        </div>
      </div>
      {groupByDay(shown).map((g) => (
        <section key={g.label} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
          <table className="w-full text-sm">
            <tbody>
              {g.items.map((n) => (
                <tr key={n.id} className={cn("border-b", !n.read && "bg-blue-600/5")}>
                  <td className="w-6 py-3 pl-2">
                    {!n.read && <span className="block size-2 rounded-full bg-blue-600" />}
                  </td>
                  <td className="py-3">
                    <button onClick={() => open(n)} className={cn("text-left hover:underline", !n.read && "font-semibold")}>
                      {n.body}
                    </button>
                  </td>
                  <td className="w-24 whitespace-nowrap py-3 text-right text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatRelativeTime(n.createdAt)}
                  </td>
                  <td className="w-32 py-3 pr-2 text-right">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} className="text-xs text-primary hover:underline">
                        Mark as read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {shown.length === 0 && <p className="py-16 text-center text-muted-foreground">Nothing here.</p>}
    </div>
  );
}

// ───────────────────── Prototype controls ─────────────────────

export function ProtoControls() {
  const { simulateArrival, reset, allowMarkAll, setAllowMarkAll, unreadCount, items } = useNotificationsProto();
  return (
    <>
      <button onClick={() => simulateArrival()} className="rounded-full bg-fuchsia-600 px-3 py-0.5 text-xs font-medium hover:bg-fuchsia-500">
        Simulate arrival
      </button>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={allowMarkAll} onChange={(e) => setAllowMarkAll(e.target.checked)} />
        Mark all
      </label>
      <button onClick={reset} className="text-xs text-white/60 hover:text-white">reset</button>
      <span className="font-mono text-xs text-white/60">
        {unreadCount} unread / {items.length}
      </span>
    </>
  );
}
