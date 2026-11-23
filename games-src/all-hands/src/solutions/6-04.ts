import { enter, hold, hop, jumpTo, step, until, wait, walk, type Action, type Solution } from './dsl';
import { In } from '../sim/types';
import type { World } from '../sim/world';

// Scroll 1 t/s. Front to back: P4, P3, P2, P1. Over the bump and the pit; the ferry takes P4+P3,
// then P2+P1; all four onto the lift (4/4) and hop off onto the deck together; across the 2-bridge
// in pairs, over the 3-wide pit, off the deck end. P4 rides the vertical mover up to the key shelf
// and drops down; once the door is on screen everyone goes in.
const sx = (x: number) => until((w: World) => w.cam.scrollX >= x - 29.4, `screen ${x}`);
const go = (x: number): Action[] => [sx(x), walk(x)];
const after = (n: number, x: number) => until((w: World) => { const p = w.players[n - 1]; return p.gone || p.x + p.w / 2 >= x; }, `after P${n} ${x}`);
const mover = (w: World, i: number) => w.things.filter((t) => t.kind === 'mover')[i] as unknown as { box: { x: number; y: number }; s: number };
// the ferry is coming back and nearly at its left end (its loop is 10 tiles long: 5 out, 5 back)
const ferryComing = () => until((w) => mover(w, 0).s >= 9.4, 'ferry coming');
const ferryAway = () => until((w) => mover(w, 0).box.x >= 26.95, 'ferry across');
/** Walk onto the ferry and stand at `off` from its left edge. */
const board = (off: number): Action => ({
  name: `board ${off}`,
  limit: 60 * 5,
  tick({ w, me }) {
    const m = mover(w, 0);
    const d = m.box.x + off - (me.x + me.w / 2);
    if (me.support?.thing === (m as unknown) && Math.abs(d) < 0.1) return null;
    return Math.abs(d) < 0.05 ? 0 : d > 0 ? In.Right : In.Left;
  },
});
// the hole at x=86-87 can be jumped while the vertical mover is up high or flush at the bottom
const clear = () => until((w) => mover(w, 1).box.y < 10.2 || mover(w, 1).box.y > 14.7, 'mover out of the way');
const lifted = (w: World) => w.players.every((p) => p.y + p.h <= 9.05);
const start = (delay: number, x: number) => [wait(delay), walk(7.5), hop(1), walk(12.5), jumpTo(17), walk(x)];

export default {
  steps: [
    step({ 4: start(0, 21.55), 3: start(0.3, 20.6), 2: start(0.6, 19.65), 1: start(0.9, 18.7) }),
    // ferry: two at a time
    step({ 4: [ferryComing(), board(1.5)], 3: [ferryComing(), board(0.5)] }),
    step({ 4: [ferryAway(), walk(31.5)], 3: [ferryAway(), walk(30.55)], 2: [after(3, 18), walk(21.55)], 1: [after(3, 18), walk(20.6)] }),
    step({ 2: [ferryComing(), board(1.5)], 1: [ferryComing(), board(0.5)] }),
    step({ 2: [ferryAway(), walk(30.5)], 1: [ferryAway(), walk(29.55)], 4: go(41.35), 3: [wait(0.2), ...go(40.4)] }),
    step({ 2: walk(39.45), 1: walk(38.5) }),
    step({ 4: until(lifted, 'lift at the top') }),
    // everyone off together onto the deck (x=42-47)
    step({ 4: jumpTo(45.3), 3: jumpTo(44.35), 2: jumpTo(43.4), 1: jumpTo(42.45) }),
    // the 2-bridge (x=48-53) in pairs
    step({ 4: go(57.5), 3: go(56.55) }),
    step({ 2: go(55.6), 1: go(54.65) }),
    // over the 3-wide pit (x=60-62) one by one and on along the deck
    step({ 4: [walk(57.8), sx(64.5), hold(1, 0.38), jumpTo(64.5), ...go(70.5)] }),
    step({ 3: [walk(57.8), sx(64.5), hold(1, 0.38), jumpTo(64.5), ...go(69.5)] }),
    step({ 2: [walk(57.8), sx(64.5), hold(1, 0.38), jumpTo(64.5), ...go(68.5)] }),
    step({ 1: [walk(57.8), sx(64.5), hold(1, 0.38), jumpTo(64.5), ...go(67.5)] }),
    // off the deck end; P4 to the mover
    step({ 4: [...go(85.5)], 3: [after(4, 75), ...go(83.5)], 2: [after(3, 75), ...go(82.5)], 1: [after(2, 75), ...go(81.5)] }),
    // the vertical mover (x=86-87, 15 ↔ 9, a 12-tile loop): P4 jumps on as it comes down, rides
    // up, hops onto the key shelf (x=88-92, one higher) and drops off its far side
    step({ 4: [until((w) => mover(w, 1).s >= 11, 'lift coming down'), jumpTo(87.0), until((w) => mover(w, 1).box.y <= 9.2, 'at the top'), jumpTo(89.8), walk(90.5), walk(94.5)] }),
    step({
      4: go(103.5),
      3: [after(4, 96), walk(85.5), clear(), jumpTo(88.7), ...go(102.5)],
      2: [after(3, 84), walk(84.5), after(3, 88), walk(85.5), clear(), jumpTo(88.7), ...go(101.5)],
      1: [after(3, 84), walk(83.5), after(2, 88), walk(85.5), clear(), jumpTo(88.7), ...go(100.5)],
    }),
    step({ 4: [...go(105.5), enter()] }),
    step({ 3: [walk(105.5), enter()] }),
    step({ 2: [walk(105.5), enter()] }),
    step({ 1: [walk(105.5), enter()] }),
  ],
} satisfies Solution;
