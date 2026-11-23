import { enter, face, fall, grab, hold, jumpTo, step, until, wait, walk, drop, type Action, type Solution } from './dsl';
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';

// Scroll 1 t/s. Front to back: P4, P3, P2, P1.
const centre = (b: Body) => b.x + b.w / 2;
const steer = (b: Body, x: number) => {
  const d = x - centre(b);
  const stop = (b.vx * b.vx) / 70 + 0.03;
  if (Math.abs(d) <= 0.06 || (Math.abs(d) <= stop && Math.sign(b.vx) === Math.sign(d))) return 0;
  return d > 0 ? In.Right : In.Left;
};
/** Hop onto the spring at x0; once launched, steer to x1 until the feet are above y, then to x2. */
const spring = (x0: number, x1: number, y: number, x2: number): Action => ({
  name: `spring ${x0}→${x2}`,
  limit: 60 * 6,
  tick({ me, t, s }) {
    if (t === 0) return In.Jump | steer(me, x0);
    if (me.vy < -20) s.up = 1; // a spring launch (a jump is ~17.6)
    if (s.up && me.support && me.vy >= 0) return null;
    if (!s.up) return (t < 8 ? In.Jump : 0) | steer(me, x0);
    if (!s.free && me.y + me.h > y) return steer(me, x1);
    s.free = 1;
    return steer(me, x2);
  },
});
/** Hold Right until the block's left edge reaches x (the whole conga stops together). */
const shove = (x: number): Action => ({
  name: `shove to ${x}`,
  limit: 60 * 30,
  tick: ({ w }) => (w.bodies.find((b) => b.kind === 'block')!.x >= x - 1e-6 ? null : In.Right),
});
const sx = (x: number) => until((w: World) => w.cam.scrollX >= x - 29.4, `screen ${x}`);
const go = (x: number): Action[] => [sx(x), walk(x)];
const after = (n: number, x: number) => until((w: World) => { const p = w.players[n - 1]; return p.gone || centre(p) >= x; }, `after P${n} ${x}`);
const mover = (w: World) => w.things.find((t) => t.kind === 'mover') as unknown as { box: { x: number; y: number }; s: number };
const ferryComing = () => until((w) => mover(w).s >= 9.4, 'ferry coming');
const ferryAway = () => until((w) => mover(w).box.x >= 81.95, 'ferry across');
/** Walk onto the ferry and stand at `off` from its left edge. */
const board = (off: number): Action => ({
  name: `board ${off}`,
  limit: 60 * 6,
  tick({ w, me }) {
    const m = mover(w);
    const d = m.box.x + off - centre(me);
    if (me.support?.thing === (m as unknown) && Math.abs(d) < 0.1) return null;
    return Math.abs(d) < 0.05 ? 0 : d > 0 ? In.Right : In.Left;
  },
});
const lifted = until((w: World) => w.players.every((p) => p.y + p.h <= 11.05), 'lift at the top');
const pan = (w: World, i: number) => w.things.filter((t) => t.kind === 'pan')[i] as unknown as { box: { y: number }; weight: number };
const panBUp = until((w) => pan(w, 0).box.y <= 13.02, 'pan B up');
const panAAt = (y: number) => until((w) => Math.abs(pan(w, 1).box.y - y) < 0.02, `pan A at ${y}`);
// from the deck end: down to the floor, onto the step, over pan B (alone: it sinks to the
// tunnel's floor) and through the tunnel under the door ledge to the H pocket
const toRight = (x: number) => [walk(88.6), walk(89.6), fall(), jumpTo(92.0), walk(93.4), until((w) => pan(w, 0).box.y >= 15.98 && !w.players.some((p) => p.support?.thing === (pan(w, 0) as unknown)), 'pan B free'), walk(95.0), walk(x)];
// up the H stairs (x=105 then x=104) onto the ledge, to the door
const stairs = [jumpTo(105.5), jumpTo(104.5), jumpTo(103.3), walk(102.5), enter()];
const crateHeld = (w: World) => w.players[3].carrying?.kind === 'crate' && centre(w.players[3]) < 113.5;
const blockDown = until((w: World) => w.bodies.some((b) => b.kind === 'block' && b.y > 15.5), 'block in hole');

