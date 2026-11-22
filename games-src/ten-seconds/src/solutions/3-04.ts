import { go, to, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs the length of the ballroom and crouches at the stage edge at 3 s. Loop 2 follows, touches the crouched copy and is boosted onto the stage, then takes the sapphire to the stage door. Arriving any time up to 0.8 s into the crouch works.',
  loops: [
    [go(29, 5), until(3.0), use()],
    [go(27, 5), until(3.2), to(29, 3), go(14, 2), go(32, 1)],
  ],
} satisfies Solution;
