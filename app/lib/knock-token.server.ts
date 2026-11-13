import { createSign } from "node:crypto";

// What the browser needs to connect to Knock's in-app feed WebSocket directly.
// Cadence's server only signs a token; it never relays real-time traffic.
//
//   KNOCK_PUBLIC_API_KEY   Knock public key (safe for the browser)
//   KNOCK_FEED_CHANNEL_ID  id of the in-app feed channel
//   KNOCK_SIGNING_KEY      RS256 private key, PEM or base64 of the PEM

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export type KnockClientConfig = {
  publicApiKey: string;
  feedChannelId: string;
  userToken: string;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function signKnockUserToken(
  userId: string,
  signingKey: string,
  now: Date = new Date()
): string {
  const pem = signingKey.includes("BEGIN")
    ? signingKey
    : Buffer.from(signingKey, "base64").toString("utf8");
  const issuedAt = Math.floor(now.getTime() / 1000);

  const unsigned = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        sub: userId,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_SECONDS,
      })
    ),
  ].join(".");

  const signature = createSign("RSA-SHA256").update(unsigned).sign(pem);
  return `${unsigned}.${base64url(signature)}`;
}

/** Null when Knock is not configured (local dev without a Knock account). */
export function getKnockClientConfig(userId: number): KnockClientConfig | null {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!publicApiKey || !feedChannelId || !signingKey) return null;

  return {
    publicApiKey,
    feedChannelId,
    userToken: signKnockUserToken(String(userId), signingKey),
  };
}
