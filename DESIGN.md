# Short Rope: Design Document

A co-op climbing game for people who actually climb. Every player controls their own climber, four limbs at a time. The rope, the belay and the fall physics are modeled on the real thing, so the way a crew works together at the crag is the way you win.

- **Players:** 2–4 online (2 on one computer for development and couch play)
- **Platforms:** desktop browser with keyboard + mouse first; phone browser as the last step of v1
- **View:** 2D, side-on. The wall is the screen.
- **Stack:** TypeScript, Vite, Canvas 2D (rendering), hand-written physics (no engine), Trystero (peer-to-peer rooms)
- **Hosting:** GitHub Pages only. No server, no domain.

---

## 1. Pillars

1. **Real rope work.** Leading, clipping, belaying, catching, lowering. The rope is a simulated system, not an item.
2. **Your partner is your lifeline.** The belayer's skill matters as much as the climber's.
3. **Climbing feels like climbing.** One limb at a time, forearms that get pumped, holds that behave differently.
4. **Made for a crew.** Share routes by link, log sends, argue about grades.

### Where it fits

Co-op climbing is a proven genre (PEAK, Chained Together), but in those games the rope is an item or a chain. Short Rope is the game about how climbers actually keep each other alive.

---

## 2. Scope of v1

v1 is **Crag Day**: single-pitch sport routes on one crag, played in 2D, by 2–4 friends who take turns leading and belaying.

