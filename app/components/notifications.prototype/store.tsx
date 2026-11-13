// PROTOTYPE — throwaway. Answers "How do Notifications look and behave in the app?"
// (wayfinder ticket #6). In-memory fake of the Knock feed: no persistence, no Knock.
// Three variants of the app shell, switchable via `?variant=A|B|C`.
import { createContext, useContext, useState, type ReactNode } from "react";
import { UserRole } from "~/db/schema";

export type NotificationKind =
  | "refund-request-decided"
  | "reply"
  | "new-question"
  | "course-status-changed"
  | "seat-claimed"
  | "all-seats-claimed"
  | "new-refund-request";

export interface ProtoNotification {
  id: string;
  kind: NotificationKind;
  body: string;
  url: string;
  createdAt: string;
  read: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function ago(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

// The 6 first-release events, as the person in each role would see them.
const SAMPLES: Record<string, Omit<ProtoNotification, "id" | "createdAt" | "read">[]> = {
  student: [
    { kind: "reply", body: "Sarah Chen replied to your Question on “Hooks in depth”", url: "/courses" },
    { kind: "refund-request-decided", body: "Your Refund Request for “Advanced TypeScript” was approved", url: "/courses" },
    { kind: "reply", body: "Marcus Lee replied to your Question on “Server actions”", url: "/courses" },
    { kind: "refund-request-decided", body: "Your Refund Request for “CSS Mastery” was declined: “Past the 30-day window”", url: "/courses" },
  ],
  instructor: [
    { kind: "new-question", body: "New Question from Alex Kim on “Intro to state machines”", url: "/instructor/questions" },
    { kind: "course-status-changed", body: "A Platform Admin unpublished “React Patterns”", url: "/instructor" },
    { kind: "new-question", body: "New Question from Priya Shah on “Testing reducers”", url: "/instructor/questions" },
    { kind: "course-status-changed", body: "A Platform Admin published “Node for Beginners”", url: "/instructor" },
  ],
  admin: [
    { kind: "new-refund-request", body: "New Refund Request from Jordan Diaz for “Advanced TypeScript”", url: "/admin/refunds" },
    { kind: "new-refund-request", body: "New Refund Request from Acme Corp for a Team Licence of “CSS Mastery”", url: "/admin/refunds" },
    { kind: "new-refund-request", body: "New Refund Request from Taylor Brooks for “React Patterns”", url: "/admin/refunds" },
  ],
  teamAdmin: [
    { kind: "seat-claimed", body: "Robin Vos claimed a Seat on “Advanced TypeScript” (8 of 10 claimed)", url: "/team" },
    { kind: "all-seats-claimed", body: "All 5 Seats on “CSS Mastery” are claimed", url: "/team" },
    { kind: "seat-claimed", body: "Lena Peeters claimed a Seat on “Advanced TypeScript” (9 of 10 claimed)", url: "/team" },
    { kind: "refund-request-decided", body: "Your Refund Request for the “React Patterns” Team Licence was approved", url: "/team" },
  ],
};

function samplesFor(role: UserRole | null, isTeamAdmin: boolean) {
  if (isTeamAdmin) return SAMPLES.teamAdmin;
  if (role === UserRole.Instructor) return SAMPLES.instructor;
  if (role === UserRole.Admin) return SAMPLES.admin;
  return SAMPLES.student;
}

// Ages spread across the 60-day window: today, yesterday, last week, nearly expired.
const SEED_AGES = [5 * MIN, 3 * HOUR, 26 * HOUR, 4 * DAY, 12 * DAY, 58 * DAY];

function seed(role: UserRole | null, isTeamAdmin: boolean): ProtoNotification[] {
  const samples = samplesFor(role, isTeamAdmin);
  return SEED_AGES.map((age, i) => ({
    ...samples[i % samples.length],
    id: `seed-${i}`,
    createdAt: ago(age),
    read: i >= 3, // three newest Unread, the rest Read
  }));
}

interface Store {
  items: ProtoNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  simulateArrival: () => ProtoNotification;
  reset: () => void;
  allowMarkAll: boolean;
  setAllowMarkAll: (v: boolean) => void;
  lastArrivalId: string | null;
}

const Ctx = createContext<Store | null>(null);

export function NotificationsProtoProvider({
  role,
  isTeamAdmin,
  children,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
  children: ReactNode;
}) {
  const key = `${role}-${isTeamAdmin}`;
  const [state, setState] = useState(() => ({ key, items: seed(role, isTeamAdmin) }));
  const [allowMarkAll, setAllowMarkAll] = useState(true);
  const [lastArrivalId, setLastArrivalId] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);

  // Re-seed when the DevUI switches user.
  const items = state.key === key ? state.items : seed(role, isTeamAdmin);
  if (state.key !== key) setState({ key, items });

  const store: Store = {
    items,
    unreadCount: items.filter((n) => !n.read).length,
    markRead: (id) =>
      setState((s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    markAllRead: () => setState((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) })),
    simulateArrival: () => {
      const samples = samplesFor(role, isTeamAdmin);
      const n: ProtoNotification = {
        ...samples[counter % samples.length],
        id: `live-${Date.now()}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setCounter((c) => c + 1);
      setState((s) => ({ ...s, items: [n, ...s.items] }));
      setLastArrivalId(n.id);
      return n;
    },
    reset: () => setState({ key, items: seed(role, isTeamAdmin) }),
    allowMarkAll,
    setAllowMarkAll,
    lastArrivalId,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useNotificationsProto() {
  const s = useContext(Ctx);
  if (!s) throw new Error("NotificationsProtoProvider missing");
  return s;
}

/** Group by Today / Yesterday / Earlier this week / Older. */
export function groupByDay(items: ProtoNotification[]) {
  const groups: { label: string; items: ProtoNotification[] }[] = [];
  for (const n of items) {
    const age = Date.now() - new Date(n.createdAt).getTime();
    const label = age < DAY ? "Today" : age < 2 * DAY ? "Yesterday" : age < 7 * DAY ? "This week" : "Older";
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}
