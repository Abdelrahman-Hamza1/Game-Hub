# All Hands: working notes

A co-op puzzle platformer for exactly four players (TypeScript + Vite, canvas 2D, Web Audio,
Vitest), part of the Game Night hub (`games-src/all-hands/`). Read `DESIGN.md` before changing
gameplay; log judgment calls under "Decisions" there. The approved look is the "All Hands ·
Sorbet" page of the UI canvas (https://claude.ai/artifact/RLeiEwqBcbKE4en6kUJ6pe).

## Commands (run in `games-src/all-hands/`)

```sh
npm install                        # once (Node 18+; CI uses Node 20)
npm run dev                        # http://localhost:5176 (serves the hub's SDK too)
npm test                           # physics rules, every level builds, every level's bots win
npm run build                      # typecheck + build into ../../games/all-hands (git-ignored)
node tools/check-levels.mjs        # level format checker; `--show 3/05` prints a grid with rulers
```

Scratch tests go in `tests/tmp/` (git-ignored, run with `SCRATCH=1 npx vitest run tests/tmp/x.test.ts`).
`tests/tmp/trace.test.ts`-style tracing (`LV=2-4 EVERY=30`) prints each player's position per tick
while a solution plays; keep one around when tuning levels.

## Layout

```
levels/<world>/<nn>.txt + .json   the 48 levels (grid + settings); finales would be f.txt
tools/check-levels.mjs            format checker (no dependencies)
src/sim/                          the deterministic simulation: no DOM, no clocks, no Math.random
  constants.ts                    every movement number (the stack table depends on these)
  level.ts                        parse a level; static tile codes
  world.ts                        World: bodies, collision, pushing, platforms, camera, save/load
  player.ts                       input → run, jump, grab/throw, the key, the door, pops, flags
  objects/registry.ts             every kind of level object, in update order
  objects/<kind>.ts               plate, button, gate, bridge, lift, mover, scale (pans)
src/solutions/                    scripted solutions: dsl.ts (the bot language), run.ts, <w>-<nn>.ts
src/render/                       renderer.ts (Sorbet look), things.ts (one drawer per object kind),
                                  sprite.ts (the pixel cubes), palette.ts (per-world colours)
src/game/session.ts               one level being played: fixed 60 Hz steps, quick chat
src/net/net.ts                    online: host runs the world, guests send inputs, snapshots at 30 Hz
src/input/input.ts                four keyboard sets, gamepads, touch → input bits per device
src/ui/                           screens.ts (menus), play.ts (HUD, touch controls)
src/app.ts                        screens, slots (who drives which player), the loop, online glue
src/levels.ts                     bundles every level file; world names and colours
```

## Rules for the simulation

- **Deterministic.** No `Math.random`, `Date` or iteration over unordered collections in
  `src/sim/`. Bodies move lowest first (whatever you stand on has already moved), ties by id.
- **Bodies vs things.** Bodies (players, crates, blocks, key, lantern) have positions and fall.
  Things (plates, gates, lifts…) are level objects with their own state. Platforms move before
  bodies; sensors update after; things that power wires come before gates in the registry.
- **Units:** tiles and seconds, y grows downward. Movement numbers live in `constants.ts`;
  `tests/physics.test.ts` pins the stack table, gap widths, throws and springs. If you change a
  number, every level's solution test tells you which levels it broke.

## Add a level

1. Write `levels/<w>/<nn>.txt` (legend in DESIGN.md "Level file format") and `<nn>.json` (`name`,
   `hint`, `par`, object settings, plus `solution` notes and `why4` for whoever verifies it).
2. `node tools/check-levels.mjs <w>/<nn>` until it passes. The level appears in the game
   automatically (`src/levels.ts` bundles the folder).
3. Write `src/solutions/<w>-<nn>.ts` with the DSL and run
   `npx vitest run tests/solutions.test.ts -t " <w>-<n> "` until the bots win. Set `par` to about
   1.3× the bots' time.
4. A new world needs an entry in `WORLDS` (src/levels.ts) and a look in `LOOKS` (render/palette.ts).

## Add a kind of object

1. `src/sim/objects/<kind>.ts`: a class implementing `Thing` (types.ts) and `build(lv)` that
   finds its tiles (`runs`, `groups`) and reads its JSON settings. `plate.ts` is the simplest
   sensor, `lift.ts` the simplest platform (`w.movePlatform` shoves bodies in the way; riders
   follow by themselves).
2. List it in `objects/registry.ts`.
3. Draw it in `src/render/things.ts` (`drawThing`), teach `tools/check-levels.mjs` its tile and
   JSON key, document it in DESIGN.md, and add a test.

## Testing in a browser

`window.__allHands.autoplay('2-4')` starts a level with four bots playing its solution through the
real game loop; `__allHands.status` reports `{ level, status, t, pops }`.

## Deploying

Same as every Game Night game: push to `main` and `.github/workflows/deploy.yml` runs
`node scripts/build-games.mjs --ci`, which tests and builds every game. A failing test (any
level's bots, the physics rules) blocks the deploy. `npm run build` alone writes a fully static
game to `../../games/all-hands/` (relative paths), which works on any static host; outside the
hub, online play is unavailable and everything else works.
