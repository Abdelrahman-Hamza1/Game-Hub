# All Hands: design

Four little pixel cubes (coral, blue, mint and yellow) have to get through every level
**together**. One key, one door, and the level is only cleared when all four are through it.
Nobody can do it alone: you stand on each other's heads to reach a ledge, push a heavy block as a
team, hold plates down for each other, and throw a friend across a gap.

**Hook:** a co-op platformer for exactly four friends, where the funniest moments come from
needing each other, and from getting in each other's way.

Genre: co-op puzzle platformer (the "everyone must reach the door" kind). The name, characters,
art style, mechanics' details and every level are our own.

## Pillars

1. **Four or nothing.** Every level needs all four players. Each new mechanic is a new reason to
   need one more friend.
2. **Bodies are the toolbox.** Players are solid to each other: you are a step, a weight, a
   counterweight and a projectile for your friends.
3. **Chaos is a feature, failure is cheap.** Pushing a friend off a ledge should be funny, not
   costly: instant respawns, no lives, short levels (1–4 minutes).
4. **Readable at a glance.** Every requirement is written on the object ("3" on a block means three
   pushers). No hidden rules.

## Players and modes

- **Exactly four players per level.** P1 coral, P2 blue, P3 mint, P4 yellow; a number floats
  over each head, so nobody depends on colour alone.
- **Same screen:** up to four on one computer, keyboards and gamepads mixed freely (see
  Controls).
- **Online:** a Game Night room. The first four players play; anyone beyond four watches. The host
  runs the simulation; others send inputs.
- **Mixed:** two on one computer plus two online, etc.
- **Phones:** touch controls (left thumb: move pad; right thumb: Jump and Grab buttons).

## Controls

| | Move | Jump | Grab / throw | Enter door |
|---|---|---|---|---|
| Keyboard left | A D | W | E | S |
| Keyboard right | ← → | ↑ | / or Right Shift | ↓ |
| Two more on one keyboard | J L (I jump, O grab, K enter) · numpad 4 6 (8 jump, 9 grab, 5 enter) | | | |
| Gamepad | stick / d-pad | A | X or B | down |
| Touch | left pad | Jump button | Grab button | down on the pad |

Esc / Start pauses. Players join on the lobby screen by pressing their Jump.

## Movement numbers (fixed: levels are designed against these)

Units are **tiles**. Logical tile = 32 px. Gravity points down (y grows downward in level files).

| Thing | Value |
|---|---|
| player body | 0.9 wide × 0.9 tall (box collider) |
| Run speed | 6 tiles/s (ground accel 60 t/s², air accel 35 t/s²) |
| Jump | apex **2.5 tiles** above the feet (variable: release early to cut it) |
| Coyote time / jump buffer | 0.1 s / 0.12 s |
| Fall speed cap | 18 tiles/s |
| Push speed (block) | 2.5 tiles/s |
| Throw | the thrown thing leaves the thrower's head and peaks **2.9 tiles** above that point, moving 7 tiles/s forward: a thrown friend's feet peak 3.8 above the thrower's floor and land 4.5–5 tiles away |

**Stack table** (what a ledge of height H above your floor needs):

| Ledge height H | Needs |
|---|---|
| 1–2 | one jump, alone |
| 3 | jump off **one** friend's head |
| 4 | a stack of **two** friends |
| 5 | a stack of **three** friends (the fourth climbs; then the others need a way up) |
| 6+ | impossible by stacking; needs a lift, spring, throw onto a stack, etc. |

