import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Each copy has to be inside its room before the doorway beams arm at 2 s, and then nobody can leave. Loop 1 takes the jewel room, picks up the necklace and passes it through the first hatch (about 2.95 s). Loop 2 waits in the coat check where it lands, crosses the blinking beam in an off second (leaving at 3.0 to 3.6 s, or 4.8 to 5.6 s) and passes it through the second hatch. Loop 3 waits in the street hall and carries it out. The beams make it one copy per room, so two loops cannot work.',
  loops: [
    [go(9, 6), go(1, 1), go(10, 2), use()],
    [go(13, 6), go(12, 2), until(3.3), go(17, 2), use()],
    [go(20, 6), go(19, 2), until(4.2), go(30, 5)],
  ],
} satisfies Solution;
