# Short Rope: Design Document

A co-op climbing game for people who actually climb. Every player controls their own climber, four limbs at a time. The rope, the belay and the fall physics are modeled on the real thing, so the way a crew works together at the crag is the way you win.

- **Players:** 2–4 online (local 2-player for development and couch play)
- **Platforms:** browser (desktop and phone), gamepad, keyboard + mouse, touch
- **Stack:** TypeScript, Vite, Three.js, Rapier (physics), Colyseus (server), WebRTC (proximity voice)

---

## 1. Pillars

1. **Real rope work.** Leading, clipping, belaying, catching, anchors, swapping leads, cleaning gear. The rope is a simulated system, not an item.
2. **Your partner is your lifeline.** Almost nothing can be done alone. The belayer's skill matters as much as the climber's.
3. **Climbing feels like climbing.** One limb at a time, forearms that get pumped, holds that behave differently, conditions that change friction.
4. **Made for a crew.** Rebuild your own gym and crag, record and share beta, log sends, argue about grades.

### Where it fits

Co-op climbing is a proven genre (PEAK, Chained Together), but in those games the rope is an item or a chain. Short Rope is the game about how climbers actually keep each other alive.

---

## 2. Core loop: one pitch

Every route is made of pitches, and every pitch is a two-person job. On multi-pitch routes the loop repeats with roles swapped.

1. **Partner check.** Both players check each other's knot, harness and belay device. (Hard-core: skipping it can leave a hidden mistake in place.)
2. **Lead.** The leader climbs, manages pump and clips quickdraws.
3. **Belay.** The belayer feeds slack, takes in, and catches falls.
4. **Anchor.** At the top of the pitch the leader builds an anchor and calls "Off belay!"
5. **Second.** The partner climbs on a top rope and cleans the gear.
6. **Swap or descend.** Swap leads for the next pitch, or rappel. Stopper knots go in the rope ends first.

---

## 3. Climbing

### 3.1 Limbs and controls

The climber is a physics body. Each hand and foot is controlled separately; hands grab holds, feet carry weight.

| Action | Gamepad | Keyboard + mouse | Phone |
|---|---|---|---|
| Left hand | Hold LT to grip, left stick to reach | Hold left mouse button, move mouse | Hold left half of screen, drag |
| Right hand | Hold RT, right stick | Hold right mouse button, move mouse | Hold right half, drag |
| Feet | LB / RB step to highlighted foothold | Q / E | Tap foot markers |
| Hips to the wall | Hold A | Hold Space | Two-finger hold |
| Clip quickdraw | X when a draw is in reach | F | Tap the draw |
| Chalk up / shake out | D-pad down / up | C / R | Tap chalk bag / shake gesture |
| Calls | D-pad wheel | 1–8 | Call wheel |

### 3.2 Pump (forearm stamina)

- Each forearm has its own pump meter (0–100%).
- **Drain** per second while gripping = hold cost × body-position multiplier.
  - Straight arm and hips to the wall: × 0.7
  - Bent arm, or hips away from the wall: × 1.3
  - Feet off (campusing): × 2.0
- **Recover** when a hand is free and shaking out, or slowly while hanging on a jug.
- At 100% pump, that hand's grip fails after a short warning (shaking hand, sound cue).
- Chalking up restores a small amount of grip on the next hold (friction bonus decays over time).

### 3.3 Hold types

| Hold | Grip cost | Rules |
|---|---|---|
| Jug | Low | Rest hold; pump recovers slowly while hanging |
| Crimp | High | Strong; long full-crimps build finger-injury risk |
| Sloper | Medium | Only holds with a straight arm and low hips; worse in heat |
| Pinch | Medium | Works in any pull direction; rewards body tension |
| Pocket | Medium–high | Finger choice matters; monos are strong and risky |

### 3.4 Conditions

Friction multiplier from temperature, humidity, shade and chalk. Slopers are most affected. Conditions change through the in-game day (morning shade, afternoon sun, evening cool-down), so the crew plans which routes to try when.

---

## 4. Rope system

### 4.1 Simulation

- The rope is a position-based (verlet) rope, about 60 m, split into segments.
- **Quickdraws are pulleys:** once clipped, the rope slides through them with friction. Zigzagging clips produce rope drag naturally.
- **Belay device** is a constraint at the belayer that controls how much rope is let out (payout).
- Rope ends: a stopper knot is a flag on the rope end. Without it, the end can slip through the device when lowering or rappelling.

### 4.2 Clipping

