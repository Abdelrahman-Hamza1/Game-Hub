# Echo — working notes

Echo is a solo stealth game (TypeScript + Vite, canvas 2D, Web Audio, Vitest). It's the first game
in the Game Night hub. Read `DESIGN.md` before changing gameplay; log judgment calls under
"Decisions" there.

## Commands (run in `games-src/echo/`)

```sh
npm install          # once
npm run dev          # http://localhost:5173 — hot reload (the hub bar isn't there in dev)
npm test             # vitest: propagation, materials, AI, tourists, levels, share codes, bot playtests
npm run typecheck
npm run build        # typecheck + build into ../../games/echo (the folder the hub serves)
```

To see it inside the hub (with the Game Night bar): `npm run build`, then from the repo root run
`python3 -m http.server 8000` and open `http://localhost:8000/games/echo/`.

**Always run `npm run build` before committing gameplay changes.** GitHub Pages serves
`games/echo/` straight from the branch, so the built files must be committed too.

## Layout

```
src/main.ts              boot, screen manager
src/engine/              loop (fixed 60 Hz), input (keys/mouse/touch/gamepad → actions), rng
src/world/               grid helpers, level parsing + validation, share codes
src/sound/               propagation (Dijkstra fields), pulses (reveal, hearing)
src/game/                Game state + update, constants, difficulty, memory, events
src/entities/            player, listener, swarm, mimic, tourist, minecart
src/render/              renderer (echoes, memory, effects, camera), palette, sprites, debug
src/audio/               Web Audio synth, panning, reverb, heartbeat
src/ui/                  DOM screens: title, chapters, HUD, pause, results, settings, captions
src/levels/<c>/<nn>.*    level grids + meta, loaded with import.meta.glob
src/editor/              in-browser level editor
tests/                   vitest
```

The simulation (`src/game`, `src/entities`, `src/sound`, `src/world`) never touches the DOM, canvas
or audio. It emits events (`game.events`) that the renderer, audio and UI consume. This keeps it
testable headlessly, and the bot playtests in `tests/levels.test.ts` rely on it.

## Add a level

1. Create `src/levels/<chapter>/<nn>.txt` (ASCII grid, rectangular, ≤ 96 × 64) and `<nn>.json`:
   `{ "name": "…", "stones": 3, "hint": "…", "parTime": 90 }`. Chapters are 1–5, levels 01–06.
2. Legend: `#` rock wall · `.` floor · `W` water · `G` gravel · `M` moss · `T` metal floor ·
   `X` metal wall · `K` crystal · `S` start · `E` exit · `D` drip · `F` waterfall · `R` rubble ·
   `C` Listener · `B` swarm · `Z` mimic · `P` tourist · `~` false floor (pit) · `=` rail ·
   `H` minecart.
3. `npm test` validates every level (one `S`, one `E`, rectangular, exit and tourists reachable)
   and runs the bot, which must escape with **0 alerts** (Ghost rank).
4. Or draw it in the editor (title → Editor), press Play to try it, then Export and paste the text
   into the files.

## Conventions

- No `any`. Numbers from the brief live in `src/game/constants.ts`.
- Use `rng` from the game state for anything random in the simulation (deterministic tests).
- `localStorage` access goes through `src/storage.ts` (wrapped in try/catch).
- Respect `prefers-reduced-motion` and the settings (shake, high contrast, captions).
