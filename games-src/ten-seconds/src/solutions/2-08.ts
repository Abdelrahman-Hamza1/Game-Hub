import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 takes the keycard and stands at the card door for the whole heist. Loop 2 walks into the west booth and throws switch d, opening the switch door and the exit gate (and locking itself in). Loop 3 gets into the plate room before it locks at 3 s and stands on the plate. Loop 4 goes through all three doors to the box and back out through the gate.',
  loops: [
    [go(16, 12), go(19, 10)],
    [go(5, 5), use()],
    [go(34, 5)],
    [go(19, 10), until(1.5), go(19, 1), go(19, 10), go(2, 13)],
  ],
} satisfies Solution;
