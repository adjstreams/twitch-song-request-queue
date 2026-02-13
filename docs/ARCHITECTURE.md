# Technical Architecture

This document describes the technical architecture of the Media Request application. Use it when implementing or changing features to keep the system consistent and maintainable.

---

## Core principles

- **Client-side only.** The application has no server-side persistence. The dock and player are purely client-side. The server is a static file server only; it does not store queue state, user data, or session state.
- **Dock is authority.** The dock owns the queue and playback decisions. The player only executes commands and reports events. New features must not invert this (e.g. the player must not decide what plays next).
- **Same process for communication.** Dock and player communicate via `BroadcastChannel`. They must run in the same browser/process (e.g. both in OBS or both in Chrome). Do not introduce server-side relay or persistence to “fix” cross-process use; that is out of scope.

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Same origin (e.g. http://localhost:3000)                   │
│  Same browser process (e.g. OBS or Chrome)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐         BroadcastChannel         ┌──────┐ │
│   │   Dock      │ ◄──────────────────────────────► │Player│ │
│   │ (controller)│   "streamgood-mr"                 │(OBS) │ │
│   └──────┬──────┘                                   └──┬───┘ │
│          │                                             │    │
│          │ Twitch IRC (ComfyJS)                        │    │
│          │ optional: localStorage (queue restore)      │    │
│          ▼                                             ▼    │
│   ┌─────────────┐                              YouTube API │
│   │ Twitch chat │                                       │   │
│   └─────────────┘                                       │   │
│                                                         │   │
└─────────────────────────────────────────────────────────────┘
```

- **Static server:** Serves HTML, CSS, JS, and assets. No API routes, no database, no session store.
- **Dock:** Single-page controller; connects to Twitch, holds queue, sends commands to the player via BroadcastChannel, optional queue persistence in `localStorage`.
- **Player:** Minimal page; YouTube IFrame API, BroadcastChannel for commands and heartbeats. Designed for OBS Browser Source; must stay lightweight.

---

## Project structure

Target structure as the project grows. Current layout may be flatter; migrate toward this when adding features or refactoring.

```
twitch-song-request-queue/
├── README.md                 # Project overview, how to run (entry point)
├── package.json
├── server.js                 # Static file server only; / and /dock -> /dock/, /player -> /player/
├── docs/
│   ├── ARCHITECTURE.md       # This document
│   └── ROADMAP.md            # Features and priorities
├── src/
│   ├── dock/                 # Dock app (served at /dock/)
│   │   ├── index.html
│   │   ├── dock.css
│   │   └── dock.js
│   └── player/               # Player app (served at /player/)
│       ├── index.html
│       ├── player.css
│       └── player.js
├── public/                   # Optional: static assets (images, fonts)
│   └── ...
└── tests/                    # When testing is introduced
    ├── unit/
    └── e2e/                  # Optional: Playwright/Cypress for dock+player
```

**Conventions:**

- **No server-side state.** Do not add API routes that store queue, user, or session data. Configuration that must persist is client-side (e.g. `localStorage`, or a static config file read by the client if needed).
- **Separate HTML, CSS, JS.** Each of dock and player should have distinct `.html`, `.css`, and `.js` files. Inline scripts and styles are acceptable only for minimal bootstraps (e.g. one script tag that loads the main bundle).
- **Single entry per surface.** One HTML entry for the dock, one for the player. Avoid multiple “app” entry points unless the roadmap explicitly adds them.
- **Third-party scripts.** Load ComfyJS and YouTube IFrame API from CDN or vendor script; do not commit large third-party libs into the repo unless necessary (e.g. for offline or version pinning).

---

## Communication: BroadcastChannel

- **Channel name:** `"streamgood-mr"`. Shared constant in both dock and player.
- **Message format:** JSON objects with a required `type` field. Full schema below.
- **Direction:** Dock → Player: commands (LOAD_VIDEO, PLAY, PAUSE, SEEK). Player → Dock: lifecycle and events (PLAYER_HELLO, PLAYER_PING, VIDEO_ENDED).
- **No persistence of messages.** Messages are not logged or stored on the server. If you add client-side logging for debug, keep it off by default and never send logs to a server.

When adding new message types or fields, update the **Message schema** section below and keep dock and player in sync.

### Message schema (single source of truth)

All messages are JSON objects with a `type` field. Property names and types must match.

| Type | Direction | Payload |
|------|-----------|---------|
| `PLAYER_HELLO` | Player → Dock | `{ "type": "PLAYER_HELLO", "playerId": string }` |
| `PLAYER_PING` | Player → Dock | `{ "type": "PLAYER_PING", "playerId": string }` |
| `LOAD_VIDEO` | Dock → Player | `{ "type": "LOAD_VIDEO", "videoId": string }` |
| `PLAY` | Dock → Player | `{ "type": "PLAY" }` |
| `PAUSE` | Dock → Player | `{ "type": "PAUSE" }` |
| `CLEAR` | Dock → Player | `{ "type": "CLEAR" }` — stops and clears the video (used when queue becomes empty). |
| `SEEK` | Dock → Player | `{ "type": "SEEK", "timeSeconds": number }` |
| `SET_VOLUME` | Dock → Player | `{ "type": "SET_VOLUME", "value": number }` — 0–100. |
| `SET_VIDEO_VISIBLE` | Dock → Player | `{ "type": "SET_VIDEO_VISIBLE", "visible": boolean }` — show or hide video on overlay (audio keeps playing). |
| `PLAYER_PROGRESS` | Player → Dock | `{ "type": "PLAYER_PROGRESS", "playerId": string, "currentTime": number, "duration": number }` — sent periodically for Now Playing progress bar and seek. |
| `SPIN_SHOW_WHEEL` | Dock → Player | `{ "type": "SPIN_SHOW_WHEEL", "segments": Array<{ videoId, label }> }` — player shows overlay with wheel (no spin); used when "show wheel on stream" is turned on. |
| `SPIN_START` | Dock → Player | `{ "type": "SPIN_START", "segments": Array<{ videoId, label }>, "winnerIndex": number }` — player shows overlay (dimmed + wheel), wheel animates to winner. |
| `SPIN_END` | Dock → Player | `{ "type": "SPIN_END" }` — player hides spin overlay. |
| `VIDEO_ENDED` | Player → Dock | `{ "type": "VIDEO_ENDED", "playerId": string }` |

**Planned (for Phase 3 features; add when implementing):**

- `videoId`: string, YouTube video ID (11 characters).
- `timeSeconds`: number, seconds to seek to.
- `playerId`: string, unique id for the player instance (e.g. UUID).
- `currentTime` / `duration`: numbers, seconds (for progress bar).
- `value`: number, 0–100 (for volume).
- `visible`: boolean (for SET_VIDEO_VISIBLE — show video on overlay).
- `segments`: array of `{ videoId: string, label: string }` for spin wheel. `winnerIndex`: number (0-based) for which segment won.

---

## Data and state

- **Queue:** In-memory in the dock. Optionally mirrored to `localStorage` (e.g. key `mr-queue`) for restore on reload. No server backup.
- **Configuration:** Channel name, command prefix, timeouts, etc. Prefer `localStorage` or a small JSON config loaded by the client. No server-side config store.
- **Secrets:** No Twitch OAuth or API keys in the client unless the roadmap explicitly adds “logged-in” features; if so, use a minimal token flow and never commit secrets. Current design uses anonymous Twitch chat where possible.

---

## Testing

- **Unit tests:** When introduced, place under `tests/unit/`. Prefer testing pure logic (e.g. URL parsing, queue logic, message builders) rather than DOM or BroadcastChannel. Use a test runner (e.g. Vitest, Jest) and run as part of CI if you add it.
- **Integration / E2E:** If needed, use a single-browser E2E tool (e.g. Playwright) to open both dock and player in the same process, drive the dock, and assert player behaviour. Do not rely on server state; tests should only use client-side behaviour and optional `localStorage` reset.
- **Manual testing:** Document in README how to run the app and how to verify “dock + player in same process” (e.g. both tabs in Chrome, or both sources in OBS). No server-side fixtures or seeded DB.

---

## Security and deployment

- **Static hosting.** The app can be served as static files (current Node server or any static host). No server-side rendering or API required.
- **HTTPS in production.** Use HTTPS so BroadcastChannel and any future client APIs (e.g. Twitch) run in a secure context. The static server does not handle secrets; reverse proxy or host handles TLS.
- **CSP and dependencies.** If you add a Content-Security-Policy, allow the CDN origins used for ComfyJS and YouTube. Prefer minimal dependencies; audit when adding new packages.

---

## Out of scope (do not assume)

- Server-side persistence (DB, file store, server session).
- Multi-tenant or multi-streamer backend.
- Cross-process communication (dock in Chrome, player in OBS) via server relay.
- Twitch EventSub, channel points, payments, or other Twitch backend features unless added explicitly in the roadmap.

Reference this document when designing new features or refactors to avoid introducing server-side state or breaking the client-only, dock-authority model.