- The leader pulls up rope with one hand and clips with the same hand while the other grips.
- Clipping takes time; the gripping hand drains pump the whole time.
- **Back-clip chance** rises with pump. **Z-clip** happens if the rope is grabbed from below the previous clip.

---

## 5. Belaying

The belayer has the most important controls in the game. Good belaying should feel as skilled as good climbing.

| Belay action | What it does |
|---|---|
| Feed slack | Pull rope through in rhythm as the leader climbs and reaches to clip. Too slow short-ropes the leader; too much makes falls longer. |
| Take in | Keep the system snug near the ground or before a fall. |
| Catch | Lock the brake hand when the fall starts, inside a short reaction window. A "Falling!" call from the leader widens the window. |
| Soft catch | A hop as the rope comes tight: gentler catch, bigger drop. Badly timed, the climber slams into the wall. |
| Lower | Ease the brake to bring the climber down smoothly. |

**Devices:**
- **Tube device:** the belayer must catch actively; best soft catches.
- **Assisted-braking device:** locks by itself, catches harder, and can lock while feeding slack to a fast clipper (short-roping risk).

**Weight:** a lighter belayer is lifted further on a big fall; a heavier one gives a harder catch. A ground anchor reduces lift.

---

## 6. Falls

### 6.1 Game fall model

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

In the full game, drop and force come out of the rope simulation itself; this formula is the reference to tune it against.

### 6.2 Consequences

| Result | Condition | Effect |
|---|---|---|
| Ground fall | lowest point < 0.6 m | Run ends; hard-core: injury |
| Brutal catch | force > 5 kN | Grip stamina −40%, ankle injury chance |
| Firm catch | force 3.6–5 kN | Grip stamina −20% |
| Gentle catch | force < 3.6 kN | Shake it out and try again |

---

## 7. Calls and communication

Quick-chat wheel with voice lines, plus proximity voice (WebRTC). Calls are also game signals.

`On belay?` · `Belay on` · `Climbing` · `Clipping!` · `Slack!` · `Take!` · `Falling!` · `Got you` · `Lower` · `Off belay` · `Rock!` · `Watch me`

- "Clipping!" warns the belayer to feed slack.
- "Falling!" widens the belayer's catch window.
- "Rock!" gives others a moment to protect their heads.
- "Watch me" makes the belayer's rope-tension hint more visible.

---

## 8. Hard-core layer: mistakes worth simulating

| Mistake | Tell | Consequence |
|---|---|---|
| Back-clipping | Rope runs the wrong way through the draw | On a fall the rope can unclip itself: longer fall |
| Z-clipping | Rope grabbed from below the previous clip | Huge rope drag; can't move up until fixed |
| Rope behind leg | Rope crosses behind the leg | Fall flips the climber upside down; injury risk |
| Short-roping | Belayer too slow on slack | Leader pulled off while clipping |
| Too much slack | Loops on the ground | Longer falls; ground-fall risk at first bolts |
| No stopper knot | Rope end has no knot | End slips through the device when lowering or rappelling |
| Skipped partner check | Unfinished knot / unlocked carabiner | Hard-core: mistake persists until someone catches it |
| Overcrimping | Long time on crimps and monos | Finger injury: weaker hand for the rest of the trip |
| Rockfall | Loose holds | Call "Rock!"; helmets and belay position decide who gets hurt |

Difficulty settings turn these on and off, plus: one life per run, no checkpoints, shared lives.

---

## 9. Modes

All modes reuse the same climbing, rope and belay systems.

| Mode | Players | Summary | Twist |
|---|---|---|---|
| **Crag Day** (core) | 2–4 | Single-pitch sport routes; take turns leading and belaying; log onsight / flash / redpoint | Conditions change through the day |
| **Multi-pitch** | 2–3 | 4–12 pitches; swap leads, build anchors, haul the bag, overnight on a portaledge | Water and food are in the haul bag; storms |
| **Alpine Rope Team** | 3–4 | Everyone on one rope on a glacier; crevasse falls, self-arrest, pulley rescue (3:1 haul) | Altitude, cold, weather window |
| **Boulder Session** | 2–6 | No ropes; others spot and move crash pads | Problems set by friends; flash bonus |
| **Route Setter** | Any | Place holds on walls, set start/top, propose a grade, share a code | Rebuild your home gym or crag |
| **Deep Water Solo** | 1–4 | Sea cliffs, no rope, fall into water | Tide: low tide creates no-fall zones |

---

## 10. Crew features

