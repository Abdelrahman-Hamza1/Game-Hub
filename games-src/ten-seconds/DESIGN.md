# Ten Seconds: design

Vera is a thief who stole the Watchmaker's prototype: a watch that rewinds the last ten seconds.
But the Vera from those ten seconds doesn't vanish. She stays, and repeats exactly what she did.
Every heist is a plan built one ten-second slice at a time: one of you holds a door, one rings a
bell, one runs for the gem. Five heists across the city, each harder, while the Watchmaker winds
his own clock to get his watch back.

**Hook:** You're the whole crew. Plan it, perform it, then watch five copies of yourself pull it
off in perfect sync.

## Pillars

1. **The loop is a promise.** The rules never bend. The same plan always plays out the same way
   (fully deterministic).
2. **Planning should feel like conducting, not bookkeeping.** The timeline makes changing one part
   of the plan cheap. Never make the player redo good loops.
3. **Every object is a reason to need one more of you.** New mechanics are new ways for copies to
   work together.

## The loop contract (six rules, no exceptions)

1. **A loop is ten seconds** (600 ticks at 60 Hz; some levels override the length). The clock
   starts on the player's first input.
2. **Copies repeat you exactly.** A finished loop becomes a copy that replays its recorded position
   and actions per tick.
3. **The world resets, copies don't.** Doors, guards, items and cameras reset at the start of every
   loop. Only copies carry over.
4. **Blocked copies break.** If a copy's next recorded position is blocked (closed door, crate,
   another body where bodies collide), it freezes in a **paradox** for the rest of the loop and
   performs no more actions. The game shows where and when.
5. **Anyone seen is everyone caught.** If any guard, camera, laser or hound detects the player or
   any copy, the current loop fails immediately. Earlier copies are kept; the player retries the
   current loop.
6. **The goal is a thing in a place.** Get the target into the exit zone before the loop ends. Who
   carries it doesn't matter.

## Numbers

Units are tiles (16 px logical). Maps up to 40×24 tiles; larger maps scroll.

| | |
|---|---|
| Walk speed | 9.4 tiles/s, any direction, slides along walls |
| Body | radius 0.5 (touch, sight, pickups); walls collide at 0.4 (see Decisions) |
| Copies | max 6 per level (JSON `maxCopies`) |
| Drop cooldown | the dropper can't re-pick the item for 0.75 s |
| Crate push | 40% of walking speed |
| Guard | 4.4 tiles/s on route, 6.3 tiles/s to a noise, waits 6 s, cone 9 tiles × ±0.55 rad, sees anyone within 1 tile |
| Hearing | 12 tiles of path distance (JSON `hearing` overrides) |
| Camera | cone 10 tiles × ±20°, sweeps between two angles, shutter blinds it 3 s |
| Hound | blind, follows the newest copy's trail 2 s behind at 6 tiles/s, catches anyone it touches |
| Card door | open while a keycard carrier is within 1.5 tiles |
| Coin | thrown up to 6 tiles in the facing direction; its landing is a noise |
| Low wall | Use while adjacent = crouch 1 s; anyone who touches the crouched one vaults over |
| Rewind stone | touching it makes the next loop 5 s |

### Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | left stick | hold a finger on the map to walk toward it |
| Use | E / Space | A | Use button |
| Retry loop | R | Y | button |
| Delete last loop | Z | B | button |
| Re-record loop N | 1–6 | D-pad to pick, A | tap a timeline lane |
| Pause | Esc | Start | button |

Use, in priority order: press the switch/button/lure/shutter you're standing on; pass the carried
item through an adjacent window; throw a carried coin; drop the carried item; crouch at an adjacent
low wall. Walking over an item picks it up (one at a time).

## Objects

| Object | Map | Behaviour |
|---|---|---|
| Door | `A`–`H` except `E` | Blocks movement and sight while closed. Rules: `plate` (open while any wired plate/button is active), `switch` (open while an odd number of wired switches is on), `card`, `timer` (open from `open[0]` to `open[1]` seconds), `inverted` (open while none of its wires is active). Any rule can add `"invert": true`. Instant |
| Plate | `a`–`h`, type `plate` | Pressed while any actor or crate is on it |
| Switch | type `switch` | Use toggles it |
| Button | type `button` | Use makes it active for `seconds` |
| Lure | type `lure` | Use rings its bell `*`; guards in hearing range go to the bell, wait 6 s facing it, return |
| Shutter | type `shutter` | Use blinds its camera for 3 s |
| Window | `-` | Blocks movement, not sight or items. Use while carrying and adjacent: the item moves to the other side |
| Keycard | `K` | Carried; opens `card` doors near its carrier |
| Target | `T` | Carried; win when it's in the exit zone |
| Crate | `O` | Pushed by walking into it. Holds plates, blocks paths, sight and lasers, causes paradoxes |
| Low wall | `_` | Blocks movement; crouch-and-vault |
| Laser | `=` emitter | Beam runs to the next wall; anyone in it is detected. A crate or a mirror carrier stops it |
| Mirror | `M` | Carried; its carrier stops a laser safely |
| Coin | `$` | Carried; thrown |
| Rewind stone | `R` | Touching it makes the next loop 5 s |
| Bell | `*` | Where lured guards go |
| Start / Exit | `S` / `E` | |

