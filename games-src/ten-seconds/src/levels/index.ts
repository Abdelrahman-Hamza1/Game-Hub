/** Every level, bundled: `<chapter>/<nn>.txt` + `.json`. Finales are `f`. */
import { parseLevel, type Level, type LevelJson } from '../sim/level';

const texts = import.meta.glob('./*/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const jsons = import.meta.glob('./*/*.json', { import: 'default', eager: true }) as Record<string, LevelJson>;

export interface Chapter {
  n: number;
  name: string;
  place: string;
  teaches: string;
  levels: Level[];
}

export const CHAPTER_INFO = [
  { n: 1, name: 'The Museum', place: 'Halverson Museum, after hours', teaches: 'Loops, copies, plates, guards, lures, windows' },
  { n: 2, name: 'The Bank', place: 'Corran & Vale, vault level', teaches: 'Switches, inverted and timed doors, keycards, cameras' },
  { n: 3, name: 'The Gala', place: 'The Ostrander Gala, ballroom', teaches: 'Lasers, mirrors, crates, boosts, the Hound' },
  { n: 4, name: 'The Night Train', place: 'The 23:40 to Calder', teaches: 'Moving carriages, coins' },
  { n: 5, name: 'The Clocktower', place: 'The Watchmaker\'s tower', teaches: 'Loop lengths, rewind stones, the Auditor' },
];

/** "1-01" style file key → level id "1-1" / "1-F". */
function idOf(chapter: string, nn: string): string {
  return `${chapter}-${nn === 'f' ? 'F' : String(Number(nn))}`;
}

const all: Level[] = [];
for (const [path, text] of Object.entries(texts)) {
  const m = path.match(/^\.\/(\d)\/(\d\d|f)\.txt$/);
  if (!m) continue;
  const json = jsons[path.replace(/\.txt$/, '.json')] ?? {};
  all.push(parseLevel(idOf(m[1], m[2]), text, json));
}
const order = (id: string) => {
  const [c, n] = id.split('-');
  return Number(c) * 100 + (n === 'F' ? 99 : Number(n));
};
all.sort((a, b) => order(a.id) - order(b.id));

export const LEVELS: Level[] = all;

export const CHAPTERS: Chapter[] = CHAPTER_INFO.map((c) => ({ ...c, levels: all.filter((l) => l.id.startsWith(c.n + '-')) })).filter((c) => c.levels.length);

export function levelById(id: string): Level | undefined {
  return all.find((l) => l.id === id);
}

/** The level after this one, across chapters. */
export function nextLevel(id: string): Level | undefined {
  const i = all.findIndex((l) => l.id === id);
  return i >= 0 ? all[i + 1] : undefined;
}

/** "1-01" file key for a level id (solutions use it). */
export function fileKey(id: string): string {
  const [c, n] = id.split('-');
  return `${c}-${n === 'F' ? 'f' : n.padStart(2, '0')}`;
}
