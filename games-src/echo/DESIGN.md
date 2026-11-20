# Echo — design

> Sound is how you see, and sound is how you're found.

You play **Mira**, a blind cave guide. 300 m underground the generator fails, the lamps die and the
tourists scatter. Mira navigates by echolocation: footsteps, tongue clicks, claps and thrown stones
send out sound that briefly reveals the cave as glowing echoes on a black screen. The **Listeners**
that live down here are blind too, and hunt by sound. Get out, and bring the tourists with you.

## Pillars

1. **Sound is sight.** Nothing is drawn unless sound reaches it. Louder sounds reveal more. Sound
   travels along tunnels and bends around corners, but never passes through walls.
2. **Sight is risk.** Every sound the player makes to see can be heard by threats in range. Seeing
   more always costs safety.
3. **The cave talks back.** The world makes its own sounds (drips, wind, waterfalls, creatures). A
   skilled player reads them and moves almost silently.

Every decision below is checked against these three.

## Units

Distances are in tiles. One logical tile is 16 px; the camera scales to the screen (≈26 tiles
across a portrait phone, 40 on desktop). The simulation runs at a fixed 60 Hz; rendering runs on
`requestAnimationFrame`.

## Sound propagation (`src/sound/`)

- Every sound is a **pulse**: `{source, radius, hearRadius, kind, start, field}`.
- `field` is a Dijkstra distance map over passable tiles from the source tile. 8-directional,
  orthogonal cost 1, diagonal 1.414, **no corner cutting** (a diagonal step needs both orthogonal
  neighbours passable). Expansion stops past `limit = max(radius, hearRadius × hearingMultiplier) + 3`.
- Ring radius `r = (now − start) × 16`. The pulse ends when `r > radius + 3`.
- **Wall reveal.** Boundary walls (walls touching a passable tile) are precomputed per level.
  `wallDist = min(field[n] + 0.5 orthogonal, + 0.7 diagonal)`. A wall lights when
  `|r − wallDist| < 1.1` and `wallDist ≤ radius + 0.5`, with brightness
  `1 − 0.55 × min(1, r / (radius + 1))` × the sound kind's brightness × the material factor.
- **Floor wavefront.** Passable tiles with `|r − field| < 0.55` and `field ≤ radius` draw a faint
  dot in the pulse colour, alpha `(1 − field/radius) × 0.35`. This is what shows sound bending
  around corners.
- **Memory.** A lit wall keeps its brightness, decaying exponentially with the difficulty's
  echo-memory time constant, and remembers the colour of the last pulse that lit it.
- **Hearing.** When a pulse is created, every listening entity whose tile has
  `field ≤ hearRadius × hearingMultiplier` hears it and receives the field. It walks *downhill* on
  that same field to reach the source, so paths around walls come for free.
- Fields for static emitters (wind, drips, waterfalls, patrol targets) are cached per
  `(tile, limit)`.

## Player (`src/entities/player.ts`)

| Action | Keys / pad / touch | Effect |
|---|---|---|
| Move | WASD, arrows / left stick / hold finger | 3.4 tiles/s, circle radius 0.28, slides along walls |
| Sneak | Shift / LT / Sneak toggle | 1.5 tiles/s |
| Footstep | automatic | every 0.9 tiles: radius 4 × floor multiplier. Sneaking: every 0.7 tiles, radius 1.2 × multiplier |
| Tongue click | F / X / Click | cone radius 6, 70°, facing direction, cooldown 0.4 s, heard as radius 3 |
| Clap | Space / A / Clap | radius 12, cooldown 0.7 s |
| Throw stone | mouse click / RT + right stick / quick tap | straight line, up to 10 tiles at 14 tiles/s, stops at walls, radius-9 pulse on landing |
| Cane tap | Q / B / Cane | radius 2, front only, heard within 1 tile, cooldown 0.3 s |
| Hold hand | E / Y / Hand | grab or release the nearest tourist within 1.2 tiles; on rubble, pick up a stone (max 5) |
| Pause | Esc / Start / ❚❚ | pause menu |
| Retry | R | instant restart |
| Debug | F3 | fps, pulses, last field heatmap, Listener states and paths |

## Materials

| Material | Tiles | Colour | Footstep × | Echo |
|---|---|---|---|---|
| Rock | `.` floor, `#` wall | `#4CC9F0` | 1.0 | normal |
| Water | `W` | `#3A86FF` | 2.25 (splash, radius 9) | ripples on the floor when a ring passes |
| Gravel | `G` | `#D9A86C` | 1.5 | grainy dots |
| Moss | `M` (floor) | `#3E6B4E` | 0 (silent) | rock walls touching moss echo at half brightness, in moss green |
| Metal | `T` floor, `X` wall | `#B8C4D6` | 2.0 | metal walls keep their echo 3× longer |
| Crystal | `K` wall | `#C77DFF` | — | holds its echo for 10 s; a pulse reaching crystal continues with 2× radius beyond it |

