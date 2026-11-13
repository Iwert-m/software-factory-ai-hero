# Which hosted notification platforms fit Cadence?

Research for [#8](https://github.com/Iwert-m/software-factory-ai-hero/issues/8) (child of map [#1](https://github.com/Iwert-m/software-factory-ai-hero/issues/1) "Real-time in-app notifications"). Date: 2026-11-13. The pick itself is made in [#9](https://github.com/Iwert-m/software-factory-ai-hero/issues/9).

**Question:** Cadence hosts no real-time or notification infrastructure of its own. Which hosted notification platform best delivers an in-app, real-time Notification feed to Students, Instructors, Team Admins and Platform Admins in a React Router 8.3.0 (framework mode, `react-router-serve` on Node, React `^19.2.7`) app? Email and push are out of scope for now. This doc only notes whether a platform could add them later.

Background: the self-hosted option (SSE from a resource route) is covered in `docs/research/realtime-transport.md` on branch `research/realtime-transport`. It is not repeated here.

Candidates: **Knock, Novu Cloud, Courier, MagicBell, SuprSend.** Lower-level pub/sub (Pusher Channels, Ably) is covered in its own section. Engagespot also exists, but its pricing page returned 404 and it is a smaller player. It is not assessed further.

## TL;DR

- All five platforms persist the feed on their side, push new items over a WebSocket, and offer a prebuilt React inbox plus headless hooks. All of them can add email, push, SMS and chat later from the same workflow. The real differences are **EU data residency**, **price at small scale**, and **exit options**.
- **Novu Cloud** is the only one with an EU region (Germany) on the **free** plan. Its core is MIT open source, so self-hosting is a credible exit. Pro costs $30/mo for 30k runs. It has the weakest docs: transport and EU socket hostnames disagree across pages.
- **Knock** is the most polished in-app feed. Its client backfills missed items by cursor, it has seen, read, interacted and archived states, and it uses RS256 user tokens. But it has **no EU data residency yet** (its docs say "by the end of 2026"), and the first paid tier is a jump to $250/mo.
- **Courier** has an EU datacenter (Ireland) on its pay-as-you-go Business plan: $0.005/send, no base fee, every send billed.
- **SuprSend** has EU workspaces and the cheapest unbranded tier ($100/mo), but per-user preferences need the $250/mo Business plan.
- **MagicBell** publishes no hosting region, no EU residency and no SOC 2 on its trust page, and its first paid tier is $249/mo. It is the weakest fit.
- **Pusher and Ably** are not a reasonable substitute, because they would push the feed, states and preferences back into Cadence.

## Comparison

Pricing is from each vendor's public pricing page as read on **2026-11-13**.

| | **Knock** | **Novu Cloud** | **Courier** | **MagicBell** | **SuprSend** |
|---|---|---|---|---|---|
| Real-time transport | WebSocket (Phoenix channels; `phoenix` 1.8.9 in `@knocklabs/client`) | WebSocket (PartySocket on Cloud; socket.io for self-hosted) | WebSocket (`listenForUpdates()`; EU `wss://realtime.eu.courier.io`) | Ably-based realtime in the headless package | socket.io-client 4.8 in `@suprsend/web-sdk` |
| Catch-up after a dropped connection | Feed is stored server-side. Each socket event triggers a fetch of every item newer than the current head cursor, so gaps fill on the next event or refetch | Feed stored server-side; the hooks refetch. No documented replay | Inbox stored server-side; refetch on load | Stored server-side; the headless client fetches the full notification per event | Stored server-side. The SDK exposes reachability and socket status; the built-in banner asks the user to reload |
| States | seen, read, interacted, archived (each reversible, plus bulk "all") | read, seen (unseen count), archived, snoozed | read, opened, archived (timestamps) | seen, read, archived | seen, read, interacted, archived, pinned |
| Per-user preferences | PreferenceSet per user (workflow, category, channel); hosted preference center | `<Preferences/>` component (workflow × channel) | `<CourierPreferences/>` (topics) | `UserPreferences` component | Yes, but **Business plan ($250) only** |
| React SDK | `@knocklabs/react` 0.15 (MIT): `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, plus hooks | `@novu/react` 3.19: `<Inbox/>`, plus `@novu/react/hooks` | `@trycourier/courier-react` v8: `CourierInbox`, `CourierInboxPopupMenu`, `CourierToast`, plus `useCourier()` | `@magicbell/react`: `Inbox`, `FloatingInbox`, `ToastContainer`… | `@suprsend/react`: `Inbox`, `NotificationsFeed`, `Preferences`, plus `@suprsend/react-core` hooks |
| React 19 / SSR | peer `react ^17‖^18‖^19`; SSR not documented | peer `^18‖^19`; has a separate `server` export | React 18+; docs say client-only (`'use client'`) | Not stated | No peer deps; not stated |
| Node trigger SDK | `@knocklabs/node` | `@novu/api` | `@trycourier/courier` | Node SDK / REST | `@suprsend/node-sdk` |
| Client identity | Public key plus an **RS256 JWT** signed by your server (`signUserToken`, `sub` = user id) under "enhanced security mode", with token refresh hook | Public app id plus **HMAC-SHA256(subscriberId)** with the secret key (`subscriberHash`), optional `contextHash` | Server mints a **JWT** via the Courier API, scoped to `user_id:…` + `inbox:read:messages` / `inbox:write:events` | **HS256 JWT** signed with the project secret (`user_external_id` / `user_email`) | **ES256 JWT** (`userToken`) under enhanced security mode, with `refreshUserToken` |
| EU data residency | **No.** "We expect to support EU data residency by the end of 2026" | **Yes**, EU (Germany) on all plans, including Free | **Yes**, Ireland, on Business and Enterprise | Not stated anywhere | Docs: each workspace picks a data region, including the EU. Pricing page: multi-region is Enterprise. **Confirm with vendor** |
| GDPR / DPA / certs | GDPR, CCPA, SOC 2 Type 2 (pricing page); EU-US DPF and SCCs | GDPR, SOC 2 Type II, ISO 27001; DPA page | DPA on Enterprise ("MSA/DPA/BAA and legal review") | GDPR, DPA offered; no SOC 2 on the trust page | SOC 2 Type II, ISO 27001, GDPR (trust center) |
| Free tier | 10k messages/mo | 10k workflow runs/mo, 24 h activity log, Novu branding | 10k sends/mo (Developer) | 1k deliveries/mo | 10k notifications/mo, SuprSend branding in the feed |
| First paid tier | Starter **$250/mo**, 50k messages, then $0.005 each | Pro **from $30/mo**, 30k runs, then $1.20/1k | Business **$0.005/send**, pay as you go, no base fee, every send billed | Startup **$249/mo**, 50k, then $0.0025 each | Essentials **$100/mo** (50k, $2/1k over). Business $250/mo for preferences |
| Metered unit | Messages delivered per user per channel | Workflow runs | Sends (1 template × 1 recipient; channels don't multiply) | Deliveries (per channel) | Notifications per channel per user |
| Lock-in / export | Feed retention unlimited; message API; warehouse export on Enterprise only | MIT core is self-hostable (enterprise folder is commercial) | Data-warehouse integrations on Enterprise | Not stated | Log sync to Segment or a warehouse (Business); self-host or BYOC on Enterprise |
| Open source / maturity | Proprietary; MIT SDKs; mature, widely used | Open-core, about 40k GitHub stars | Proprietary; mature | Proprietary | Proprietary; MIT SDKs |

### Rough monthly cost at Cadence-like volumes (in-app only, 2026-11-13 list prices)

| In-app notifications / month | Knock | Novu | Courier | MagicBell | SuprSend |
|---|---|---|---|---|---|
| 5k | $0 | $0 | $0 | $249 (Free caps at 1k) | $0 (branded, no prefs) |
| 20k | $250 | $30 | $100 | $249 | $100, or $250 with prefs |
| 100k | $500 | ~$114 | $500 | $374 | $200, or $500 with prefs |

These assume one in-app message per Notification. Novu bills per workflow run, and its page does not define what one run covers. Treat its numbers as a lower bound.

## Per platform

### Knock

- **Feed and real-time:** the in-app API "includes websocket support out of the box" ([overview](https://docs.knock.app/in-app-ui/overview)). The JS client uses Phoenix channels (`phoenix` 1.8.9 in [`packages/client/package.json`](https://github.com/knocklabs/javascript/blob/main/packages/client/package.json)). When a socket message arrives, the client fetches everything before the current head cursor ([`feed.ts` `onNewMessageReceived`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts)). Items missed during a disconnect therefore appear on the next event or the next fetch. Phoenix sockets reconnect and rejoin on their own.
- **States:** `markAsSeen/Unseen`, `markAsRead/Unread`, `markAsArchived/Unarchived`, `markAsInteracted`, and `markAll*` ([feed client](https://docs.knock.app/in-app-ui/javascript/sdk/feed-client)).
- **Preferences:** a per-user `PreferenceSet` with opt-outs by channel type, category and workflow. Knock evaluates it at send time ([preferences](https://docs.knock.app/concepts/preferences)).
- **React:** `@knocklabs/react` has `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, and hooks for headless UI ([React overview](https://docs.knock.app/in-app-ui/react/overview)). It is MIT licensed, with peer `react ^17 || ^18 || ^19` ([package.json](https://github.com/knocklabs/javascript/blob/main/packages/react/package.json)).
- **Auth:** under enhanced security mode, the server signs an RS256 JWT with `sub` = user id using `signUserToken` from `@knocklabs/node`. The default expiry is 3600 s, and the client refreshes through `onUserTokenExpiring` ([security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication)).
- **EU:** "EU data residency is coming soon. We expect to support EU data residency by the end of 2026" ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans)). It is not available today.
- **Pricing (2026-11-13):** Free has 10k messages. Starter is $250/mo with 50k, then $0.005 per message. Feed retention is unlimited, logs are kept 30 days, and warehouse export is Enterprise only ([pricing](https://knock.app/pricing)).

### Novu Cloud

- **Feed and real-time:** `<Inbox/>` "automatically fetches user notifications and manages the real-time unread count" ([Inbox overview](https://docs.novu.co/platform/inbox/overview)). Headless events are `notifications.notification_received` and `notifications.unread_count_changed` ([headless mode](https://docs.novu.co/platform/inbox/headless-mode)). Cloud uses PartySocket, a reconnecting WebSocket, and self-hosted uses socket.io ([`packages/js/src/ws/socket-factory.ts`](https://github.com/novuhq/novu/blob/next/packages/js/src/ws/socket-factory.ts)). Novu documents no explicit replay; the hooks refetch from the stored feed.
- **States:** read, archived, unseen counts and snooze ([overview](https://docs.novu.co/platform/inbox/overview), [headless](https://docs.novu.co/platform/inbox/headless-mode)).
- **Preferences:** the `Preferences` component lets subscribers choose workflows × channels ([overview](https://docs.novu.co/platform/inbox/overview)).
- **React:** `@novu/react` 3.19.2 (ISC) has peer `react ^18 || ^19` and exports `.`, `./hooks`, `./themes` and `./server` ([package.json](https://github.com/novuhq/novu/blob/next/packages/react/package.json)).
- **Auth:** HMAC-SHA256 of `subscriberId` with the secret key, sent as `subscriberHash`. Without HMAC, anyone who guesses a subscriber id can read that user's feed, so it is mandatory in production ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)). This is weaker than an expiring JWT: the hash never expires.
- **EU:** Novu Cloud runs in the US and the EU (Germany) ([security](https://novu.co/security)). The pricing page lists US + EU on Free ([pricing](https://novu.co/pricing)). The EU client needs `apiUrl` / `backendUrl` `https://eu.api.novu.co` and `socketUrl` `wss://eu.socket.novu.co`. Docs and code use both prop names; the SDK maps `https://eu.ws.novu.co` to `wss://eu.socket.novu.co`. Novu states GDPR, SOC 2 Type II and ISO 27001 compliance and offers a DPA ([security](https://novu.co/security)).
- **Pricing (2026-11-13):** Free has 10k runs, 24 h activity retention and Novu branding. Pro is from $30/mo with 30k runs, then $1.20 per 1k. Team is from $250/mo ([pricing](https://novu.co/pricing)).
- **Open source:** the core is MIT and the `enterprise` folder is under a commercial license; the repo has about 40k stars ([GitHub](https://github.com/novuhq/novu)).

### Courier

- **Feed and real-time:** `inbox.listenForUpdates()` opens the WebSocket after sign-in. Messages carry `read`, `opened` and `archived` timestamps, and tabs filter by status, archived and tags ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- **React:** `@trycourier/courier-react` (React 18+) has `CourierInbox`, `CourierInboxPopupMenu`, `CourierToast`, `CourierPreferences` and `useCourier()`. Components are client-only (`'use client'` in Next.js) ([React SDK](https://www.courier.com/docs/sdk-libraries/courier-react-web)).
- **Auth:** the backend mints a JWT through Courier's API. Its scope must include `user_id:<id>` plus `inbox:read:messages` and `inbox:write:events` ([authentication](https://courier.com/docs/platform/inbox/authentication)).
- **EU:** a separate datacenter in Ireland on Business and Enterprise, with its own API, inbox and realtime hosts. US and EU data are not shared ([EU datacenter](https://www.courier.com/docs/platform/workspaces/eu-datacenter.md)).
- **Pricing (2026-11-13):** Developer is free up to 10k sends. Business is $0.005 per send, with every send billed including the first 10k. A send is one template to one recipient, and extra channels do not add to the count. DPA and legal review are listed under Enterprise ([pricing](https://www.courier.com/pricing)).

### MagicBell

- **Feed and real-time:** the headless React package receives events from Ably and fetches the full notification ([`@magicbell/react-headless` realtime source](https://app.unpkg.com/@magicbell/react-headless@5.5.1/files/dist/esm/lib/realtime.js)).
- **React:** `@magicbell/react` has `ContextProvider`, `Inbox`, `FloatingInbox`, `ToastContainer`, `UserPreferences` and `WebPushButton`. React version and SSR are not documented ([React docs](https://magicbell.com/docs/libraries/react)).
- **Auth:** an HS256 user JWT signed with the project secret, containing `user_external_id` and/or `user_email`. The example uses a 1-year expiry ([user auth](https://www.magicbell.com/docs/api/authentication/user)).
- **EU / compliance:** the trust page says "GDPR compliant" and offers DPAs. It names no hosting region, no EU residency and no SOC 2 ([security](https://www.magicbell.com/security)).
- **Pricing (2026-11-13):** Builder is free with 1k deliveries. Startup is $249/mo with 50k, then $0.0025 each ([pricing](https://www.magicbell.com/pricing)).

### SuprSend

- **Feed and real-time:** `@suprsend/web-sdk` 5.4 (MIT) uses `socket.io-client`. The React feed exposes reachability (`ONLINE`, `CONNECTING`, `DEGRADED`, `OFFLINE`…), socket `reconnectAttempts` and `lastDisconnectedAt`. The built-in offline banner asks the user to reload ([headless feed](https://docs.suprsend.com/docs/react-sdk-headless-feed), [web-sdk package.json](https://github.com/suprsend/suprsend-web-sdk/blob/main/package.json)).
- **States:** `seen_on`, `read_on`, `interacted_on`, `archived` and `is_pinned` ([headless feed](https://docs.suprsend.com/docs/react-sdk-headless-feed)).
- **React:** `@suprsend/react` has `Inbox`, `NotificationsFeed` and `Preferences`, and `@suprsend/react-core` provides hooks ([React SDK](https://docs.suprsend.com/docs/react-1)).
- **Auth:** an ES256 JWT `userToken` with a `refreshUserToken` callback, mandatory in enhanced security mode ([React SDK](https://docs.suprsend.com/docs/react-1)).
- **EU:** the docs say "Each workspace has a data region, including the EU" and claim SOC 2 Type II and ISO 27001 ([what is SuprSend](https://docs.suprsend.com/docs/what-is-suprsend)). The pricing page lists "Multi-region data center" under Enterprise only ([pricing](https://www.suprsend.com/pricing)). These conflict, so confirm with the vendor.
- **Pricing (2026-11-13):** Free has 10k with branding. Essentials is $100/mo with 50k, then $2 per 1k. Business is $250/mo with 50k, then $5 per 1k, and is required for **user preferences** and digests ([pricing](https://www.suprsend.com/pricing)).

## Why not Pusher Channels or Ably?

They solve only the transport. Pusher Channels keeps no message history: events exist "until they have been delivered to all connected clients". Cache channels keep only the last event for up to 30 minutes ([support FAQ](https://support.pusher.com/hc/en-us/categories/360001491213-Channels), [cache channels](https://pusher.com/docs/channels/using_channels/cache-channels/)). Cadence would still have to store Notifications in SQLite and build the catch-up query, the read and archive states, preferences and the inbox UI. Pusher's sandbox is free (200k messages/day, 100 connections), and Startup costs $49/mo ([pricing](https://pusher.com/channels/pricing/)). Ably adds history (1 month on Free, 1 year on Pro at $29/mo), but EU/US routing constraints start at the Business tier ([pricing](https://ably.com/pricing)). Either one keeps the "no infrastructure" promise only for the socket, not for the feed. That makes them a reasonable fallback only if every notification platform is rejected, and then the SSE research is about equally cheap.

## Fit notes for Cadence

- **SSR:** treat every inbox component as client-only. In React Router framework mode, render the bell and feed only after hydration (for example behind a `useEffect` mounted flag or a lazy import), and get the signed user token or HMAC from a loader. Every platform takes a token minted server-side, which fits a loader cleanly. The secret key stays in server-only modules.
- **Recipient identity:** use the Cadence user id as the external id (Knock `id`, Novu `subscriberId`, Courier `user_id`, MagicBell `user_external_id`, SuprSend `distinctId`). Do not use email.
- **Roles:** all platforms can split Students, Instructors and Team Admins with tenants, topics or categories. None of them needs Cadence to model roles twice.

## Recommendation (the decision is yours, in #9)

- **If EU data residency is required now, pick Novu Cloud.** It is the cheapest ($0, then $30/mo), its EU region is on every plan, and it supports React 19. Its MIT core is a real exit path. The trade-offs: thinner and sometimes inconsistent docs, HMAC that never expires instead of an expiring JWT, and runs as a fuzzier billing unit. **Courier is the runner-up**: its EU datacenter in Ireland is pay-as-you-go, but it bills every send and its DPA is listed under Enterprise.
- **If EU residency can wait (a US processor under DPF/SCCs is acceptable), pick Knock.** It has the best in-app feed model and client, with cursor backfill, interacted and archived states, and RS256 tokens. The trade-offs are the $0 → $250 step above 10k messages and the dependence on a promised EU region.
- **Avoid MagicBell**, which has no published region or SOC 2 and a $249 first paid tier. **Avoid SuprSend unless** its EU region is confirmed on a non-Enterprise plan and $250/mo for preferences is acceptable.
