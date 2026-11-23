import type { World } from '../sim/world';
import { enter, face, grab, throwIt, hop, jumpTo, step, walk, type Solution } from './dsl';
import { holdUntil, runJump } from './kit5';

// P4 hops the crate, jumps over the left pan and stands on the right pan. P3 picks up the crate,
// P2 the lantern; P3, P2, P1 pile onto the left pan (4 against 1): the right pan rises 3 and P4
// jumps onto the roof, drops through the hole into the tunnel and toggles the button: gate F
// opens. The three climb out of the sunk pan to the left (off P3's crate; P3 then throws the crate
// to the left) and cross both pans into the tunnel. All four board the 3-lift as two stacks (it leaves
// as soon as three are aboard): P4 on P3, and P1 walks on carrying P2 on its head. Up to the roof;
// P4 takes the key and opens the door.
/** Pan i's box (0 left, 1 right). */
const pan = (w: World, i: number) => (w.things.filter((t) => t.kind === 'pan')[i] as unknown as { box: { x: number; y: number } }).box;
const lift = (w: World) => (w.things.find((t) => t.kind === 'lift') as unknown as { box: { y: number } }).box;
const toTunnel = (x: number) => [walk(12.0), runJump(13.5, 17.6), walk(21.4), hop(1), walk(x)];

export default {
  steps: [
    step({ 4: [walk(8.8), jumpTo(11.5), walk(11.5), runJump(13.5, 17.6), walk(20.5)] }),
    step({ 3: [walk(9.4), grab(), walk(13.0), hop(1), walk(16.45)] }),
    step({ 2: [walk(6.6), grab(), walk(13.0), hop(1), walk(15.5)] }),
    step({ 1: [walk(13.0), hop(1), walk(14.55)] }),
    step({ 4: [holdUntil(0, (w) => pan(w, 1).y <= 16.001, 'pan up'), jumpTo(22.5), walk(25.3), holdUntil(1, (w) => !!w.power.F, 'press')] }),
    step({ 2: [jumpTo(16.45), jumpTo(12.5), walk(3.5)] }),
    step({ 1: [jumpTo(16.45), jumpTo(12.5), walk(4.5)] }),
    step({ 3: [jumpTo(12.6), face(-1), throwIt()] }),
    step({ 3: toTunnel(26.45) }),
    step({ 4: [walk(28.2), jumpTo(26.45)] }),
    step({ 1: [walk(6.6), jumpTo(9.6), ...toTunnel(23.4)] }),
    step({ 2: [walk(6.6), jumpTo(9.6), walk(12.0), runJump(13.5, 17.6), walk(21.4), hop(1), walk(22.2), jumpTo(23.4)] }),
    step({ 1: walk(25.5) }),
    step({ 4: [holdUntil(0, (w) => lift(w).y <= 14.001, 'lift up'), jumpTo(31.5)], 2: [holdUntil(0, (w) => lift(w).y <= 14.001, 'lift up'), jumpTo(29.5)] }),
    step({ 3: jumpTo(28.5), 1: jumpTo(27.6) }),
    step({ 4: [walk(46.5), enter()] }),
    step({ 2: [walk(46.5), enter()] }),
    step({ 3: [walk(46.5), enter()] }),
    step({ 1: [walk(46.5), enter()] }),
  ],
} satisfies Solution;
