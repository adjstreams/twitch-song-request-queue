# Twitch Song Request Queue

A small, client-side app for Twitch streamers: viewers request YouTube videos with a chat command (e.g. `!sr`), and a queue is shown and controlled in a **dock** while a **player** page plays the videos (e.g. as an OBS Browser Source).

- **Dock:** Controller UI — Twitch chat, queue, add/clear/skip. Must stay open during the stream.
- **Player:** Full-screen YouTube player for OBS. Receives commands from the dock and reports when a video ends.

No server-side persistence: queue and state live in the browser. Dock and player talk over `BroadcastChannel`, so they must run in the **same browser process** (e.g. both in OBS, or both in Chrome — not dock in Chrome and player in OBS).

---

## Use via GitHub Pages (no download)

You can use the app directly in your browser and in OBS:

- **Instructions and URLs:** [https://adjstreams.github.io/twitch-song-request-queue/](https://adjstreams.github.io/twitch-song-request-queue/)
- Add the **dock** as a Custom Browser Dock in OBS (View → Docks → Custom Browser Docks) using the dock URL from that page.
- Add the **player** as a Browser Source using the player URL from that page.
- In the dock, open **Settings**, set your Twitch channel and command prefix, then **Save and reconnect**.

You only need to clone or download this repo if you want to **host it locally** (e.g. on your own machine or server).

---

## Local hosting

The app is static HTML, CSS, and JavaScript. There is a **Node** script (`server.js`) that serves the files and is convenient for local use, but any static file server will work — no backend or API is required.

**Using the included Node server:**

1. Clone the repo and install (if needed):
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open the **instructions page** in your browser:  
   [http://localhost:3001/](http://localhost:3001/)  
   From there you can open the dock and player; the URLs on the page will show `http://localhost:3001/dock/` and `http://localhost:3001/player/`.
4. In the dock, open **Settings**, set your **Twitch channel** (the channel where viewers will type `!sr`) and optionally the command prefix (e.g. `sr` for `!sr`). Click **Save and reconnect**. When it shows **Connected**, viewers can request songs in chat:
   ```text
   !sr https://www.youtube.com/watch?v=VIDEO_ID
   ```
   Or paste a YouTube URL into the dock and add it to the queue.

When the dock shows the player as connected, the player will play the queue in order. When a video ends, the next one starts automatically.

**Port:** The server uses port **3001** by default (or `process.env.PORT` if set).

---

## Project structure

| Path | Purpose |
|------|--------|
| `src/` | Static site: `index.html` (instructions), `dock/`, `player/`. |
| `src/dock/` | Dock UI (controller): `index.html`, `dock.css`, `dock.js`. Served at `/dock/`. |
| `src/player/` | Player page (OBS Browser Source): `index.html`, `player.css`, `player.js`. Served at `/player/`. |
| `server.js` | Optional Node static file server; serves `src/` at `/`. No API or persistence. |
| `docs/ARCHITECTURE.md` | Technical architecture, project structure, testing, client-only constraints. |
| `docs/ROADMAP.md` | Feature list and phases for future work. |

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical architecture, communication (BroadcastChannel), project layout, testing, and what is out of scope.
- **[docs/BEHAVIORS.md](docs/BEHAVIORS.md)** — Expected behaviors and testing checklist; use when adding or changing features to ensure existing behaviors are not broken.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — Planned features and phases; use when adding or changing features.

---

## Licence

See [LICENSE](LICENSE) if present; otherwise treat as unlicensed for your use.
