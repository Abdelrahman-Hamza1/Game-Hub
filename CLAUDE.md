# Short Rope

Co-op 2D climbing game in the browser. Design: `DESIGN.md` (v1 scope, difficulty in §8, build steps in §12).

## Run, test, build

- `npm install` once (Node 18+; CI uses Node 20)
- `npm run dev`: dev server at http://localhost:5173/short-rope/
- `npm test`: Vitest. Physics tests (`src/sim/sim.test.ts`) and scripted climbs of crag routes (`src/sim/climb.test.ts`)
- `npm run build`: typecheck + production build to `dist/`
- `npx vite preview --port 4173`: serve the build at http://localhost:4173/short-rope/

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: test, build, publish `dist/` to GitHub Pages
(repo Settings → Pages → Source: GitHub Actions). Vite `base` is `/short-rope/`.

## Code map

- `src/sim/`: pure simulation, no DOM. Runs on the host only.
  - `rope.ts`: rope as sections between anchors; quickdraws are pulleys with capstan friction; belay device slip
  - `climber.ts`: chest + pelvis physics, limb constraints, muscles toward a pose, pump, feet, chalk
  - `world.ts`: one attempt: clipping, falls, bot belayer, attempt end, `snapshot()` for network/render
  - `routes.ts`: grade-recipe route generator and the home crag
- `src/game/`: session (players, roles, energy, send styles), storage (settings/logbook), share codes
- `src/net/net.ts`: Trystero (Nostr) rooms; first in hosts; host sends snapshots at 30 Hz, guests send inputs
- `src/render/`: Canvas 2D renderer and procedural textures
- `src/input/input.ts`: keyboard + mouse to `InputFrame` (touch layer goes here later)
- `src/main.ts`: app shell, screens, game loop

## Testing in a browser

`window.__shortRope` exposes the app (lobby, snap, renderer) for automated browser tests.
To test online play, open two browser profiles on the same `?room=` link.

## Conventions

- Units are metres, kilograms, newtons, seconds; y points up, ground is y = 0.
- Everything in `Snap` and `Lobby` must stay plain JSON (it goes over the network).
- Discrete inputs are counters in `InputFrame.seq`, so dropped packets never lose a press.