Echo colour = the material's hue blended 30 % toward the pulse colour; the sound kind sets the
brightness. Threat sounds (Listener growls) are always pink `#FF4D6D`.

## Ambient sources

| Source | Tile | Behaviour |
|---|---|---|
| Exit wind | `E` | radius 6 pulse every 4 s, pale cyan |
| Drip | `D` | radius 5 every 2.6 s, water blue |
| Waterfall | `F` | constant noise zone, path radius 8. Player sounds from inside reach only 2 tiles; Listeners inside hear nothing. The zone shimmers faintly |
| Rubble | `R` | walkable; E picks up a stone (max 5) |

## Threats

**Listener (`C`).** patrol → hunt → search → patrol. Patrol: random tile within 7 path tiles at
1.1 tiles/s, re-pick on arrival or after 6 s. Hunt: follows the heard pulse's field at 3.1 tiles/s;
a new sound retargets it. On arrival: search 2.2 s with small random steps. Growls every 5–9 s
(radius 6, pink). Only drawn when a ring passes it. Catches within 0.75 tiles → "Heard." → 1 s →
instant retry.

**Swarm (`B`).** ~60 creatures roosting. A pulse of radius ≥ 9 reaching the roost startles it:
violet flecks fly off along the tunnels for 3 s and a radius-14 sound at the roost alerts every
Listener in range.

**Mimic (`Z`).** Invisible. 1–2 s after the player claps or clicks within its hearing, it plays a
copy of that sound from its own position, detuned by −30 cents. Real pulses always start at Mira.

## Tourists (`P`)

Sit still, breathing (radius 2 every 3 s). Holding a hand, they follow 1 tile behind in silence.
Released for more than 2 s, they panic and call (radius 8 every 2 s) until held again.

## Goals and ranks

Reach the exit. Results: time, sounds made, alerts (times a Listener switched to hunting), tourists
rescued / total. **Ghost** = 0 alerts. **Guide** = all tourists rescued. **Survivor** = escaped.
Best results per level are saved.

## Difficulty

| | Guide | Blind (default) | Hard-core |
|---|---|---|---|
| Echo memory (decay time constant) | 30 s | 2 s | instant (0.08 s) |
| Listener hearing multiplier | 0.75 | 1.0 | 2.0 |
| Stones | +3 | as listed | −2 (min 1) |
| Retry | checkpoints at tourists | level start | level start; the chapter restarts after 3 fails |

## Levels

ASCII grid in `src/levels/<chapter>/<nn>.txt` (≤ 96 × 64) plus `<nn>.json`
`{ "name", "stones", "hint", "parTime" }`. Legend: `#` rock wall, `.` rock floor, `W` water,
`G` gravel, `M` moss, `T` metal floor, `X` metal wall, `K` crystal wall, `S` start, `E` exit,
`D` drip, `F` waterfall, `R` rubble, `C` Listener, `B` swarm roost, `Z` mimic, `P` tourist,
`~` false floor (pit), `=` rail, `H` minecart (on a rail), `!` chase trigger.

1. **The Tour**: steps, clap, wind, stones, first Listener, first tourist.
2. **Flooded Galleries**: water, waterfalls, the Swarm.
3. **The Old Mine**: metal, rubble, minecarts.
4. **Crystal Halls**: crystal walls hold echoes and amplify.
5. **The Deep**: Mimics, false floors, and the final chase.

Each level is built around one idea, introduces a mechanic safely before it's dangerous, and takes
1–4 minutes for a good player.

---

## Decisions

Judgment calls the brief didn't settle, each chosen to serve the pillars.

1. **Where the code lives.** Echo is the first game in the *Game Night* hub (a static GitHub Pages
   site). Its source lives in `games-src/echo/` and `npm run build` writes the static game to
   `games/echo/`, which the hub serves. The built files are committed because GitHub Pages serves
   the branch as-is.
2. **Hub bar.** The game includes the hub's `shared/gamenight.js`, which adds the "back to Game
   Night" bar with mute and fullscreen. Echo works without it (e.g. under `npm run dev`); the
   hub's mute button also mutes Echo.
3. **Moss is a floor.** `M` is a silent moss floor. Rock walls touching moss are "mossy": they echo
   at half brightness, in moss green. Muffled walls are harder to see, which is the price of silence.
