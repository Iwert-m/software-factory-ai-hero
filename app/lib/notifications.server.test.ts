import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  folderSender,
  sendNotifications,
  type Notification,
} from "./notifications.server";

const notification: Notification = {
  kind: "new-refund-request",
  recipients: [{ id: "1", name: "Pat Admin" }],
  body: "New Refund Request from Jordan Diaz for “Advanced TypeScript”",
  url: "/admin/refunds?refund=7",
};

describe("sending Notifications", () => {
  it("writes each Notification to the folder as JSON", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await sendNotifications([notification], folderSender(directory));

    const [file] = readdirSync(directory);
    expect(JSON.parse(readFileSync(join(directory, file), "utf8"))).toEqual(
      notification
    );
  });

  it("logs a failed send instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendNotifications([notification], {
        send: async () => {
          throw new Error("Knock is down");
        },
      })
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
