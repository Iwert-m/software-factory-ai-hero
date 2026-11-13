import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";

// ─── Notifications ───
// One builder per kind decides who is told, what it says and where it links.
// Domain functions return the Notifications their action causes; the route
// sends them after the action has been saved. See GLOSSARY.md and ADR 0013.
//
// Knock delivers them when KNOCK_API_KEY is set. Without a key (local dev,
// tests) each one is written to .notifications/ as a JSON file instead.

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export type NotificationKind =
  | "refund-request-decided"
  | "reply"
  | "new-question"
  | "course-status-changed"
  | "seat-claimed"
  | "all-seats-claimed"
  | "new-refund-request";

export type Notification = {
  kind: NotificationKind;
  recipients: { id: string; name: string }[];
  body: string;
  url: string;
};

export interface NotificationSender {
  send(notification: Notification): Promise<void>;
}

// ─── Builders ───

/** The person who acted is never told about their own action. */
function everyoneBut(
  recipients: { id: number; name: string }[],
  actorId: number
): Notification["recipients"] {
  return recipients
    .filter((recipient) => recipient.id !== actorId)
    .map((recipient) => ({ id: String(recipient.id), name: recipient.name }));
}

/** Returns a list: empty when nobody is left to tell. */
export function buildNewRefundRequest(
  db: Queryable,
  input: {
    refundRequestId: number;
    buyer: { id: number; name: string };
    courseTitle: string;
    isTeamLicence: boolean;
  }
): Notification[] {
  const platformAdmins = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .orderBy(users.id)
    .all();

  const recipients = everyoneBut(platformAdmins, input.buyer.id);
  if (recipients.length === 0) return [];

  const subject = input.isTeamLicence
    ? `a Team Licence of “${input.courseTitle}”`
    : `“${input.courseTitle}”`;

  return [
    {
      kind: "new-refund-request",
      recipients,
      body: `New Refund Request from ${input.buyer.name} for ${subject}`,
      url: `/admin/refunds?refund=${input.refundRequestId}`,
    },
  ];
}

// ─── Questions and Replies ───

type CommentNotificationInput = {
  author: { id: number; name: string };
  lessonId: number;
  lessonTitle: string;
  courseSlug: string;
  /** The Question: the new Comment itself, or the one a Reply is under. */
  questionId: number;
};

function questionUrl(input: CommentNotificationInput): string {
  return `/courses/${input.courseSlug}/lessons/${input.lessonId}#question-${input.questionId}`;
}

/** Tells the course's Instructor. Empty when the Instructor asked it. */
export function buildNewQuestion(
  input: CommentNotificationInput & {
    instructor: { id: number; name: string };
  }
): Notification[] {
  const recipients = everyoneBut([input.instructor], input.author.id);
  if (recipients.length === 0) return [];
  return [
    {
      kind: "new-question",
      recipients,
      body: `New Question from ${input.author.name} on “${input.lessonTitle}”`,
      url: questionUrl(input),
    },
  ];
}

/** Tells the Question's author. Empty when they replied to themselves. */
export function buildReply(
  input: CommentNotificationInput & {
    questionAuthor: { id: number; name: string };
  }
): Notification[] {
  const recipients = everyoneBut([input.questionAuthor], input.author.id);
  if (recipients.length === 0) return [];
  return [
    {
      kind: "reply",
      recipients,
      body: `${input.author.name} replied to your Question on “${input.lessonTitle}”`,
      url: questionUrl(input),
    },
  ];
}

// ─── Senders ───

export function knockSender(apiKey: string): NotificationSender {
  return {
    async send(notification) {
      const response = await fetch(
        `https://api.knock.app/v1/workflows/${notification.kind}/trigger`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          // Recipients are identified inline: no user-sync job.
          body: JSON.stringify({
            recipients: notification.recipients,
            data: { body: notification.body, url: notification.url },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Knock rejected the ${notification.kind} notification: ${response.status}`
        );
      }
    },
  };
}

export function folderSender(directory: string): NotificationSender {
  let counter = 0;
  return {
    async send(notification) {
      mkdirSync(directory, { recursive: true });
      const file = join(
        directory,
        `${Date.now()}-${counter++}-${notification.kind}.json`
      );
      writeFileSync(file, JSON.stringify(notification, null, 2));
    },
  };
}

function defaultSender(): NotificationSender {
  const apiKey = process.env.KNOCK_API_KEY;
  return apiKey ? knockSender(apiKey) : folderSender(".notifications");
}

/**
 * Sends after the action has been saved. A failed send is logged and the
 * Notification is lost: it never fails the action.
 */
export async function sendNotifications(
  notifications: Notification[],
  sender: NotificationSender = defaultSender()
): Promise<void> {
  for (const notification of notifications) {
    try {
      await sender.send(notification);
    } catch (error) {
      console.error(
        `Could not send the ${notification.kind} notification`,
        error
      );
    }
  }
}