## Threats

| Threat | Map | Behaviour |
|---|---|---|
| Guard | `@` | Walks a route (ping-pong or loop); investigates lures and coins |
| Camera | `%` | Fixed; sweeps between two angles over a period |
| Hound | `&` | Follows the trail of the most recently recorded copy, 2 s behind |
| Auditor | `!` | A guard with a watch: at the start of each loop he walks to where the newest copy stood at the end of its loop, waits, then follows his route. A second Auditor remembers the second-newest copy, and so on |

Detection fails the loop and shows a red line from the detector to who was seen, plus "Seen: copy
3 at 4.2 s".

## Ranks

- **Par:** finished in `par` loops or fewer.
- **Clean:** no paradox in the final plan.
- **Swift:** the target reached the exit before `swiftTime` in the final loop.

## The timeline

A strip across the bottom: one lane per copy plus the current recording. Each lane shows the
copy's colour and number, a bar for its active span, and event markers (use, pickup, drop, pass,
paradox ✕, detection).

- **Re-record:** pick a lane and record over it; every other copy stays.
- **Scrub:** between loops, drag the playhead to preview the whole plan at that tick.
- **Trim:** drag a lane's start handle to delay the copy, or its end handle to stop it early.
- **Plan preview:** every copy's path drawn faintly on the map, with a dot each second.
- Hard-core turns off scrubbing, trimming and re-recording.

## Difficulty

| | Assist | Normal | Hard-core |
|---|---|---|---|
| Loop length | 15 s | 10 s | 10 s |
| Slow motion | whole loop at 80% | last second at 55% | off |
| Timeline | scrub, trim, re-record, "show next step" hint | scrub, trim, re-record | recording only; every loop is final |
| Copies | 6 | 6 | par + 1 loops |

## Look, feel, audio

Heist blueprint at night: background `#091526` with a faint 16 px grid, walls `#D7E6F7`, closed
doors red `#FF4D5E`, open doors a green dashed line `#5BE49B`, plates gold `#FFC24B`, lures and
bells pink `#FF7EB6`, the target gold with a glow, the exit zone green dashed. Copies are numbered
circles: `#4CC9F0`, `#B388FF`, `#FFC24B`, `#5BE49B`, `#FF7EB6`, `#7BDFF2`. The player is white with
a glow. Guards are red with a facing dot and a translucent cone that walls clip. Fonts: Archivo
(titles), Figtree (UI), JetBrains Mono (numbers).