4. **Waterfall tile.** `F` is a walkable water tile. Its zone is everything within **path**
   distance 8 (so noise doesn't pass through walls either). Because the waterfall is constant
   sound, walls inside its zone glow faintly at all times: sound is sight.
5. **Who Listeners hear.** Player sounds (steps, clicks, claps, cane, stones), pushed minecarts,
   panicking tourists and the swarm's alarm. They do **not** react to ambient sounds, their own
   growls, a calm tourist's breathing, or Mimic copies.
6. **Hand grace.** Clapping or throwing lets go of the tourist's hand for 0.5 s and takes it again
   automatically (if they're still within reach), so they don't panic. An explicit release (E)
   starts the 2 s panic timer.
7. **Delivering tourists.** Stepping onto the exit while holding a tourist brings them out; bringing
   out the last one ends the level. With tourists still in the cave, stepping onto the exit with a
   free hand only asks: press E there to leave without them. A guide can ferry several tourists one
   at a time without ending the level by accident. With no tourists (or all of them out), the exit
   ends the level at once.
8. **Guide rank** is only awarded on levels that have tourists, so it always means something.
9. **Memory fade.** The brief's fade time is used as the exponential decay time constant
   (brightness × e^(−t/τ)). Hard-core uses τ = 0.08 s, so walls are visible only while the ring
   passes. Metal multiplies τ by 3.
10. **Crystal.** A lit crystal wall holds full brightness for 10 s, then decays normally.
    Amplification is modelled in the field itself: once sound reaches a tile touching crystal, the
    remaining path costs half as much, so the pulse travels twice as far beyond it. Listeners hear
    the amplified sound too, which makes crystal both a tool and a risk.
11. **Hearing range.** Fields are computed far enough for the hearing multiplier, so a hard-core
    Listener really does hear a clap from 24 path tiles away.
12. **False floor (`~`).** The brief's "fake wall" tile is a **pit** hidden by lies. Real echoes show
    a pit as a gap: no floor dots, and a dim red rim that's remembered like a wall. The Mimic's
    copies paint pit tiles as ordinary floor and **erase the remembered rim**, so a drop looks
    like a safe passage. Walking onto a `~` tile is a fall ("Fell."). The tell is the brief's: real
    pulses always start at Mira, and the copy sounds slightly detuned.
13. **Mimic hearing.** A Mimic copies a clap it hears (path ≤ 12) and a tongue click within 6 tiles.
    One copy at a time.
14. **Listeners and pits.** Listeners cling to walls and can cross pits.
15. **Swarm return.** A startled swarm settles back on its roost after 12 s.
16. **Minecarts.** `=` is a rail (metal floor), `H` a minecart standing on one. Press E next to a
    cart to push it away from you. It rolls along the rails at 6 tiles/s, rumbling (radius 8 every
    0.4 s, a moving light source and a lure) and crashes at the end of the line (radius 18).
    Each push counts as one sound made.
17. **Cane cone.** The cane reveals a 100° cone in front (radius 2). The click is the brief's 70°.
18. **Stone distance.** A stone flies to the aimed point (up to 10 tiles), or 10 tiles along the
    aim/facing direction when thrown from a gamepad.
19. **Hard-core chapter restart.** After 3 fails within a chapter on hard-core, you're sent back to
    that chapter's first level. Unlocks and best scores are kept.
20. **Share codes.** Run-length encoding + base64url, synchronous and testable, instead of a
    streaming compressor. Codes are prefixed `E1.` so the format can evolve.
21. **Offline.** All levels are bundled into the build, so the game makes no runtime requests except
    Google Fonts. No service worker: it would complicate updates on a static host for little gain.
22. **Exit visibility.** The exit becomes known (and stays known) the first time any ring reaches
    it, including its own wind.
23. **The final chase.** A level whose meta has `"chase": true` ends in a chase: when Mira steps on
    a `!` tile (or after 1.5 s if the level has none), every Listener hunts her position directly,
    re-targeting twice a second. They run at 3.1 tiles/s; Mira runs at 3.4, so a clean run escapes
    and a hesitation doesn't. Chase hunting isn't counted as an alert (the Listeners didn't *hear*
    a mistake), so the finale can still be finished as a Ghost.
24. **Verifying "beatable as a Ghost".** `tests/bot.ts` plays every level headlessly: it sneaks along
    the shortest walkable path (pits avoided), takes each tourist's hand, delivers them, and steps
    away from any Listener closer than 3.2 tiles. It never claps, throws or pushes carts. A level
    passes if the bot escapes with 0 alerts on at least one of 8 seeds. This proves every level can
    be escaped silently; it doesn't prove a level is fun, which is still judged by playing.
25. **Listeners keep a post.** The brief's patrol picks "a random tile within 7 tiles". Read
    literally from the Listener's current position, Listeners drift across the whole cave within a
    few minutes and a designer can't place a guard. A patrol target must be within 7 path tiles of
    where the Listener stands **and** within 7 of the tile it started on. After a hunt drags it
    away, it walks back to its post.
26. **E priority.** Hand first (let go / take a hand), then leaving via the exit, then rubble, then
    pushing a minecart, so a guide near a cart never shoves it by accident.
27. **Carts don't block.** Mira and Listeners pass through minecarts; they're sound sources, not
    obstacles.
