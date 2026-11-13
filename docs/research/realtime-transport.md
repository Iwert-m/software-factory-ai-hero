# How to push real-time updates in React Router 8 on Node

Research for [#3](https://github.com/Iwert-m/software-factory-ai-hero/issues/3) (child of map [#1](https://github.com/Iwert-m/software-factory-ai-hero/issues/1) "Real-time in-app notifications"). Date: 2026-11-13.

**Question:** what is the best way to push in-app Notifications to the browser in real time for this app? The app is React Router 8.3.0 in framework mode, started with `react-router-serve ./build/server/index.js` on Node 22 (`.nvmrc`: 22.23.4), with data in one SQLite file (`data.db`, WAL mode) through Drizzle and better-sqlite3 (`app/db/index.ts`).

Options compared: Server-Sent Events (SSE) from a resource route, WebSockets, and polling / long-polling through loader revalidation.

## TL;DR

- **SSE from a resource route works under the stock `react-router-serve`, with no server changes.** The Express adapter in 8.3.0 has explicit SSE support: it flushes headers for `text/event-stream`, flushes after every chunk (so the built-in `compression()` does not hold events back), and aborts `request.signal` when the browser goes away.
- **WebSockets do not work under `react-router-serve`.** It never attaches an `upgrade` listener, and Node ignores upgrade requests without one. WebSockets need a custom Node/Express server plus the `ws` package (Node 22 ships a WebSocket *client* only).
- **Polling via `useRevalidator`** works everywhere with no new moving parts, at the cost of latency and repeated loader work.
- **Fan-out inside one process** is an in-memory map from a person's id to that person's open streams. **With more than one process, that map is per-process**, and SQLite gives you no cross-process change notification. Since one SQLite file already means one machine, the realistic shape is one process; more would need polling the Notifications table or an external pub/sub broker.
- **Recommendation (the decision is yours):** SSE from a resource route, with Notifications stored in SQLite as the source of truth, event ids set to the Notification id, and a catch-up query on reconnect that uses `Last-Event-ID`. Details and trade-offs are at the end.

## 1. What `react-router-serve` actually is

`@react-router/serve@8.3.0` (`node_modules/@react-router/serve/dist/cli.js`, 133 lines) is a fixed Express 5 app with no extension points:

```js
let app = express();
app.disable("x-powered-by");
if (!isRSCBuild) app.use(compression());
// ...static assets..., morgan("tiny")
app.all("/{*splat}", createRequestHandler({ build: buildModule, mode: process.env.NODE_ENV }));
let server = process.env.HOST ? app.listen(port, process.env.HOST, onListen) : app.listen(port, onListen);
["SIGTERM", "SIGINT"].forEach((signal) => {
  process.once(signal, () => server?.close(console.error));
});
```

Consequences:

- **Plain HTTP/1.1 only.** `app.listen` creates a `node:http` server. There is no HTTP/2 and no TLS (see the connection limit in section 5).
- **No `upgrade` handler.** Node docs (`http.Server` `'upgrade'` event): *"By default all HTTP upgrade requests are ignored (i.e. only regular `'request'` events are emitted ...) unless you listen to this event."* So a WebSocket handshake reaches the React Router handler as an ordinary GET and never upgrades. ([Node 22 http docs](https://nodejs.org/docs/latest-v22.x/api/http.html#event-upgrade))
- **`compression()` is always on** (`compression@1.8.2`). Its default filter compresses any `compressible` type, and `text/*` counts. Section 2 explains why that does not break SSE here.
- **Shutdown waits for open streams.** On SIGTERM it only calls `server.close()`. Node: `server.close()` *"closes all connections ... which are not sending a request or waiting for a response"*. An open SSE response counts as waiting for a response, and the handler replaces Node's default signal exit (`process.once(signal, ...)`), so **the process will not exit while any SSE stream is open** until the platform sends SIGKILL. The fix in app code is to listen for SIGTERM too and close every open stream controller. ([Node 22 http docs, `server.close`](https://nodejs.org/docs/latest-v22.x/api/http.html#serverclosecallback))

## 2. Server-Sent Events from a resource route

### Does it work under react-router-serve? Yes.

A resource route is *"a route module [that] exports a loader or action but does not export a default component"*, and its loader can return any `Response` ([React Router: Resource Routes](https://reactrouter.com/how-to/resource-routes)). Those docs do not mention SSE. The streaming support is in the Express adapter source, `@react-router/express@8.3.0` (`dist/index.js`):

```js
// createRemixRequest
let controller = new AbortController();
// ...
res.on("finish", () => controller = null);
res.on("close", () => controller?.abort());

// sendRemixResponse
if (nodeResponse.headers.get("Content-Type")?.match(/text\/event-stream/i)) res.flushHeaders();
if (nodeResponse.body) try {
  await writeReadableStreamToWritable(nodeResponse.body, res);
```

And `@react-router/node@8.3.0` `writeReadableStreamToWritable`:

```js
let canContinueWriting = writable.write(value);
if (typeof flushable.flush === "function") flushable.flush();
```

So:

1. Headers go out immediately for `text/event-stream`, and `EventSource` opens right away.
2. Each chunk is followed by `res.flush()`. That is the method `compression` adds to push its gzip buffer out (`compression/index.js`: `res.flush = function flush () { ... stream.flush() }`), so events are not held back by compression. To skip compression for the stream entirely (and tell proxies not to transform it), send `Cache-Control: no-cache, no-transform`. `compression` honours `no-transform` (`shouldTransform` in `compression/index.js`, citing RFC 7234 §5.2.2.4).
3. When the tab closes, `res` emits `close`, `request.signal` aborts, and the loader removes the stream from the fan-out map.

Sketch of the resource route (not a decision on file names):

```ts
// app/routes/api.notifications.stream.ts (resource route: no default export)
export async function loader({ request }: Route.LoaderArgs) {
  const userId = requireUserId(request);              // existing session lookup
  const lastId = Number(request.headers.get("Last-Event-ID") ?? 0);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (n: Notification) =>
        controller.enqueue(enc.encode(`id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`));
      for (const n of notificationsAfter(userId, lastId)) send(n);   // catch-up from SQLite
      const unsubscribe = hub.subscribe(userId, send);              // in-memory fan-out
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 15_000);
      request.signal.addEventListener("abort", () => { clearInterval(ping); unsubscribe(); controller.close(); });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
```

Browser side: `new EventSource("/api/notifications/stream")` in a `useEffect` in the app layout. Same-origin cookies are sent, so the existing session auth works unchanged.

### Fan-out to all of a person's tabs (one process)

Each open tab has its own `EventSource` and therefore its own long-lived request. The process keeps `Map<userId, Set<send>>`. Wherever a Notification is created (in an action or service, after the SQLite insert commits), call `hub.publish(userId, notification)`, which loops over that person's set. This works because every route module in one `react-router-serve` process shares the same module instances. The hub must live in a server-only module (like `app/db/index.ts`, kept side-effect free) so it stays out of the client bundle.

### Reconnect and catch-up: built into the protocol

From the [WHATWG HTML spec, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html):

- `id:` sets the stream's *last event ID buffer*, which *"does not get reset"* and is sent back as the `Last-Event-ID` request header when the browser reconnects.
- `retry: <ms>` sets the reconnection time. The default is *"implementation-defined"*, *"probably in the region of a few seconds"*.
- On a network error the browser *"reestablish[es] the connection"* by itself. A non-200 status or wrong `Content-Type` makes it *"fail the connection"*, and then *"it does not attempt to reconnect"*. A server can stop reconnects deliberately with HTTP 204, or by returning 401 when the user has logged out.
- Idle-proxy guard: *"authors can include a comment line (one starting with a ':' character) every 15 seconds or so"*.

Because Notifications are stored rows with increasing integer ids, `id: <notification id>` plus `WHERE user_id = ? AND id > :lastEventId` on reconnect gives gap-free catch-up for free. If the server restarts, or the tab sleeps, nothing is lost.

## 3. WebSockets

- **Not possible under `react-router-serve`** (no `upgrade` listener, section 1).
- **Node has no WebSocket server built in.** Node 22's global `WebSocket` is *"A browser-compatible implementation of WebSocket"*, a client ([Node 22 globals](https://nodejs.org/docs/latest-v22.x/api/globals.html#websocket)). A server needs the `ws` package (or similar).
- **So you need a custom server:** your own `server.js` that builds the Express app, mounts `createRequestHandler` from `@react-router/express`, and handles `server.on("upgrade", ...)` with `ws`. You then own static assets, compression, logging, the dev-mode Vite middleware, and shutdown. `server.closeAllConnections()` *"does not destroy sockets upgraded to a different protocol, such as WebSocket"*, so you track and close those yourself ([Node 22 http docs](https://nodejs.org/docs/latest-v22.x/api/http.html#servercloseallconnections)).
- **Auth:** the browser `WebSocket` API cannot set custom headers, but same-origin cookies go along with the handshake. You parse the session cookie yourself in the upgrade handler, outside React Router's loader context.
- **Reconnect and catch-up:** none built in. You write the backoff loop and a "since id" handshake yourself.
- **What you get for it:** bidirectional, low-overhead messages. In-app Notifications flow server→client only, and the client's few actions (mark as read) already fit ordinary actions/fetchers. That bidirectionality buys nothing here.
- **Fan-out:** same in-memory map as SSE, with the same multi-process limits.

## 4. Polling / long-polling via revalidation

- **Short polling:** `useRevalidator()` *"Revalidate[s] the data on the page for reasons outside of normal data mutations like Window focus or polling on an interval"* ([React Router: useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). A `setInterval(() => revalidator.revalidate(), N)` in the layout reruns the active loaders, including a Notifications count in the layout loader. A cheaper variant is a `useFetcher().load("/api/notifications?after=<id>")` on an interval, which hits one small resource route instead of every loader on the page.
- **Works under `react-router-serve`, with any number of processes and through any proxy.** Each poll reads SQLite, so there is no in-memory state to keep in sync.
- **Cost:** latency up to N seconds, and one request (and loader run) per tab per interval even when nothing changed. React Router also revalidates automatically after every action, so a person's own mutations already refresh their data.
- **Long-polling** (hold the request until a Notification arrives or a timeout passes) needs the same in-memory hub as SSE plus a client loop. It has all of SSE's single-process limits and none of its built-in reconnect or `Last-Event-ID`. On this stack it is strictly worse than SSE.
- **Catch-up:** inherent, since every poll reads current state.

## 5. More than one server process, and what SQLite implies

- **The in-memory hub is per-process.** If process A handles the action that creates a Notification, tabs connected to process B never hear about it. This applies equally to SSE, WebSockets and long-polling.
- **SQLite cannot be the notification bus.** `sqlite3_update_hook` *"registers a callback function with the database connection identified by the first argument"* ([SQLite docs](https://www.sqlite.org/c3ref/update_hook.html)). It is per connection, so it reports nothing about writes from other processes, and better-sqlite3 12.11.1 does not expose it anyway (no `update_hook` in its source). There is nothing like Postgres `LISTEN/NOTIFY`.
- **One SQLite file already pins you to one machine.** WAL mode (set in `app/db/index.ts`) lets several processes on the same host share the file, but not several hosts. So the realistic scale-out is a few processes on one box.
- **Options if you ever run more than one process:** (a) each process polls `SELECT ... WHERE id > :maxSeen` every second or two and pushes new rows to its own connected tabs (cheap on SQLite, no new infrastructure, adds up to the poll interval of latency); (b) an external pub/sub broker such as Redis, which is new infrastructure; (c) sticky sessions alone do **not** help, because the writer and the listener are different people on possibly different processes.
- With the SSE + `Last-Event-ID` design, a reconnect to a *different* process still catches up correctly, because catch-up reads SQLite rather than memory.

## 6. Proxy and hosting gotchas

- **HTTP/1.1 connection limit (SSE).** MDN: *"When not used over HTTP/2, SSE suffers from a limitation to the maximum number of open connections ... the limit is per browser and set to a very low number (6)"*, and it is per browser + domain across all tabs ([MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)). `react-router-serve` speaks only HTTP/1.1. If browsers reach it directly over HTTP/1.1, a seventh tab stalls, and so do the other requests from that browser. Fixes: put a TLS-terminating proxy speaking HTTP/2 in front (most hosts do this; then it is about 100 streams), or share one connection across tabs. The WHATWG spec suggests *"sharing a single EventSource object using a shared worker"*. A `BroadcastChannel` with a Web Locks leader also works. WebSockets do not share this pool, which is their one real advantage here.
- **Proxy buffering.** nginx defaults to `proxy_buffering on`, which delays events. Sending the response header `X-Accel-Buffering: no` turns it off per response ([nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)). `Cache-Control: no-transform` discourages other intermediaries from compressing or buffering.
- **Idle timeouts.** nginx `proxy_read_timeout` defaults to `60s`. Many load balancers cut idle connections at a similar point. The 15 s `: ping` comment from the spec keeps the connection alive, and `EventSource` reconnects if it is cut anyway.
- **WebSockets through proxies** need explicit `Upgrade`/`Connection` forwarding. nginx: *"WebSocket proxying requires special configuration"*. Some PaaS / serverless hosts do not support upgrades at all.
- **Node timeouts:** `server.requestTimeout` (default 300 s) covers *"receiving the entire request from the client"*, so a GET with no body is not affected. `server.timeout` defaults to `0` (disabled). Neither cuts a long SSE response under `react-router-serve` defaults.
- **Graceful shutdown:** see section 1. Close open streams on SIGTERM, or deploys will hang until SIGKILL.
- **Dev mode:** `react-router dev` serves resource routes through Vite's dev server, so an SSE resource route should work in dev as written (not verified in this research; check it in the first prototype). A WebSocket server would need its own wiring in dev as well.

## Comparison

| | SSE (resource route) | WebSockets | Polling (revalidate/fetcher) |
|---|---|---|---|
| Works under `react-router-serve` | **Yes** (adapter flushes SSE explicitly) | **No**, needs custom server + `ws` | Yes |
| Latency | Immediate | Immediate | Up to the poll interval |
| Fan-out to a person's tabs | In-memory map in one process | Same | n/a (each tab reads SQLite) |
| More than one process | Needs DB polling or a broker; catch-up still correct | Same, and catch-up is hand-built | Works as is |
| Reconnect | Built in (browser auto-retries, `retry:`) | Hand-built | Inherent |
| Catch-up | Built in via `id:` / `Last-Event-ID` | Hand-built | Inherent |
| Auth | Existing cookie session in loader | Parse cookie in upgrade handler | Existing loaders |
| Proxy gotchas | Buffering, idle timeout, HTTP/1.1 6-connection cap | Upgrade forwarding, idle timeout | None |
| New dependencies | None | `ws` + custom server | None |

## Recommendation (the decision is yours)

**Use Server-Sent Events from a React Router resource route**, backed by the Notifications table in SQLite:

1. Insert the Notification, then `hub.publish(userId, notification)` to that person's open streams in the same process.
2. Send each event with `id: <notification id>`. On connect, replay rows with `id > Last-Event-ID` so reconnects and restarts lose nothing.
3. Send `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, and a `: ping` comment every 15 s. Clean up on `request.signal` abort, and close all streams on SIGTERM.
4. Run one server process. If that ever changes, have each process poll for new Notification ids (no new infrastructure) before reaching for Redis.

**Trade-offs you accept:** one long-lived HTTP connection per tab, so production should be served over HTTP/2 or tabs should share one connection; an in-memory hub that is single-process by design; and a small shutdown hook. **What you avoid:** a custom server, a `ws` dependency, and hand-written reconnect/catch-up logic. **The fallback that never breaks** is polling with `useRevalidator`/`useFetcher`. It is worth keeping in mind if the host turns out to buffer or cut streaming responses. A hybrid is also reasonable: SSE as the primary channel, plus a revalidation on window focus.
