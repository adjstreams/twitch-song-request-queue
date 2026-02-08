# Roadmap

This document lists features and improvements for the Media Request application. When building new features, check this list to avoid design choices that conflict with later work.

**Constraints (do not break):** Client-side only; no server-side persistence. Dock and player must remain usable in the same browser/process (e.g. both in OBS or both in Chrome). See [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Phase 1: Queue and UX

- **Queue persistence (optional)**  
  Already partially in place: persist queue to `localStorage` and restore on reload (order only; "now playing" not restored). Harden and optionally add a "clear saved queue" control.

- **Support youtu.be short URLs**  
  Accept `https://youtu.be/VIDEO_ID` in addition to `https://www.youtube.com/watch?v=VIDEO_ID` for `!sr` and the dock input. Parse and normalise to video ID so queue and player logic stay unchanged.

- **Clear queue button**  
  Already present; ensure it clears in-memory and persisted queue and does not send invalid commands to the player.

- **Skip / remove item**  
  Allow the streamer to skip the current video or remove an item from the queue. Dock sends LOAD_VIDEO/PLAY for the next item (or idles). No server round-trip.

- **Reorder queue (optional)**  
  Drag-and-drop or up/down controls to reorder the queue in the dock. Queue remains in-memory + optional localStorage; no server.

---

## Phase 2: Polish and reliability

- **Connection and error UX**  
  Clear states: Waiting for player, Connected, Disconnected. Surface Twitch connection errors in the dock (e.g. "Twitch disconnected", "Invalid token" if auth is added later). Do not send playback commands when player is disconnected.

- **Basic validation**  
  Validate YouTube URLs and video IDs before enqueueing (e.g. length, allowed characters). Optionally debounce or throttle rapid `!sr` from the same user to avoid accidental spam (client-side only).

- **Accessibility and keyboard**  
  Ensure dock controls are focusable and usable with keyboard. Player can stay minimal for OBS; focus on dock for a11y.

- **Testing**  
  Add unit tests for URL parsing, queue logic, and message construction. Optional: E2E tests (same process) for dock + player flow. See ARCHITECTURE.md for testing approach.

---

## Phase 3: Optional extensions (client-side only)

- **Theme / appearance**  
  Light/dark or configurable theme for the dock via CSS variables or a small settings panel. Stored in `localStorage`.

- **History / recently played**  
  Optional list of recently played video IDs in the dock (in-memory or `localStorage`), for reference only. No server, no analytics backend.

- **Pause / resume and seek from dock**  
  Buttons or controls in the dock to pause, resume, or seek the current video. Dock sends existing PAUSE / PLAY / SEEK messages; no new protocol.

---

## Explicitly out of scope

- Server-side persistence (database, file store, server session).
- Twitch EventSub, channel points, bits, subs, payments.
- Multi-streamer or multi-tenant backend.
- Server relay for cross-process communication (e.g. dock in Chrome, player in OBS).
- Moderation backend or bot bans.
- Analytics or history stored on a server.

If a feature would require server-side state or a new backend service, it does not belong in the current product direction; revisit ARCHITECTURE and this roadmap before adding it.

---

## Using this roadmap when building

- Before implementing a feature, check that it does not rely on server persistence or break the client-only model.
- Complete phases in order where possible so config and message schema stay stable.
- When adding a new capability (e.g. skip, reorder), ensure it fits the existing message schema or extend it in one place and document it; keep dock and player in sync.
- If you need to add a new "phase" or move items, update this document so future work still has a single reference.
