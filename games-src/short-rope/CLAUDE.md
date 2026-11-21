# Short Rope

Co-op 2D climbing game in the browser, part of the Game Night hub (this folder is `games-src/short-rope/`
in the Game-Hub repo; it was imported with its history from the standalone `short-rope` repo).
Design: `DESIGN.md` (v1 scope, difficulty in §8, build steps in §12).

## Run, test, build

- `npm install` once (Node 18+; CI uses Node 20)
- `npm run dev`: dev server at http://localhost:5174/ (serves the hub's SDK too, so the Game Night bar shows)
- `npm test`: Vitest. Physics tests (`src/sim/sim.test.ts`), scripted climbs of crag routes (`src/sim/climb.test.ts`), and glitch regressions (`src/sim/stability.test.ts`: no teleports, no foot flicker, no failed clips with the bot)
- `npm run build`: typecheck + production build to `../../games/short-rope/` (git-ignored build output)
- To try it inside the hub: build, then `python3 -m http.server 8000` at the repo root and open
  http://localhost:8000/games/short-rope/ (or http://localhost:8000/room.html?game=short-rope for a room)

## Deploy

Every push to `main` runs the hub's `.github/workflows/deploy.yml`, which tests and builds every game
in `games-src/` and publishes the whole site. Vite `base` is `./`, so the game works from any folder.

## Code map

- `src/sim/`: pure simulation, no DOM. Runs on the host only.
  - `rope.ts`: rope as sections between anchors; quickdraws are pulleys with capstan friction; belay device slip
  - `climber.ts`: chest + pelvis physics, limb constraints, muscles toward a pose, pump, feet, chalk
  - `world.ts`: one attempt: clipping, falls, bot belayer, attempt end, `snapshot()` for network/render
  - `routes.ts`: grade-recipe route generator; gym walls (`generateWall`: several colour routes interleaved on one face, holds tagged with `r`), `wallRoute` turns one colour into a climbable `Route`; the home gym is `CRAG_WALLS`
  - `script.ts`: a scripted leader used by tests
- `src/game/`: session (players, roles, energy, send styles, belay stars, day board, day awards), storage (settings/logbook), share codes, coach tips, ghost (records sends from snapshots, replays the fastest per route)
- `src/net/net.ts`: online play over a Game Night room (`GameNight.room` from `shared/gamenight.js`). The room's host is the game host; it sends snapshots at 30 Hz, guests send inputs. Message types are prefixed `sr:`.
- `src/hub.ts`: types and helpers for the Game Night SDK (room, mute button, room links). Everything degrades to "no hub" without it.
- `src/render/`: Canvas 2D renderer (an indoor gym: a route's holds share its grade-band tape colour from `routeTape`, other routes are faded decoys, wall colour is a setting) and procedural panel/mat textures
- `src/input/input.ts`: keyboard + mouse to `InputFrame` (touch layer goes here later)
- `src/main.ts`: app shell, screens, game loop

## Testing in a browser

`window.__shortRope` exposes the app (lobby, snap, renderer) for automated browser tests.
To test online play, create a room at `room.html?game=short-rope` and join its code from a second
browser profile (or a private window). Inside a room the game skips its menu; only the host gets an
"End game" button, which sends everyone back to the room's lobby.

## Conventions

- Units are metres, kilograms, newtons, seconds; y points up, ground is y = 0.
- Everything in `Snap` and `Lobby` must stay plain JSON (it goes over the network).
- Discrete inputs are counters in `InputFrame.seq`, so dropped packets never lose a press.
- The climber solver turns constraint corrections into velocity. Never snap a held body: give new constraints slack that shrinks (see `Limb.ext`), or the body teleports.
- Gym walls: a wall route's `holds` are all the wall's holds. Use `ownHold(route, h)` for anything that should only use the route's colour (starts, feet, scripted climbs); hands may grab any colour, which sets `offRoute` and voids the send.
- Drawing: the host interpolates between 60 Hz sim steps; guests play a snapshot buffer ~80 ms behind the host clock.
