/** Every level file, bundled at build time (no runtime fetches). */
import { parseLevel, type Level, type LevelMeta } from '../world/level';

const grids = import.meta.glob('./*/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const metas = import.meta.glob('./*/*.json', { import: 'default', eager: true }) as Record<string, LevelMeta>;

export interface LevelEntry {
  /** "1-01" */
  id: string;
  chapter: number;
  number: number;
  text: string;
  meta: LevelMeta;
}

export const CHAPTERS = [
  { n: 1, name: 'The Tour', blurb: 'Steps, claps, wind and stones. Something else is down here.' },
  { n: 2, name: 'Flooded Galleries', blurb: 'Water splashes. Waterfalls hide you. Swarms give you away.' },
  { n: 3, name: 'The Old Mine', blurb: 'Metal rings. Rubble for stones. Minecarts for distractions.' },
  { n: 4, name: 'Crystal Halls', blurb: 'Crystal holds echoes and throws sound twice as far.' },
  { n: 5, name: 'The Deep', blurb: 'Something copies your sounds. Trust only what starts with you.' },
] as const;

export const LEVELS: LevelEntry[] = Object.keys(grids)
  .map((path) => {
    const m = /\.\/(\d+)\/(\d+)\.txt$/.exec(path);
    if (!m) return null;
    const chapter = Number(m[1]);
    const number = Number(m[2]);
    const meta = metas[path.replace(/\.txt$/, '.json')];
    return {
      id: `${chapter}-${String(number).padStart(2, '0')}`,
      chapter,
      number,
      text: grids[path],
      meta: meta ?? { name: `Level ${chapter}-${number}`, stones: 3, hint: '', parTime: 120 },
    };
  })
  .filter((e): e is LevelEntry => e !== null)
  .sort((a, b) => a.chapter - b.chapter || a.number - b.number);

export function levelById(id: string): LevelEntry | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function loadLevel(entry: LevelEntry): Level {
  return parseLevel(entry.text, entry.meta, entry.id);
}

export function nextLevel(id: string): LevelEntry | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}