- **Rewind:** at the end of a loop everything streaks backwards for 0.65 s (scanlines, "◀◀
  REWIND", a descending tape sound), then the new copy appears with a soft chime.
- **Last second:** runs at 55% speed.
- **Payoff:** on success, zoom out and replay the winning loop with all copies; a sting when the
  target crosses the exit.
- **Layered soundtrack:** the clock tick is the beat; each copy adds one instrument layer.
- `prefers-reduced-motion`: no streaks or shake, a fade instead.

Sounds (all synthesized): clock tick each second (higher in the last two), footsteps panned per
actor, plate click, door slide, lure bell, paradox glitch, detection alarm, rewind sweep, success
arpeggio, the layered music loop.

## Levels

45 levels: five chapters of 8 plus a finale each. See `src/levels/`. Each level's intended
solution is in `src/solutions/` and is played by the tests.

1. **The Museum:** loops, copies, plates, doors, guards, lures, windows.
2. **The Bank:** switches, inverted and timed doors, keycards, cameras and shutters.
3. **The Gala:** lasers, mirrors, crates, boosts, bodies that collide, the Hound.
4. **The Night Train:** moving carriages, coins.
5. **The Clocktower:** loop lengths, rewind stones, the Auditor.

## Decisions

Judgment calls the brief didn't cover, or where it had to bend. Newest last.

- **Collision radius 0.4, body radius 0.5.** A 0.5-radius circle exactly fills a one-tile doorway
  and float error would jam it. Walls, doors and crates collide at 0.4; touching, seeing, plates
  and pickups use 0.5. Actors are still drawn a full tile wide.
- **Actor order.** Each tick, actors act in lane order (copy 1 first); the live player acts in the
  slot of the lane it's recording. Replaying that recording later gives the same order, so the
  winning plan replays exactly.
- **Recordings store position, facing and actions.** Facing is recorded too (not derived from
  movement), so a copy throws a coin the same way the player did even while standing still.
- **Paradox check covers crates.** A copy first pushes any crate its recorded position runs into,
  exactly as the player did; only if the crate can't move does the copy freeze.
- **Doors close on whoever is in them.** A closing door pushes the live player out to the nearest
  free spot; a copy whose next position is inside the closed door freezes in a paradox.
- **Frozen and waiting copies are still bodies.** Guards can see them. A copy waiting for its
  delayed start stands on the start tile.
- **Re-picking a dropped item.** The dropper can pick it up again only after 0.75 s *and* after
  stepping away from it, so standing still after a drop doesn't grab it back.
- **Guards turn.** Guards turn toward their next direction at 7 rad/s instead of snapping, so cones
  sweep visibly at the end of a route. They walk straight lines between route points (the level
  validator checks the lines are clear) and path around walls when they investigate a noise.
- **Hearing per level.** 1-5's bell is in the far corner of a big hall, more than 12 tiles from the
  guard. Levels can set `hearing`; 1-5 sets it so the bell carries across the hall.
- **The hound sleeps in loop 1.** It follows the newest *copy*; with no copies there is no trail.
  When its copy freezes in a paradox, the trail ends there and the hound stops 2 s short of it.
- **Rewind stones count per lane.** Loop slot N is 5 s when the copy in slot N−1 touches a stone
  (judged from its recorded path), so re-recording one loop never shuffles the lengths of others.
- **Hard-core crew size.** "Par + 1" means par + 1 loops in total, one spare.
- **Door letters skip E.** The brief gives doors `A`–`F` and the exit `E`; `E` is always the exit,
  so doors are `A`–`D` and `F`–`H`, and triggers `a`–`h`.
- **1-4 guard timing.** With the route as given, the guard's patrol left no window for a par run,
  so his JSON starts him heading north part-way through his patrol (`toward`, `warmup`).
- **1-7 Shift Change.** Two plain crossing patrols left the vault door free often enough for a
  2-loop run. The day guard still patrols a diagonal, but the night guard comes on shift at 3 s
  and watches the vault door, and the bell sits in a niche only he can hear. The runner must be
  inside before he arrives, and he must be lured before the runner can leave. A search of about
  7,800 two-loop plans finds none that win. Guards gained `start` (seconds at the spawn) and
  per-point `pauses`.
- **1-F The Ruby.** The airlock (A then B) needs two plate holders at the same moment. Doors C
  (exit wing) and D (the bell closet) are `inverted` on both plates, so the catcher and the
  bell-ringer must be in place before the plates go down. The gallery guard only hears the bell
  late in his patrol. Like 1-5, an expert 4-loop route exists: both holders step off after the
  airlock, one runs back to ring the bell, and the runner hides in the gallery's west end until
  then.
- **Targets can be named** (`targetName` in the JSON) for messages, such as "picks up the ruby".
- **The Watchmaker's rewind ends the loop, it doesn't fail it.** If it failed the loop, no lever
  holder could ever be recorded (one player can't hold three levers), so 5-F would be unwinnable.
  His rewind cuts the loop short like the clock running out: the copy is kept and stands still
  afterwards. Only a loop that must last past his check needs every lever held.
- **Auditors remember different copies.** The first Auditor (reading order) goes to where the
  newest copy ended, the second to the second-newest, and so on (5-7 Watch Room).
- **Bodies collide only off the start.** Everyone starts on the same tile, so in `bodiesCollide`
  levels two bodies only block each other once both have stepped at least 0.8 tiles from the start
  (judged from the previous tick, the same way live and in replay).
- **Chapter 2 locks.** A single press (switch, shutter) is instant, so a copy with spare time can
  usually do a second job. Chapter 2 pins jobs with booths and timers. In 2-2 the switches start
  on, and each switch's booth locks while it's off; B is `inverted` on both, so it needs both off. In
  2-8 a booth locks while its switch is off, and the plate room is a timer door open 0–3 s. In 2-F the
  front doors are a timer door that shuts at 2 s, which forces the window hand-off.
- **2-4 scanner.** The middle door is a card door with `"invert": true` (it shuts while the card is
  near), so the card can only reach the back room through the window: the relay the brief asks for.
- **2-6 camera.** The brief's "wide camera" became a narrow sweep down a one-tile corridor; a
  genuinely wide sweep leaves gaps a solo run can slip through.
- **2-F cameras.** One camera watches the teller hall; the second watches the vault shaft (the
  shutter blinds that one).
