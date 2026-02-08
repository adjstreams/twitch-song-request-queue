# Twitch Song Request Queue

A small, client-side app for Twitch streamers: viewers request YouTube videos with a chat command (e.g. `!sr`), and a queue is shown and controlled in a **dock** while a **player** page plays the videos (e.g. as an OBS Browser Source).

- **Dock:** Controller UI — Twitch chat, queue, add/clear/skip. Must stay open during the stream.
- **Player:** Full-screen YouTube player for OBS. Receives commands from the dock and reports when a video ends.

No server-side persistence: queue and state live in the browser. Dock and player talk over `BroadcastChannel`, so they must run in the **same browser process** (e.g. both in OBS, or both in Chrome — not dock in Chrome and player in OBS).

---

## Quick start

**Prerequisites:** Node.js (for the static server).

1. Clone the repo and install (if needed):
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open the **dock** in your browser:  
   [http://localhost:3000/dock/](http://localhost:3000/dock/)
4. Open the **player** in the same browser (or in OBS as a Browser Source):  
   [http://localhost:3000/player/](http://localhost:3000/player/)  
   For OBS: add a Browser Source and set the URL to `http://localhost:3000/player/` (and run the dock in OBS as well if you use OBS’s browser, so they share the same process).
5. In the dock, Twitch connects anonymously to the configured channel (default: **adjstreams**). In Twitch chat, use:
   ```text
   !sr https://www.youtube.com/watch?v=VIDEO_ID
   ```
   Or paste a YouTube URL into the dock’s text field and add it to the queue.

When the dock shows **Connected**, the player will play the queue in order. When a video ends, the next one starts automatically.

---

## Project structure

| Path | Purpose |
|------|--------|
| `src/dock/` | Dock UI (controller): `index.html`, `dock.css`, `dock.js`. Served at `/dock/`. |
| `src/player/` | Player page (OBS Browser Source): `index.html`, `player.css`, `player.js`. Served at `/player/`. |
| `server.js` | Static file server; no API or persistence. Redirects `/` to `/dock/`. |
| `docs/ARCHITECTURE.md` | Technical architecture, project structure, testing, client-only constraints. |
| `docs/ROADMAP.md` | Feature list and phases for future work. |

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical architecture, communication (BroadcastChannel), project layout, testing, and what is out of scope.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — Planned features and phases; use when adding or changing features.

---

## Licence

See [LICENSE](LICENSE) if present; otherwise treat as unlicensed for your use.
