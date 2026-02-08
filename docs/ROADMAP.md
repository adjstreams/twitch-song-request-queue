# Roadmap

This document lists features and improvements for the Media Request application. When building new features, check this list to avoid design choices that conflict with later work.

**Constraints (do not break):** Client-side only; no server-side persistence. Dock and player must remain usable in the same browser/process (e.g. both in OBS or both in Chrome). See [ARCHITECTURE.md](ARCHITECTURE.md).

## Phase 1: Spin the Wheel

- **Spin the Wheel – player overlay**  
  When spin is triggered, dock sends spin-related messages (e.g. SPIN_START); player shows spinner overlay (dimmed video + wheel/spinner animation); dock sends winner (LOAD_VIDEO); player hides overlay and plays winner. SPIN_START / SPIN_END (or equivalent) and player overlay UI. Random pick from queue + SPIN button and tab are already in place; this is the optional player-side visual. All client-side.

---

## Phase 2: Polish and reliability

- **Connection and error UX**  
  Player connection states (Waiting / Connected / Disconnected) and no commands when disconnected are in place. Optional: surface Twitch connection errors more clearly in the dock (e.g. "Twitch disconnected").

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

---

## Explicitly out of scope

- Server-side persistence (database, file store, server session).
- Twitch EventSub, channel points, bits, subs, payments.
- Multi-streamer or multi-tenant backend.
- Server relay for cross-process communication (e.g. dock in Chrome, player in OBS).
- Moderation backend or bot bans.
- Analytics or history stored on a server.
- **YouTube search by text:** Resolving a text query to a video ID requires YouTube Data API `search.list`; the key must not live in the client. Out of scope or later with a server-side proxy or secured API key.
- **Video duration** in queue or Now Playing: oEmbed does not provide duration; YouTube Data API `videos.list` does (with API key). Omit duration or show "–" unless a secured key or server is introduced.

If a feature would require server-side state or a new backend service, it does not belong in the current product direction; revisit ARCHITECTURE and this roadmap before adding it.

---

## Using this roadmap when building

- Before implementing a feature, check that it does not rely on server persistence or break the client-only model.
- Complete phases in order where possible so config and message schema stay stable.
- When adding a new capability (e.g. skip, reorder), ensure it fits the existing message schema or extend it in one place and document it; keep dock and player in sync.
- If you need to add a new "phase" or move items, update this document so future work still has a single reference.
