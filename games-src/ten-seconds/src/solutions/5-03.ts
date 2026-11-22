import { go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 slips into the closet (it opens at 0.5 s and locks at 3 s) and holds plate a. The Auditor can\'t walk into a locked room, so in loop 2 he stays at his post. Loop 2 is the decoy: it takes the north corridor to the top of the east stair, waits, and only reaches the far south-east corner at 9.5 s. Loop 3: the Auditor walks to that corner, waits and walks back, and the runner takes the regulator through door A while he\'s gone. Recorded the other way round, the plate holder would be the newest copy, and since its closet is shut at the start of the loop, the Auditor would stay at his post.',
  loops: [
    [go(5, 14)],
    [go(8, 1), go(38, 2), until(8.25), go(38, 15)],
    [until(0.8), go(30, 7), go(34, 7), go(1, 4)],
  ],
} satisfies Solution;