Everything else in the original design is kept in [section 13, Later](#13-later) so the ideas aren't lost. Nothing there gets built until v1 is fun.

---

## 3. Core loop: one route

Every route is a two-person job.

1. **Tie in.** One player leads, one belays. The others watch, call beta, or wait for their turn.
2. **Lead.** The leader climbs, manages pump and clips the quickdraws.
3. **Belay.** The belayer feeds slack, takes in, and catches falls.
4. **Clip the anchor.** At the top the leader clips the anchor and calls "Take!"
5. **Lower.** The belayer lowers the leader to the ground.
6. **Log and swap.** The attempt is logged (send or not, and how), and roles rotate.

---

## 4. Climbing

### 4.1 View and camera

- Side-on 2D. The wall is a vertical plane facing the player; the climber is seen from behind.
- The camera follows the leader vertically and keeps the belayer visible when the leader is low.
- On phone the game runs in landscape.

### 4.2 Limbs and controls

The climber is a 2D physics body. Each hand and foot is controlled separately; hands grab holds, feet carry weight.

Every key, button and touch maps to a **game action** (`leftHand.reach`, `clip`, `call.falling`, ...). The game only reads actions, so the phone layer is a new input source, not a rewrite.

| Action | Keyboard + mouse (now) | Phone (step 10) |
|---|---|---|
| Left hand | Hold left mouse button, move mouse, release to grab | Hold left half of screen, drag |
| Right hand | Hold right mouse button (trackpad: Shift + click) | Hold right half, drag |
| Feet | Q / E step to the highlighted foothold | Foot buttons in the bottom corners |
| Hips to the wall | Hold Space | Two-finger hold |
| Clip quickdraw | F when a draw is in reach | Tap the draw |
| Chalk up / shake out | C / R | Chalk bag / shake buttons |
| Calls | 1–8 | Call wheel button |
| Belay | ↓ feed slack, ↑ take in, Enter catch, Shift+Enter soft catch | Feed / take / catch buttons |

### 4.3 Pump (forearm stamina)

- Each forearm has its own pump meter (0–100%).
- **Drain** per second while gripping = hold cost × body-position multiplier × wall-angle multiplier.
  - Body position: both feet on and hips in ×0.7; one foot or hips out ×1.0; feet off (campusing) ×2.0
  - Wall angle: see [section 8](#8-difficulty)
- **Recover** when a hand is free and shaking out, or slowly while hanging on a jug with feet on.
- At 100% pump, that hand's grip fails after a short warning (shaking hand, sound cue).
- Chalking up gives a small friction bonus on the next hold that decays over time.

### 4.4 Hold types

| Hold | Pump cost (%/s, tunable) | Rules |
|---|---|---|
| Jug | 3 | Rest hold; pump recovers slowly with feet on |
| Pinch | 9 | Works in any pull direction; rewards body tension |
| Sloper | 10 | Only holds with a straight arm and low hips |
| Pocket | 12 | Strong but small |
| Crimp | 14 | Strong and tiring |

---

## 5. Rope system

- A position-based (verlet) rope in 2D, about 60 m, split into fixed-length segments.
- **Quickdraws are pulleys:** once clipped, the rope slides through them with friction. Zigzagging clips produce rope drag naturally.
- **Belay device** is a constraint at the belayer that controls how much rope is let out.
- **Clipping:** the leader pulls up rope with one hand and clips with the same hand while the other grips. Clipping takes time, and the gripping hand drains pump the whole time. Back-clip chance rises with pump.

---

## 6. Belaying

The belayer has the most important controls in the game. Good belaying should feel as skilled as good climbing.

| Belay action | What it does |
|---|---|
| Feed slack | Pay out rope in rhythm as the leader climbs and reaches to clip. Too slow short-ropes the leader; too much makes falls longer. |
| Take in | Keep the system snug near the ground or before a fall. |
| Catch | Lock the brake hand when the fall starts, inside a short reaction window. A "Falling!" call from the leader widens the window. |
| Soft catch | A hop as the rope comes tight: gentler catch, bigger drop. Badly timed, the climber slams into the wall. |
| Lower | Ease the brake to bring the climber down smoothly. |

- **Device:** v1 uses a tube device (the belayer must catch actively). Assisted-braking devices are in Later.
- **Weight:** a lighter belayer is lifted further on a big fall; a heavier one gives a harder catch.
- **Belay stars:** every catch is rated by when the belayer locked off: before the rope came tight is good, with a soft catch and a gentle force it's perfect, after is late, never is missed. Short-ropes, a big loop of slack near the ground and dropping the leader cost stars. Each attempt gives the belayer 0–3 stars, and the day board shows sends, best grade and belay stars for the whole crew, so the belayer has their own game.

---

## 7. Falls

### 7.1 Game fall model

Tuned for feel and roughly consistent with real behavior. **This is a game model, not safety data.**

```
C  = last clip height above ground (m)
h  = distance climbed above that clip (m)
s  = slack in the system (m)
L  = rope out ≈ C + h + 1
free fall   = 2h + s
fall factor = min(2, free / L)
stretch     = L × (0.04 + 0.06 × FF)
belayer travel = 0.6 (soft) or 0.1 (hard); +0.4 if belayer is 15 kg lighter; −0.15 if 15 kg heavier
total drop  = free + stretch + belayer travel
catch force (kN) = (2.2 + 4.2 × √FF) × (0.75 if soft) × (0.9 lighter belayer / 1.08 heavier)
lowest point = C + h − total drop
```

In the game, drop and force come out of the rope simulation itself; this formula is the reference to tune it against. A debug overlay shows drop, fall factor and force for every fall.

### 7.2 Consequences

| Result | Condition | Effect |
|---|---|---|
| Ground fall | lowest point < 0.6 m | Attempt ends |
| Brutal catch | force > 5 kN | Grip stamina −40% |
| Firm catch | force 3.6–5 kN | Grip stamina −20% |
| Gentle catch | force < 3.6 kN | Shake it out and try again |

---

## 8. Difficulty

The challenge comes from how each route is set, the way it does on real rock: no enemies, no timers. A grade is a combination of the dials below, so a 6a and a 7a run on the same rules and only the numbers change.

### 8.1 The dials

**Climbing (the holds)**
- **Hold mix:** easy routes are mostly jugs; hard routes are crimps, slopers and pockets.
- **Reach:** distance between holds as a share of the climber's reach. Easy routes stay well inside it; hard routes need full-span moves, crosses and matches.
- **Feet:** fewer and smaller footholds put more weight on the arms. No feet means campusing (×2.0 pump).
- **Wall angle:** steeper walls raise the drain on every hold.
- **Rests:** how often a jug with good feet appears. Hard routes have long sections with nowhere to shake out.

**Rope (the risk)**
- **Bolt spacing:** longer runouts mean bigger falls.
- **Clip positions:** bolts placed next to bad holds force the leader to clip while hanging on a crimp.
- **Zigzag:** wandering bolt lines add rope drag, so the upper route gets heavier.
- **First bolts:** a ground-fall zone low on the route puts pressure on the belayer to keep it tight.

**Belaying (the second player's difficulty)**
- Harder routes ask more of the belayer: fast clip sequences that need slack on time, runouts where a soft catch matters, overhangs where a bad catch swings the climber into the wall.
- Optional dial: the catch window shrinks a little on harder grades.

### 8.2 Wall angle multipliers

| Angle | Pump multiplier |
|---|---|
| Slab | ×0.8 |
| Vertical | ×1.0 |
| Slight overhang (~20°) | ×1.3 |
| Steep overhang (~45°) | ×1.6 |
| Roof | ×2.0 |

### 8.3 Grade recipes (starting values, to be tuned in step 4)

| Grade (French / YDS) | Hold mix | Reach | Rests | Wall | Bolts |
|---|---|---|---|---|---|
| 5a / 5.7 | Mostly jugs | ≤ 60% | Every 3–4 moves | Slab / vertical | Every 2 m |
| 6a / 5.10a | Jugs, some crimps and slopers | ≤ 75% | Every 5–6 moves | Vertical | Every 2.5 m |
| 6c / 5.11a/b | Crimps, slopers, pinches | ≤ 85% | One mid-route | Slight overhang | Every 3 m |
| 7a / 5.11d | Crimps, pockets, poor feet | ≤ 95% | One, before the crux | Overhang | 3–3.5 m, some clips off bad holds |
| 7b+ / 5.12c | Crimps, slopers, pockets, few feet | Full span | None | Steep overhang / roof | Runouts |

### 8.4 How a session scales

- **Day energy:** each attempt spends some of the crew's energy for the day (start with enough for about 5–6 good attempts each). The crew decides whether to warm up on easy routes or spend tries on a project.
- **Send styles are the progression:** onsight (first try, never seen the route), flash (first try after watching someone), redpoint (sent after practice). Cleaner styles count for more in the logbook.
- **No unlocks.** The crag has 10–15 routes from 5a to 7b+. The next grade up is the goal, and routes friends share by link keep adding new ones.

---

## 9. Calls

A call wheel with short voice lines. Voice chat is Discord; calls stay in the game because the game reads them.

`On belay?` · `Belay on` · `Climbing` · `Clipping!` · `Slack!` · `Take!` · `Falling!` · `Got you` · `Lower` · `Watch me`

- "Clipping!" warns the belayer to feed slack.
- "Falling!" widens the belayer's catch window.
- "Watch me" makes the belayer's rope-tension hint more visible.

---

## 10. Crag Day, routes and logbook

- One crag with 10–15 routes from 5a to 7b+ (section 8.3).
- **Routes as JSON**, shared as compressed codes in the URL, so a friend opens a link and gets the route.
- **Logbook** in the browser (localStorage): ticks, attempts, send style.
- **Grades:** French or YDS for routes, chosen in settings.

```json
{
  "id": "K7QX-29",
  "name": "Omar's Pinch",
  "wall": "vertical-15m",
  "angle": "vertical",
  "grade": { "system": "French", "value": "6a+" },
  "holds": [
    { "type": "jug",   "pos": [1.2, 0.8], "rot": 0,  "role": "start" },
    { "type": "pinch", "pos": [1.5, 1.6], "rot": 35, "role": "hand" },
    { "type": "jug",   "pos": [1.1, 14.6], "rot": 0, "role": "top" }
  ],
  "bolts": [[1.3, 2.5], [1.4, 4.8], [1.2, 7.3]],
  "anchor": [1.2, 15.0],
  "fa": { "by": "Omar", "date": "2026-11-20" }
}
```

Grade conversions used in the UI (approximate):

| French | YDS |
|---|---|
| 5a | 5.7 |
| 6a | 5.10a |
| 6a+ | 5.10b |
| 6b | 5.10c |
| 6b+ | 5.10d |
| 6c | 5.11a/b |
| 7a | 5.11d |
| 7a+ | 5.12a |
| 7b | 5.12b |
| 7b+ | 5.12c |

---

## 11. Technical architecture

### 11.1 Climber
- Two physics points (chest and pelvis) joined by the torso, stepped with position-based dynamics at 8 substeps per frame.
- A gripping hand is a max-distance constraint to its hold; feet can only push. Arms and legs are drawn with IK.
- Muscles pull the body toward a pose (straight arms at rest, a lock-off while reaching). Body position (hips in, feet on) feeds the pump multiplier.

### 11.2 Rope
- The rope is a chain of elastic sections between anchors (device, each clipped draw, harness), not particles.
- Each draw is a pulley with capstan friction; rope length moves between sections when the tension difference beats the friction.
- The belay device slips above a hold force set by the belayer's input (idle, feeding, locked, soft catch).
- Peak tension during a catch is the catch force.

### 11.3 Multiplayer
- **Rooms by link:** `…/short-rope/?room=crag42`. The first player in becomes the host.
- **Signaling:** Trystero, using free public relays, only to introduce browsers. Game data goes directly between browsers over WebRTC.
- **Host-authoritative:** the host's browser runs the whole simulation (climbers, rope, falls). Guests send inputs; the host sends state snapshots about 30 times a second and guests interpolate.
- **Fair catches:** belay inputs carry timestamps so catch timing is judged at the time the belayer pressed, not when the packet arrived.
- **Known limitation:** without a relay server, a friend on a network that blocks direct connections (mostly mobile data) can't join from that network. Wi-Fi fixes it. A relay is only added if this becomes a real problem.

### 11.4 Hosting
- GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`.
- Vite `base` is set to `/short-rope/`.

### 11.5 Project layout

```
/src
  /input     action layer: keyboard + mouse now, touch later
  /sim       physics step, climber, rope, fall model, pump (pure logic, runs on the host)
  /render    Canvas 2D drawing, camera, HUD
  /net       Trystero rooms, snapshots, input messages
  /ui        menus, logbook, call wheel
/content     walls and routes (JSON)
DESIGN.md    this document
CLAUDE.md    how to run, build, test and deploy
```

---

## 12. Build steps

Every step ends with something you can open in a browser. Steps 4 and 6 are fun checks: if it isn't fun yet, fix that before going on.

| # | Step | Done when |
|---|---|---|
| 1 | Trim DESIGN.md | This document describes only what these steps build |
| 2 | Repo and live URL | A blank 15 m wall loads at the GitHub Pages URL |
| 3 | Climber with four limbs | You can climb to the top with mouse and keys |
| 4 | Pump and hold types (**fun check**) | Climbing alone is fun |
| 5 | Rope, quickdraws, falls | Falls feel right and roughly match section 7.1, with a bot belayer catching |
| 6 | A friend belays on the same PC (**fun check**) | Two people at one keyboard are laughing |
| 7 | Online with a room link | Two friends climb together from two houses |
| 8 | Calls | A session can be played using only calls |
| 9 | Routes and logbook | A friend opens a link and gets your route; sends are logged |
| 10 | Phone | A friend on a phone belays a friend on a laptop |

---

## 13. Later

Kept from the original design, built only after v1 is fun.

**Modes**

| Mode | Players | Summary |
|---|---|---|
| Multi-pitch | 2–3 | 4–12 pitches; swap leads, build anchors, second and clean, haul the bag, portaledge nights, storms |
| Alpine Rope Team | 3–4 | Everyone on one rope on a glacier; crevasse falls, self-arrest, 3:1 haul rescue, weather window |
| Boulder Session | 2–6 | No ropes; others spot and move crash pads; problems set by friends |
| Route Setter | Any | In-game editor for holds, bolts and grades (v1 routes are hand-written JSON) |
| Deep Water Solo | 1–4 | Sea cliffs, fall into water; low tide creates no-fall zones |

**Hard-core mistakes** (difficulty toggles)

| Mistake | Consequence |
|---|---|
| Back-clipping | On a fall the rope can unclip itself: longer fall |
| Z-clipping | Huge rope drag until fixed |
| Rope behind leg | Fall flips the climber upside down |
| No stopper knot | Rope end slips through the device when lowering |
| Skipped partner check | Unfinished knot or unlocked carabiner persists until caught |
| Overcrimping | Finger injury: weaker hand for the rest of the session |
| Rockfall | Call "Rock!"; helmets and belay position decide who gets hurt |

Plus: one life per run, no checkpoints, shared lives.

**Other**
- Conditions: friction from temperature, humidity, shade and chalk; changing through the day
- Assisted-braking belay device (locks by itself, harder catches, can short-rope a fast clipper)
- ~~Ghost beta~~ (built: the fastest send per route is recorded from snapshots on every machine that watched it and replayed with a race clock. Still to do: sharing a ghost inside a route link)
- ~~Crew stats~~ (built as the day board and day awards: most metres, fastest send, biggest whipper, softest hands, belayer of the day, frequent flyer, short-roper, gravity's friend)
- Boulder grades (V-scale / Font)
- Gamepad
- Built-in proximity voice
- A relay (TURN) server, if mobile players can't connect
- 3D, if 2D ever feels limiting

---

## 14. Open questions

- How much assistance (auto foot placement, grab snapping) for players who don't climb?
- Real crags (with permission from local communities) or fictional ones?
- Day energy: how many attempts per session feels right?
- Should the catch window shrink on harder grades, or stay fixed?