- **Your crag, rebuilt:** set real routes with real names and grades.
- **Ghost beta:** record a send; friends race or copy the ghost.
- **Grades your way:** V-scale / Font for boulders, YDS / French for routes.
- **Logbook:** ticks, attempts, send style, first-ascent credit on routes you set.
- **Crew stats:** falls caught, meters led, softest catch, who short-roped whom.
- **Proximity voice:** shout down from the anchor; calls cut through when voice doesn't.

Grade conversions used in the UI (approximate):

| French | YDS |
|---|---|
| 6a | 5.10a |
| 6a+ | 5.10b |
| 6b | 5.10c |
| 6b+ | 5.10d |
| 6c | 5.11a/b |
| 7a | 5.11d |
| 7a+ | 5.12a |
| 7b | 5.12b |
| 8a | 5.13b |

| V-scale | Font |
|---|---|
| V3 | 6A |
| V4 | 6B |
| V5 | 6C |
| V6 | 7A |
| V8 | 7B |

---

## 11. Technical architecture

### 11.1 Climber
- Ragdoll in Rapier (pelvis, torso, head, upper/lower arms and legs).
- IK targets aim hands and feet; a grab creates a joint to the hold whose max force scales with remaining grip.
- Body position (hips in/out, arm straightness) is measured from the ragdoll and feeds the pump multiplier.

### 11.2 Rope
- Position-based rope: fixed segment length, 10–20 constraint iterations per step.
- Clipped quickdraws act as pulley constraints: rope particles slide through with friction, and rope length redistributes between sections.
- Belay device = payout constraint controlled by belayer input.
- Peak tension during a catch is used as the catch force.

### 11.3 Netcode
- Colyseus server is authoritative for the rope, falls, holds breaking, and game state.
- Clients predict their own limbs and send inputs; the server sends snapshots at 30 Hz with interpolation.
- Belay inputs are timestamped so catch timing is fair under latency.
- Matches are recorded as inputs + seed so desyncs can be replayed.

### 11.4 Walls and routes
- Wall meshes + a hold library (glTF), each hold tagged with type, size and grip vectors.
- Routes stored as JSON (share codes are compressed JSON):

```json
{
  "id": "K7QX-29",
  "name": "Omar's Pinch",
  "wall": "gym-panel-45deg",
  "grade": { "system": "V", "value": "V3" },
  "holds": [
    { "hold": "pinch-m-03", "pos": [1.2, 0.8, 0], "rot": 35, "role": "start" },
    { "hold": "crimp-s-11", "pos": [1.5, 1.6, 0], "rot": 0, "role": "hand" },
    { "hold": "jug-l-02",   "pos": [1.1, 3.9, 0], "rot": 0, "role": "top" }
  ],
  "bolts": [[1.3, 2.5, 0], [1.4, 5.0, 0]],
  "fa": { "by": "Omar", "date": "2026-11-20" }
}
```

### 11.5 Project layout (suggested)

```
/client      Three.js game, input, UI
/server      Colyseus rooms, authoritative sim
/shared      physics step, rope, fall model, types (used by both)
/content     walls, holds, routes (JSON)
DESIGN.md    this document
CLAUDE.md    how to run, test, and open 4 clients
```

---

## 12. Milestones

Every milestone ends with something the crew can play.

| # | Goal | Done when |
|---|---|---|
| **M1** | One climber, four limbs, holds and pump on a 15 m test wall (local) | You can climb the wall with gamepad or keyboard, pump drains by hold type and body position, and grip fails at full pump |
| **M2** | Rope and quickdraws; falls caught by a bot belayer | Clipping works (with back-clip chance), falls come from the rope sim, rope drag appears with zigzag clips, debug overlay shows drop / FF / force |
| **M3** | A second local player belays | Slack, take, catch timing and soft catch all work; short-roping and ground falls can happen |
| **M4** | Online for 2–4 players | Colyseus rooms, rope synced, call wheel and proximity voice work across two computers |
| **M5** | Route setter, logbook and ghost beta | Routes can be built, shared by code and climbed; sends are logged; ghosts replay |
| **M6** | Multi-pitch and Alpine modes, hard-core mistakes | Anchors, swapping leads, rappelling, crevasse rescue, and the mistakes table with difficulty toggles |

---

## 13. Open questions

- Third-person camera vs. a side-on 2.5D camera for phone play?
- How much assistance (auto foot placement, IK snapping) for players who don't climb?
- Do we ship with real crags (permission from local climbing communities) or fictional ones plus the editor?
- Voice: built-in WebRTC, or rely on Discord and keep only quick-chat?
