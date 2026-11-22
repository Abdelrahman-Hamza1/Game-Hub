import { go, to, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 pushes the crate down the service corridor onto the plate at the emitter (the crate shields the pusher from the beam); the door opens at about 6.5 s and stays open. Loop 2 waits at the vault door and runs. One loop is too slow: from the plate back to the vault and out is over 5 s.',
  loops: [
    [go(19, 2), to(37, 2)],
    [go(7, 5), until(5.0), go(14, 5), go(1, 6)],
  ],
} satisfies Solution;