A thrown player from a standing thrower reaches feet height 0.9 + 2.9 = **3.8**, so a throw also
clears a 3-tile ledge (it is mostly for **distance**, and for things that can't jump).

Gaps: a running jump crosses **4 tiles** of gap (5 is impossible alone). Jumping off a friend's
head does not add distance.

## Core rules

1. **Players are solid to each other.** You can stand on anyone. A player carries whoever stands
   on them (riders move with their base).
2. **Pushing chains.** A heavy block marked N moves only while at least N players push it in the
   same direction; players pushing the player in front of them count (a conga line of four
   pushes a 4-block).
3. **Grab.** The Grab button picks up what's next to you: the key, a crate, or **a friend**
   (who rides on your head, can't move, and escapes by pressing Jump). Grab again throws (or drops
   it, if you are holding down).
4. **One key, one door.** Whoever touches the key carries it (above their head) if their hands
   are empty; a friend beside them can take it with Down+Grab (plain Grab picks up the friend).
   The key opens the door when its carrier touches the door. Then each
   player steps in by pressing Down at the open door. **The level clears when all four are in.**
5. **Mistakes are cheap.** Falling out of the level or touching spikes pops that player back at
   the last checkpoint flag anyone touched (or the start) after 1 s. Nothing else resets. If the
   key falls into a pit, it returns to its spawn. Pause → "Restart level" resets everything.
6. **One shared camera.** The camera frames all four. It zooms out up to 1.6× the normal view; past
   that, the screen edges become walls, so nobody can run off without the others.
   (Online play uses the same shared camera, so the team has to move together everywhere.)

## Objects

| Thing | Behaviour |
|---|---|
| Heavy block | A rectangle; needs N pushers (number painted on it). Can be stood on, used as a step. Falls with gravity. |
| Crate | 1×1, weight 1, can be grabbed, carried, thrown, stood on. |
| Plate | Pressed while at least N things (players, crates, heavy blocks count by their N) stand on it; shows a counter "2/3". Powers wired gates. |
| Button | Pressed by touching it (from any side). Toggles its wires, or holds them on for T seconds (timer shown as a ring). |
| Gate (A, E–H) | A wall that opens while its wires are powered (or closes, if `invert`). Crushes nobody: a closing gate gently pushes anything in its gap out to the nearer side. |
| Lift | A platform that moves along a path while at least N players ride it; with fewer it slides back to its start. |
| Moving platform | Follows a fixed path on a loop. |
| Fragile bridge | Holds up to N players; with more it crumbles (and respawns after 3 s). |
| Scale | Two pans on a beam: the side with more weight sinks (difference × 1 tile, up to 3). |
| Spring | Launches anyone landing on it to 5.5 tiles. |
| Colour gate (1–4) | Solid to everyone except player n. |
| Checkpoint flag | Touching it moves everyone's respawn point here. |
| Spikes | Pop the player (respawn). |

Level-wide options (JSON):
- `leash: n`: all four are tied with a stretchy rope; nobody can get more than n tiles from the
  group's centre.
- `dark: true`: only a lantern's light (radius 5) shows the level; the lantern is carried like a
  crate.
- `scroll: speed`: the camera moves on its own (tiles/s); falling behind the left edge pops you.

## Level file format

`levels/<world>/<nn>.txt` (ASCII grid) + `levels/<world>/<nn>.json` (settings). Finale is `f`.
Rectangular, at least 30×17, at most 120×40. Rows are y (top row y = 0); a `.` is air.

```
#  solid ground                    .  air
-  one-way platform (stand on top, jump up through)
S  spawn: exactly four, P1..P4 in reading order
K  the key (exactly one)           D  door: exactly two tiles, one above the other
^  spikes (on a floor)             v  spikes (on a ceiling)
B  heavy block (a rectangle of B's is one block; N from JSON "blocks", reading order)
c  crate                           _  plate (adjacent _ in a row form one plate; "plates")
o  button ("buttons")              A E F G H gates (a letter's tiles form one gate; "gates")
L  lift (rectangle; "lifts")       M  moving platform (rectangle; "movers")
~  fragile bridge ("bridges")      j  spring
1–4 colour gate for P1..P4         C  checkpoint flag
s  scale pan (two pans per scale; "scales", pairs in reading order)
l  lantern (dark levels only, exactly one)
```

JSON keys: `name`, `hint` (shown at the start, one line), `par` (seconds, for the time medal),
`blocks` ([{"n":2}]), `plates` ([{"n":3,"wires":["A"]}]), `buttons` ([{"wires":["B"],"hold":4}]
or `"toggle":true`), `gates` ({"A":{"invert":false}}), `lifts` ([{"n":2,"path":[[x,y],…]}]),
`movers` ([{"path":[[x,y],…],"speed":2}]), `bridges` ([{"n":2}]), and the level options above.
Paths are tile coordinates of the object's top-left corner.

## Progress and scoring

- Worlds unlock in order; inside a world, the next two levels unlock when you clear one.
- Per level: a **crown** for clearing, a **time medal** under par, and a **no-pop medal** for
  clearing without anyone popping.
- No individual scores: the team clears or it doesn't.

## Look and sound (short version)

"Sorbet": flat pastel colour with no outlines and no texture. A peach-to-pink sky, mint ground,
apricot blocks, coral switches and gates, and a dark slate ink for text. Players are 12×12 pixel
cubes in one colour with two dot eyes and tiny feet; the square body matches the hitbox. The HUD
is white pills. Type is Outfit. The approved mock-ups are the "All Hands · Sorbet" page of the
UI canvas. Music is a soft four-part loop; every sound is synthesized.

## Decisions

(Judgment calls go here as they're made.)

Level-design pass (format and rules gaps found while writing the 48 levels; each is the smallest
change that unblocked good levels):

- **Gate letters are A, E, F, G, H.** B, C and D already mean heavy block, checkpoint and door,
  so "A–H" could not be parsed; five gates per level is plenty.
- **Lantern tile `l`.** Dark levels have exactly one `l` (the lantern's spawn); the format had no
  way to place the lantern.
- **Lost things come back.** A crate, heavy block or lantern that falls out of the map returns to
  its spawn once that spot is clear, like the key; otherwise one bad push soft-locks a level.
- **You can only jump off a friend who is supported** (standing on ground, or on something or
  someone that is), and the jump gets no extra speed from a running base. Without this a rider
  jumping off a jumping friend reaches ~6 tiles and the stack table stops being true.
- **Weight.** Plates, scales and fragile bridges count everything resting on them, stacked or
  carried: player 1, crate 1, heavy block N, key and lantern 0. So three players piled on one
  plate tile count 3. Lifts count players aboard (stacked ones too). The rules said "stand on
  it" without saying whether stacks count.
- **Wires are OR.** A gate is powered while any of its wires is on. "Both at once" is built from
  two gates in a row.
- **Closing gates push, they don't wait.** A gate that waited for its gap to be clear could be
  wedged open by one player standing in it, which beat most plate and timer puzzles with three.
  It now pushes whatever is in the gap out to the side nearer its centre, then closes.
- **Buttons** (`o`) are small solid knobs fixed to a neighbouring solid tile. A player, or a
  thrown or pushed crate or key, touching one presses it (heavy blocks don't). A `hold` button restarts its timer on
  every touch.
- **Paths.** `path[0]` is the object's position in the grid; segments are horizontal or
  vertical. Movers go through the points and back to the first, forever. Lifts move towards the
  last point while loaded and back towards the first otherwise, at 2 tiles/s.
- **Runs.** A horizontal run of `~` is one fragile bridge, a horizontal run of `s` one scale pan;
  consecutive pans in reading order make one scale (`"scales"` is optional and only for future
  settings). Each pan's grid row is its balanced rest position (the two pans of a scale may
  rest at different heights, e.g. one upstairs, one downstairs); levels leave 3 tiles of room above
  and below each pan. A pan coming down onto something stops on it, like a gate never crushing.
- **Springs** (`j`) are solid tiles. Anything landing on top (arriving from above) is launched so
  its feet peak 5.5 tiles above the spring's top; horizontal speed is kept. Walking onto a spring
  set flush in the floor does nothing; hop onto it.
- **Plates** (`_`) are thin: heights are measured from the solid tile under the plate.
- **Colour gates** let a carried thing pass with its carrier (P2 can walk the key through a `2`
  gate); loose or thrown things are blocked by every colour gate, and a carried friend is still
  blocked by gates that aren't their colour (otherwise P2 could ferry anyone through a `2` gate).
- **Scroll levels** scroll right, from the left edge until the map's right edge is in view. A
  popped player drops back in above the teammate furthest behind (so popping on purpose never
  skips an obstacle); if all four are popped, everyone
  respawns at the last flag touched and the camera goes back there. A lost key or lantern drops
  in above the frontmost player (its spawn may be off-screen).
- **Camera.** The normal view is 30×17 tiles (the minimum level size), so at 1.6× the team can
  spread over at most 48×27 tiles. No level asks the team to be further apart than about 40×24.

## Levels

48 levels in six worlds of eight (`levels/<world>/<nn>`); each world's 08 is its showpiece. Every
JSON also carries `solution` (step-by-step, P1–P4, for the verification bot) and `why4`.
`node tools/check-levels.mjs` checks the format and prints sizes (`--show 3/05` prints a grid
with rulers).

| id | name | teaches / combines |
|---|---|---|
| 1/01 | Big Push | Walk, hop, key and door; a 4-block in a tunnel needs a conga of four and drops into a hole |
| 1/02 | Leg Up | Jumping off a friend's head (3-high ledge); three up top push a 3-block down as a step for the last one |
| 1/03 | Hold the Gate | Plates: two hold the outside plate, two go in and hold the inside one |
| 1/04 | Pile On | Stacked weight: three pile on a one-tile plate while the fourth fetches the key |
| 1/05 | Garden Wall | Two-friend stack (4-high wall); the climbers' plate opens a tunnel for the stack |
| 1/06 | Doorstop | A 4-block weighs 4 on a plate and keeps an inverted-gate bridge up; key on a one-way shelf 4 high |
| 1/07 | Crossed Wires | Two pairs on two floors, each pair's plate opens the other pair's gate |
| 1/08 | Backyard Fort | Showpiece: block as paperweight, 4-block stairs, shelf key, 3-block pushed down for the last climber |
| 2/01 | Weigh In | Crates: fetch, carry and drop them as plate weight |
| 2/02 | Lean On It | Hold buttons: one leans on a far timer while three push a 3-block through |
| 2/03 | Flip Side | Toggle switch and inverted gate: a two-gate airlock for a 4-block |
| 2/04 | Going Up | A lift that needs all four aboard, so a crate holds the plate |
| 2/05 | Make Weight | Blocks of 1, 2 and a crate add up to a 4-plate; a 2-block pushed off a tower |
| 2/06 | Shift Change | Two 2-rider lifts; pairs swap between riding and holding the gate plate |
| 2/07 | Clock In | A 3-second timer against a 3-rider lift ride; the riders open a service lift for the presser |
| 2/08 | The Workshop | Showpiece: crates on a plate, 4-block through the airlock, shelf key, 4-lift, a bridge held from both sides in turn |
| 3/01 | Special Delivery | Grab and throw crates and friends onto a balcony behind a gap |
| 3/02 | Fling | Throwing friends up a 3-high roof; throwing the key; the thrower climbs a crate |
| 3/03 | Creaky Floor | Fragile bridges: cross a 1-bridge one at a time, then break a 3-floor on purpose |
| 3/04 | Boing | Springs: an open spring up a 5-high cliff, then a lidded spring opened from above |
| 3/05 | Fire Escape | A throw relay up two floors; the top pair opens springs for those left behind |
| 3/06 | Two Balconies | Throws to two balconies unlock a two-part hatch; a 1-bridge below |
| 3/07 | Chimney Pots | Only two can reach the top, so the crate is thrown up too for weight 3 |
| 3/08 | Rooftop Rally | Showpiece: throws, toggle bridge, creaky boards, trapdoor, flag, spring relay |
| 4/01 | Colour Coded | Colour gates: each player drops through their own colour to their own switch |
| 4/02 | Seesaw | Scales: three plus a crate lift the fourth 3 tiles to a 5-high tower |
| 4/03 | Ferry | Moving platform: a two-friend tower rides the ferry to a wall rising from a pit |
| 4/04 | Odd One Out | One job each: colour closet plate, the stack, and the only one who can reach the exit switch |
| 4/05 | Counterweight | A scale with one pan upstairs: climbers plus a crate up top lift the last pair |
| 4/06 | Carousel | A looping platform drops each player at their own colour stop; regroup at the start |
| 4/07 | Tug of War | One scale across two rooms; pairs split by colour floors lift each other in turn |
| 4/08 | Big Top | Showpiece: seesaw, ferry tower and counterweight rings, with colour gates throughout |
| 5/01 | Lantern Light | Dark: carry the lantern; shelf boost, 4-block tunnel, pits you only see by its light |
| 5/02 | Shadow Swap | Dark: a plate bridge held by two, then a pile-on, while the light goes back and forth |
| 5/03 | Tied Together | Leash: nobody can stay behind on the far plate, so crates hold it; 4-high wall |
| 5/04 | Tandem | Leash: two floors whose plates and gates zip the pairs forward in step |
| 5/05 | Flag Day | Checkpoints in a long level: pile-on, 4-block bridge, plate-opened spring to a key shelf |
| 5/06 | Night Scales | Dark scale: three plus a crate lift the fourth onto a roof; toggle; 3-rider lift |
| 5/07 | Four Lanes | Leash: one player per lane, every plate opens someone else's lane |
| 5/08 | Night Market | Showpiece (dark, flags): stall wall, pile-on spring, 4-lift, creaky bridge, push-down step |
| 6/01 | First Tick | Scroll intro: tunnel push, pile-on plate and a hold button while the screen moves |
| 6/02 | Stopwatch | Timed sequences: ledge timer for a 4-block push, a 4-plate, a timed lid over a 4-lift |
| 6/03 | Escapement | Lift for three while one holds the shaft lid; a timed spring cap brings the last up |
| 6/04 | Conveyor | Scroll: ferry pairs over a pit, a 4-lift, a 2-person bridge, a vertical mover |
| 6/05 | Ballast | Scale and crates: the rider up top throws crates down so each friend can ride up |
| 6/06 | Night Shift | Dark plus timer: a dash over unseen pits by lantern, then a pile-on for the key |
| 6/07 | Four Chimes | Colour cells and hold buttons in a countdown (leash 8) to open four lids |
| 6/08 | Grand Clock | Showpiece: 120-wide scroll with flags, combining pushes, piles, springs, lifts, ferry, scale |

Engine pass (building the simulation against the 48 levels):

- **Run speed is 6 tiles/s, not 7, and coyote time is 3 ticks.** At 7 tiles/s with a 0.1 s
  coyote window, a running jump could clear a 5-tile gap, which the levels rely on being
  impossible. `tests/physics.test.ts` tries every take-off tick on a 5-gap.
- **Jump speeds are solved for the stepped motion.** The world steps speed then position at
  60 Hz, which loses ~0.14 tiles of height against sqrt(2gh); `launchSpeed()` solves for the speed
  whose stepped apex is exactly the design number (jump 2.5, throw 2.9, spring 5.5).
- **The throw peaks 2.9 above the thrower's head** (the first draft said 2.0, but its own
  arithmetic, and every level, assumed a thrown friend's feet reach 3.8 above the floor).
- **A friend in the air gives no jump at all**, not even in the coyote window: you can only jump
  off someone whose stack reaches the ground.
- **A base that jumps lifts whoever stands on it**, and stops if they hit a ceiling.
- **The leash caps the team's spread at 2 × leash** (leftmost to rightmost), the same way the
  camera caps it at about 46 tiles. Only sideways: falling is never held back.
- **Quick chat** (Q, ., U, numpad 7, gamepad Y, the phone's bubble): a line over your head for 2 s;
  pressing again within 1.5 s cycles Here! → Wait! → Jump! → Go! → Hop on! → Push!.
- **Restarting online takes votes** (3, or everyone if fewer people are connected), so one
  player can't keep resetting the team. On one computer the pause menu restarts at once.
- **Practice alone:** one person drives any of the four, Tab switches. Not how the game is meant
  to be played, but it lets one person learn a level or test one.
- **Unlocks:** inside a world, clearing a level opens the next two; a world opens when the
  previous world's last level is cleared. Settings → "Open every level" opens everything.
- **No throwing from mid-air.** Grab while the thrower is in the air just lets go (the thing keeps
  the thrower's speed). A jump-throw put a friend's feet 6.2 tiles up and skipped every stack.
- **Taking the key is Down+Grab.** Plain Grab next to a friend picks up the friend (the more
  common move); Down+Grab with empty hands takes the key or lantern off their head.
- **A closing gate pushes to a free side.** Nearer side first; if something solid is there, the
  other side. It used to be able to push someone into a second closed gate and through the floor.

- **A flag counts when you step onto it.** Standing on one doesn't keep claiming it, so two
  players on two flags can't flip the respawn point every tick.
- **Popping on purpose to reach a flag is allowed.** Once a teammate has touched a flag past an
  obstacle, someone left behind can fall into a pit and come back at the flag. That's how
  checkpoints work in this genre; it costs the "nobody fell" medal, and level designs put flags
  after the puzzles that matter (5-8's terrace flag was moved below the terrace for this).
- **Plates, buttons, blocks and the other numbered objects take their JSON entries in reading
  order** (top row first, left to right). Three World 5 levels had their plates listed in the
  designer's own order and were unsolvable until reordered; the solution tests catch this.
- **Heavy blocks don't ride players.** A block that lands on someone stays put when they walk
  out from under it (and then falls); otherwise one player could carry a block marked 2.
- **Pushers stand on something that isn't a friend.** A player riding a friend's head doesn't
  count toward a block's number, so "a line of N" means N on the floor.
- **Lifts need their riders to get off together.** A lift that drops below its count slides back
  at once, taking anyone still aboard with it; it never crushes, it stops on whoever is under it.
- **The fast medal (`par`) is 1.5× the bots' time, rounded up to 5 s.** The bots play near
  perfectly but send one player at a time; 1.5× is a real target for a team of four that knows
  the level. `tests/solutions.test.ts` fails if a level's par drops below its bots' time. On
  scroll levels the scroll sets the pace, so those medals are roomier.
- **Respawns search for open space** near the chosen spot (up, then a little to either side), and
  fall back to the last flag or the player's start, so nobody reappears inside a wall.
- **Gates, blocks, lifts and movers are rectangles.** The checker rejects an L-shaped one (the
  engine would have filled it out to its bounding box).

