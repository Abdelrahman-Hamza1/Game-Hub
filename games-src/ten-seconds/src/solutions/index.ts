/** Every level's scripted solution, by level id (the tests, the title demo, the assist hint). */
import { fileKey } from '../levels';
import type { Solution } from './dsl';

const mods = import.meta.glob('./[1-5]-*.ts', { import: 'default', eager: true }) as Record<string, Solution>;

export function solutionFor(id: string): Solution | undefined {
  return mods[`./${fileKey(id)}.ts`];
}