export default {
  steps: [
    // the tunnel block (x=15-16, needs 4) into its hole at x=21-23
    step({ 4: walk(14.55), 3: walk(13.6), 2: walk(12.65), 1: walk(11.7) }),
    step({ 4: shove(21), 3: shove(21), 2: shove(21), 1: shove(21) }),
    step({ 4: blockDown }),
    // over the hole's last gap to the flag (x=30) and the pile: P4 on past the pillar and the step
    // to wait by the spring cap; P3 onto the step; P2 onto the pillar's plate; P1 on P2; P3 on top
    step({
      4: [walk(33.3), jumpTo(34.5), jumpTo(36.8), ...go(41.4)],
      3: [after(4, 26), walk(33.3), after(4, 39), jumpTo(34.5), jumpTo(36.6)],
      2: [after(3, 25), walk(32.3)],
      1: [after(2, 24), walk(31.3)],
    }),
    step({ 2: [walk(33.3), jumpTo(34.5)] }),
    step({ 1: [walk(33.3), jumpTo(34.5)] }),
    step({ 3: jumpTo(34.5) }),
    // cap E open: P4 springs onto the 5-high block, touches the button (gate F, 8 s), drops off the end
    step({ 4: [until((w) => !!w.power.E, 'cap E'), sx(46), spring(42.5, 43.5, 12, 45.5), walk(47.4), hold(1, 0.1), jumpTo(48.45)] }),
    // the pile climbs down and goes through gate F's tunnel (x=44-50)
    // (P4 stands on the button knob meanwhile, which keeps it pressed)
    step({ 3: [jumpTo(39.5), walk(41.3), jumpTo(43.5), walk(53.5)] }),
    step({ 1: [jumpTo(38.5), walk(41.3), jumpTo(43.5), walk(52.5)], 2: [after(1, 39), walk(35.4), jumpTo(36.8), walk(41.3), jumpTo(43.5), walk(51.5)] }),
    step({ 4: [jumpTo(50.3), walk(55.5)] }),
    // the fragile bridge (x=58-63, holds 2) in pairs, onto the 4-lift (x=66-69)
    step({ 4: go(69.35), 3: [wait(0.2), ...go(68.4)], 1: [after(3, 64.5), ...go(67.45)], 2: [after(3, 64.5), wait(0.2), ...go(66.5)] }),
    step({ 4: lifted }),
    step({ 4: jumpTo(73.3), 3: jumpTo(72.35), 1: jumpTo(71.4), 2: jumpTo(70.45) }),
    // the ferry (x=77↔82) two at a time to the far deck (x=84-88)
    step({ 4: walk(76.5), 3: walk(75.55), 1: walk(74.6), 2: walk(73.65) }),
    step({ 4: [sx(88), ferryComing(), board(1.5)], 3: [sx(88), ferryComing(), board(0.5)] }),
    step({ 4: [ferryAway(), walk(87.4)], 3: [ferryAway(), walk(86.45)], 1: [after(3, 74.5), walk(76.5)], 2: [after(3, 74.5), walk(75.55)] }),
    step({ 1: [sx(88), ferryComing(), board(1.5)], 2: [sx(88), ferryComing(), board(0.5)] }),
    step({ 1: [ferryAway(), walk(85.5)], 2: [ferryAway(), walk(84.55)] }),
    // the final screen: P4, P3, P1 cross to pan A one at a time (P4 fetches the crate and holds
    // it: carried weight counts); P2, the rider, waits on the step left of pan B
    step({
      4: [...toRight(105.4), jumpTo(108.0), walk(113.4), sx(115.5), walk(114.55), face(1), grab(), jumpTo(112.6)],
      3: [after(4, 97.5), ...toRight(105.4), until(crateHeld, 'P4 has the crate'), jumpTo(108.5), walk(109.6)],
      1: [after(3, 97.5), ...toRight(104.45), until(crateHeld, 'P4 has the crate'), after(3, 108), walk(105.4), jumpTo(107.4), walk(107.6)],
      2: [after(1, 97.5), walk(88.6), walk(89.6), fall(), jumpTo(92.0)],
    }),
    // 3 + the crate vs 1: pan B rises 3; P2 onto it, onto the ledge, touches the toggle (H closes
    // into stairs), over it to the key and opens the door
    step({ 2: [panBUp, jumpTo(95.0), jumpTo(97.6), hold(1, 0.1), jumpTo(100.5), walk(102.5), enter()] }),
    // up the stairs one at a time: pan A must carry at most one (it then sits 2 below the stairs)
    step({ 4: [jumpTo(114.6), walk(118.3), face(-1), drop()], 3: [after(4, 116), walk(113.4), jumpTo(115.5)] }),
    step({ 1: [panAAt(17), walk(106.5), ...stairs] }),
    step({ 3: [walk(114.4), jumpTo(110.0), walk(107), panAAt(17), walk(106.5), ...stairs] }),
    step({ 4: [jumpTo(115.0), walk(114.4), jumpTo(110.0), walk(107), panAAt(17), walk(106.5), ...stairs] }),
  ],
} satisfies Solution;
