import { enter, fall, step, walk, type Solution } from './dsl';

// Leash 7, one lane each. P4 holds the lane-4 plate before its gate (opens A); P1 goes through A
// onto its plate (opens E); P2 through E onto its plate (F); P3 through F onto its plate (G); P4
// steps off, through G onto the far lane-4 plate (H); P1 through H to the key. Everyone walks right
// and drops down the shaft into lane 4; P1 opens the door.
export default {
  steps: [
    step({ 4: walk(5.5) }),
    step({ 1: walk(9.5) }),
    step({ 2: walk(9.5) }),
    step({ 3: walk(9.5) }),
    step({ 4: walk(11.5) }),
    step({ 1: walk(18.5) }),
    step({ 1: walk(24.0), 2: walk(16.0), 3: walk(16.0), 4: walk(16.0) }),
    step({ 1: [walk(30.5), fall(), walk(36.0)], 2: walk(24.5), 3: walk(24.0), 4: walk(23.5) }),
    step({ 2: [walk(30.5), fall(), walk(35.0)], 3: walk(26.0), 4: walk(25.0) }),
    step({ 3: [walk(30.5), fall(), walk(34.0)], 4: walk(29.0) }),
    step({ 1: [walk(40.5), enter()], 4: walk(33.0) }),
    step({ 2: [walk(40.5), enter()] }),
    step({ 3: [walk(40.5), enter()] }),
    step({ 4: [walk(40.5), enter()] }),
  ],
} satisfies Solution;
