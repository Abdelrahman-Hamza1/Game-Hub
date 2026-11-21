import { go, until, type Solution } from './dsl';

export default {
  note: 'One loop. Wait in the corner while the camera sweeps toward you; once its eye has passed the middle (about 3.3 s), cross under it to the gem and keep ahead of it to the exit. Following behind it after it turns back (leave about 5.8 s) also works.',
  loops: [[until(3.3), go(14, 3), go(27, 9)]],
} satisfies Solution;
