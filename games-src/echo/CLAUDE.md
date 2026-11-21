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

`games/echo/` is build output: it's git-ignored, and the deploy rebuilds it from source (see the
hub README). Don't commit it.

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
   `H` minecart · `!` chase trigger (with `"chase": true` in the json).
3. `npm test` validates every level (one `S`, one `E`, rectangular, exit and tourists reachable)
   and runs the bot, which must escape with **0 alerts** (Ghost rank).
4. Or draw it in the editor (title → Editor), press Play to try it, then Export and paste the text
   into the files.

## Conventions

- No `any`. Numbers from the brief live in `src/game/constants.ts`.
- Use `rng` from the game state for anything random in the simulation (deterministic tests).
- `localStorage` access goes through `src/storage.ts` (wrapped in try/catch).
- Respect `prefers-reduced-motion` and the settings (shake, high contrast, captions).

## Deploying

`npm run build` writes a fully static game to `../../games/echo/` (relative asset paths, `base: './'`),
so it runs from any folder on any static host. The only network request at runtime is Google Fonts;
every level is bundled into the JavaScript.

**GitHub Pages (how Game Night ships):** push to `main`. The hub's `.github/workflows/deploy.yml`
runs `node scripts/build-games.mjs --ci`, which tests and builds every game in `games-src/`, then
publishes the site. A failing Echo test blocks the deploy. The game is live at
`https://<user>.github.io/<repo>/games/echo/`, inside the hub.

**Echo on its own (Netlify, Vercel, Cloudflare Pages, any static host):** build, then publish the
contents of `games/echo/`. Build command `npm run build`, output directory `../../games/echo`
relative to `games-src/echo/` (or copy the folder anywhere). The `../../shared/gamenight.js` script
tag simply 404s outside the hub, and the game runs without the hub bar.

**Share links** are `…/games/echo/#level=<code>`. They work on any host because the level travels
in the URL.

**Before shipping, check:** `npm test` (all levels pass the Ghost bot), no console errors on
the title screen, level 1 and the editor, and one playthrough on a phone (touch controls, sound
after the first tap).

## Known issues

- **Gamepad-only players:** browsers only allow audio to start after a click, tap or key press,
  and gamepad buttons don't count. A gamepad player gets sound after their first click or key.
- **Holding Shift through a pause:** held keys are cleared on resume/retry so nothing sticks. On
  macOS (no modifier auto-repeat) that means pressing Shift again to keep sneaking.
- **Bot coverage:** the playtest bot proves every level can be escaped silently. It never uses
  stones, carts or claps, so it doesn't test that those tools work well in a level.
