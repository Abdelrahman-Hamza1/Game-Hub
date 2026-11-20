# Game Night

Small browser games to play solo or with friends. It's a static site for GitHub Pages: no build step, no server, no accounts.

- **Home** (`index.html`): every game as a ticket card, with filters, search, a "continue" card, and create/join room.
- **Rooms** (`room.html`): peer-to-peer rooms with a 4-letter code, a lobby, and a game picker. Games run inside the room page, so the connection lasts the whole night.
- **About** (`about.html`): what the site is, how rooms work, privacy, changelog.

The repo is called `Game-Hub`; the site is called **Game Night**.

## Run it locally

Pages need to load `games.json`, so open them through a local server (opening the files directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

To test a room, open `http://localhost:8000/room.html` in one window, then join with the code from a second window (a private window works too, so you get a separate player name).

**Dev mode.** Add `?dev` to any page URL to show games marked `"dev": true` (like the Tap Test template). Use `?dev=off` to turn it off. The setting is remembered per browser.

## Deploy on GitHub Pages

1. Push to `main`.
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. The site goes live at `https://abdelrahman-hamza1.github.io/Game-Hub/`.

`.nojekyll` is required. Without it, GitHub's Jekyll step drops folders that start with `_`, including `games/_template`.

## Add a game

1. Copy `games/_template/` to `games/<your-id>/`. Use lowercase letters, numbers, and dashes, like `dots-and-boxes`.
2. Build your game in that folder. Keep this script tag in its `index.html`:
   ```html
   <script src="../../shared/gamenight.js"></script>
   ```
3. Add an entry to `games.json`:
   ```json
   {
     "id": "dots-and-boxes",
     "title": "Dots & Boxes",
     "blurb": "Draw lines, close boxes, take another turn.",
     "players": [2, 4],
     "modes": ["same-screen", "online"],
     "color": "red",
     "pattern": "dots",
     "tags": ["classic"],
     "added": "2026-12-01",
     "howTo": "Take turns drawing a line between two dots.\nClose a box to score it and go again."
   }
   ```
4. Add a line to "What's new" in `about.html`.

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Must match the folder name. |
| `title` | yes | |
| `blurb` | | One short sentence for the card. |
| `players` | | `[min, max]`. Defaults to `[1, 1]`. |
| `modes` | | Any of `solo`, `same-screen`, `online`. Games with `online` (and max > 1) show up in the room's game picker. |
| `color` | | `red`, `gold`, `mint`, `sky`, `plum`, `slate`. Used on the card and the game bar. |
| `pattern` | | Card art if there's no thumbnail: `dots`, `grid`, `checker`, `stripes`, `rings`, `ladder`. |
| `thumb` | | Image path inside the game folder, e.g. `"thumb.png"`. Replaces the pattern. |
| `tags` | | Used by search. |
| `added` | | `YYYY-MM-DD`. Shows a "NEW" flag for 21 days. |
| `howTo` | | Shown from the "How to play" button. Use `\n` for line breaks. |
| `dev` | | `true` hides the game unless dev mode is on. |

## The game SDK (`shared/gamenight.js`)

```js
const { meta, room } = await GameNight.ready();

GameNight.save('best', 42);           // per-game storage in this browser
GameNight.load('best', 0);
GameNight.sound.on;                   // respect the mute button in the bar
GameNight.playerName();

if (room) {                           // null unless the game is running inside a room
  room.me;        // { id, name, color, host }
  room.players;   // everyone, including you
  room.isHost;

  room.send('move', { x: 3 });        // to everyone else
  room.sendTo(playerId, 'hand', [...]);
  room.sendToHost('move', { x: 3 });

  room.on('move', (data, fromId) => { ... });
  room.onPlayers(players => { ... });  // joins, leaves, renames

  room.end('Blue Fox won!');          // host only: everyone returns to the lobby
}
```

Outside a room, the SDK adds a top bar with a back link, the game title, How to play, mute, and fullscreen. Inside a room, the room page shows its own bar instead. If a game only has the `online` mode and someone opens it directly, the SDK offers to host a room with it.

**Tip for multiplayer games:** let the host decide what happens. Players send their inputs to the host with `sendToHost`, the host checks them, updates the game state, and sends the new state to everyone with `send`. That keeps everyone in sync and makes cheating harder.

## How rooms work

- They use [PeerJS](https://peerjs.com/) (WebRTC). The host's browser registers the id `gamenight-room-<CODE>` with PeerJS's free public broker, and players connect to it directly.
- It's a star layout: players only talk to the host, and the host relays messages.
- If the host leaves, the room closes. The limit is 8 players.
- PeerJS's default public STUN/TURN servers handle most networks. Some strict networks still block peer-to-peer connections.
- If you later want rooms that outlive the host, or leaderboards, swap the transport in `assets/js/room.js` for something like Firebase or Supabase. Games only use the `room` API, so they don't need to change.

## Layout

```
index.html  about.html  room.html  404.html  games.json  .nojekyll
assets/css/   base.css (tokens + shared parts), hub.css, room.css
assets/js/    core.js (site helpers), hub.js, room.js
assets/icons/ favicon.svg
shared/       gamenight.js (the SDK every game includes)
games/<id>/   one folder per game
```
