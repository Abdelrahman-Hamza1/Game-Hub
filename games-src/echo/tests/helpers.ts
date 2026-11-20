import { Game } from '../src/game/game';
import { DIFFICULTIES, type DifficultyId } from '../src/game/difficulty';
import { noActions, type Actions } from '../src/game/actions';
import { parseLevel, type Level } from '../src/world/level';
import { SIM_DT } from '../src/game/constants';

/** Build a level from rows of text. */
export function lvl(...rows: string[]): Level {
  return parseLevel(rows.join('\n'), { name: 'test', stones: 3, hint: '', parTime: 60 }, 'test');
}

export function idx(level: Level, x: number, y: number): number {
  return y * level.w + x;
}

export function game(level: Level, opts: { difficulty?: DifficultyId; seed?: number } = {}): Game {
  return new Game({ level, difficulty: DIFFICULTIES[opts.difficulty ?? 'blind'], seed: opts.seed ?? 1 });
}

/** Run the simulation for `seconds`, optionally with actions produced per tick. */
export function run(g: Game, seconds: number, act: (g: Game) => Partial<Actions> = () => ({})): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) {
    g.update(SIM_DT, { ...noActions(), ...act(g) });
    if (g.status !== 'playing') return;
  }
}

/** One tick with a single action pressed. */
export function press(g: Game, a: Partial<Actions>): void {
  g.update(SIM_DT, { ...noActions(), ...a });
}
