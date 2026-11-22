import { go, to, type Solution } from './dsl';

export default {
  note: 'Loop 1 slips into the wine cellar before its door shuts at 1.5 s and holds plate a (the vault door). Followed by the Hound, that copy is fatal: the Hound trails it to the cellar door and waits there, in the corridor the runner comes back through. So loop 2 is the decoy: it runs out along the far side of the terrace and back along the near side, and being the newest copy, the Hound follows it there. Loop 3 runs for the pearls. Record the decoy before the holder and the Hound follows the holder again; skip it and the runner is caught at the cellar door.',
  loops: [
    [go(9, 2)],
    [go(2, 14), to(31, 14), to(31, 12), to(8, 12)],
    [go(31, 7), go(7, 6)],
  ],
} satisfies Solution;
