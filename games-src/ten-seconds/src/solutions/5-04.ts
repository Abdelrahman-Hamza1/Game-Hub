import { go, until, type Solution } from './dsl';

export default {
  note: 'Gear doors line up for 1 s in every 5: G (plate b) at 0.5 s, F (plate a) at 2 s, H (the vault) at 4 s. Loop 1 rides gear G onto plate b, loop 2 rides gear F onto plate a, loop 3 goes through A and B and waits for H at 4 s. One copy cannot hold both plates: in pocket b it is locked in from 1.5 s to 5.5 s, and once out of pocket a (by 3 s) gear G does not come round again until 5.5 s, after H has turned away.',
  loops: [
    [go(5, 8), go(5, 11)],
    [go(5, 4), until(1.5), go(5, 1)],
    [go(24, 6), until(4.0), go(38, 11), go(26, 1)],
  ],
} satisfies Solution;
