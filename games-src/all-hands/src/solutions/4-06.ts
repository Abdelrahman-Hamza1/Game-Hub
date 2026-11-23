import { enter, fall, jumpTo, step, until, walk, type Solution } from './dsl';
import { climb, ferry, ferryS, onFerry, stepOff, walkTo } from './kit4';
import type { World } from '../sim/world';

// The car loops every 24 s (bottom → right side up → top → left side down) and never stops, so the
// team boards it on its way down to the start island: P2 (with P1 on its head), P4 and P3 jump on
// together. P1 jumps off at the bottom-right stop, P2 walks off at the top-right, P3 and P4 at the
// top-left; each opens their own gate (P2 takes the key). P3 and P4 drop down to the start island
// and wait in the door room as a stack; P1 and P2 catch the car on its next lap and ride it home, P1 on P2's head.
const s = (w: World) => ferryS(w);
const y = (w: World) => ferry(w).y;

export default {
  steps: [
    // line up: P2 hops over P3 and P4 to the island's edge, P1 climbs on and walks over the heads
    step({ 2: [jumpTo(14.4), walk(14.4), fall()] }),
    step({ 4: walk(13.2), 3: walk(12.0) }),
    step({ 1: [walk(10.8), climb(3), walkTo((w) => w.players[1].x + 0.45, 0.04)] }),
    // the car comes down the left side: all jump on as it nears the island
    step({ 2: until((w) => s(w) > 59 && y(w) >= 20.3, 'car coming down', 40) }),
    step({ 2: jumpTo(17.5), 4: jumpTo(16.4), 3: jumpTo(15.3) }),
    // bottom-right stop: P1 jumps off P2's head and opens gate A
    step({ 1: [until((w) => s(w) < 23 && ferry(w).x >= 37.4, 'bottom-right'), jumpTo(43.5), walk(51.55), walk(41.5)] }),
    // top-right stop: P2 walks off, takes the key and opens gate E
    step({ 2: [until((w) => s(w) >= 35.95, 'top-right'), walk(51.55), walk(41.5)] }),
    // top-left stop: P3 and P4 walk off; P3 opens F through the mint gate, P4 drops onto its well's button
// (and jumps straight back out over it, so it is touched only once)
    step({
      3: [until((w) => s(w) >= 57.7, 'top-left'), walk(2.45), walk(14.6), stepOff(1, 12.5), walk(1.5)],
      4: [until((w) => s(w) >= 57.7, 'top-left'), walk(7.75), fall()],
    }),
    step({ 4: [jumpTo(10.5), walk(14.6), stepOff(1, 12.5), walk(2.6)] }),
    step({ 4: climb(3) }),
    // next lap: P1 boards at the bottom-right, P2 at the top-right, and they ride home
    step({ 1: [until((w) => s(w) >= 22.7 && s(w) < 23.5, 'car arriving', 40), walkTo(onFerry(1.0))] }),
    step({ 2: [until((w) => s(w) >= 35.85 && s(w) < 37, 'car at top', 40), walkTo(onFerry(2.2))] }),
    step({ 1: [until((w) => s(w) > 38 && s(w) < 50, 'along the top', 40), climb(2)] }),
    step({ 2: [until((w) => s(w) > 59 && y(w) >= 20.4, 'home', 40), walk(2.5), enter()] }),
    step({ 1: [fall(), enter()] }),
    step({ 3: [walk(2.5), enter()] }),
    step({ 4: [fall(), walk(2.5), enter()] }),
  ],
} satisfies Solution;
