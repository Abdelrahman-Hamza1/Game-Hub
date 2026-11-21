# Ten Seconds: working notes

A solo time-loop heist (TypeScript + Vite, canvas 2D, Web Audio, Vitest), part of the Game Night
hub (`games-src/ten-seconds/` in the Game-Hub repo). Read `DESIGN.md` before changing gameplay;
log judgment calls under "Decisions" there.

## Commands (run in `games-src/ten-seconds/`)

```sh
npm install          # once (Node 18+; CI uses Node 20)
npm run dev          # http://localhost:5175 (serves the hub's SDK too, so the Game Night bar shows)
npm test             # vitest: sim unit tests, level validator, every level's scripted solution
npm run typecheck
npm run build        # typecheck + build into ../../games/ten-seconds (git-ignored build output)
```

Inside the hub: `npm run build`, then `python3 -m http.server 8000` at the repo root and open
`http://localhost:8000/games/ten-seconds/`. `#play=1-3` in the URL opens a level directly (if it's
unlocked; Settings → "Unlock every heist").

## Layout

```
src/main.ts                 boot, screen manager, the window.__tenSeconds test hook
src/sim/                    the deterministic simulation (no DOM, no Math.random, no clocks)
  constants.ts              every number from the design
  level.ts                  parse + validate level files
  world.ts                  World: state + tick() (tick order documented at the top)
  actors.ts                 live player and copies: movement, collision, crate pushing, paradox
  recording.ts              per-tick position/facing/actions; trim (delay, cut)
  objects/                  items (use, windows, coins), triggers, doors, lasers
  threats/                  guard (+ Auditor), camera, hound, lamp (pendulum), watchmaker
  vision.ts, path.ts        line of sight and cones; grid paths for threats
  scrub.ts                  Preview: re-simulate the copies to any tick (scrubbing, plan markers)
  hash.ts                   state hash (determinism tests)
src/game/session.ts         one attempt at a level: lanes, re-record, retry, delete, trim, phases
src/game/difficulty.ts      assist / normal / hard-core
src/render/                 renderer (blueprint map, cones, actors, effects), timeline, palette
src/audio/                  synth sounds (audio.ts) and the layered music (music.ts)
src/input/input.ts          keyboard, gamepad, touch → movement + actions
src/ui/                     play screen, menus, title demo
src/levels/<c>/<nn>.txt     level grids (+ .json settings); finales are f.txt / f.json
src/solutions/<c>-<nn>.ts   the scripted solution of every level
tests/                      vitest (tests/tmp/ is git-ignored scratch space)
```

The simulation never touches the DOM. Everything the screen shows or plays comes from the World's
state and its events (`world.events`, `world.log`).

## Rules for the simulation

- **Determinism is the promise.** No `Math.random`, `Date`, `performance.now` or iteration over
  unordered collections in `src/sim/`. The same lanes always give bit-identical states
  (`tests/sim.test.ts` hashes them).
- Actors act in lane order; the live player acts in the slot of the lane it records into. Never
  reorder this: replays depend on it.
- The live player and its later copy must run the same code (`stepLive` and `stepCopy` share
  `useAction`/`afterMove`). Anything new an actor can do goes in that shared path.
- Numbers go in `constants.ts`; per-level overrides go in the level JSON.

## Add a level

1. `src/levels/<chapter>/<nn>.txt` (ASCII, rectangular, closed border) and `<nn>.json`. Legend:
   `#` wall · `.` floor · `S` start · `E` exit · `T` target · `A`–`H` doors (not `E`) · `a`–`h`
   triggers · `-` window · `_` low wall · `K` keycard · `M` mirror · `$` coin · `O` crate · `=`
   laser emitter · `*` bell · `R` rewind stone · `@` guard · `%` camera · `&` hound · `!` Auditor.
   Guards, cameras and lasers take their settings from JSON arrays in reading order.
2. JSON: `name`, `par`, `swiftTime`, `hint`, `doors` (`rule`: plate · switch · button · card ·
   timer · inverted · cycle; `wires`; `invert`), `triggers` (`type`: plate · switch · button ·
   lure · shutter · lever), `guards` (`route`, `mode`, `toward`, `pause`, `warmup`, `face`),
   `cameras` (`from`, `to` in degrees, `period`, `phase`), `lasers` (`dir`), and optionally
   `loopSeconds`, `maxCopies`, `hearing`, `bodiesCollide`, `lamps`, `watchmaker`.
3. Write `src/solutions/<c>-<nn>.ts` with the dsl (`go`, `to`, `at`, `wait`, `until`, `use`,
   `face`). `npm test` validates the level and plays the solution: it must win within par with a
   second to spare.
4. Tuning tip: copy `tests/tmp/trace.ts` style traces (guard positions every 0.25 s) and grid-search
   wait times in a scratch test under `tests/tmp/`.

## Testing in a browser

`window.__tenSeconds` exposes `play` (the PlayScreen, with `session` and `autopilot`),
`startLevel(id)`, `autoplay(k)` (plays loop k of the level's solution through the real input path)
and `manual()`.

## Deploying

Push to `main`: the hub's `.github/workflows/deploy.yml` tests and builds every game in
`games-src/` and publishes the site. `games/ten-seconds/` is build output; don't commit it.

## Milestones

- [x] M1 Core loop: sim, recording/replay, paradoxes, plates, doors, lure, guard, timeline lanes
      with re-record, retry, delete; levels 1-1 to 1-5 with solution tests.
- [x] M2 Timeline and planning: scrub (drag the ruler, `,` `.`), trim (drag a bar's ends or the bar), plan
      paths with a dot per second, markers with tooltips (upcoming ones faint while recording),
      detection explained in words and with a red line, also for the plan preview.
- [ ] M3 Chapter 1 complete
- [ ] M4 Feel and audio
- [ ] M5 Chapter 2
- [ ] M6 Editor and sharing
- [ ] M7 Chapters 3–5
- [ ] M8 Polish
