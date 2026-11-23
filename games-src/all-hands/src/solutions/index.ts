/** Every level's scripted solution: src/solutions/<world>-<nn>.ts, found by file name. */
import type { Solution } from './dsl';

const mods = import.meta.glob('./[1-9]-*.ts', { import: 'default', eager: true }) as Record<string, Solution>;

/** "1-3" → ./1-03.ts */
export function solutionFor(id: string): Solution | undefined {
  const [w, n] = id.split('-');
  return mods[`./${w}-${n === 'F' ? 'f' : n.padStart(2, '0')}.ts`];
}
