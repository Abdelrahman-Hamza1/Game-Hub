/**
 * Every built-in level, bundled from levels/<world>/<nn>.txt + .json. Adding a file is all it
 * takes: the list below is built from whatever is in the folder.
 */
import { parseLevel, type Level, type LevelJson } from './sim/level';

const txts = import.meta.glob('../levels/*/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const jsons = import.meta.glob('../levels/*/*.json', { import: 'default', eager: true }) as Record<string, LevelJson>;

export interface WorldInfo {
  n: number;
  name: string;
  /** what this world adds */
  blurb: string;
  color: string;
}

export const WORLDS: WorldInfo[] = [
  { n: 1, name: 'Backyard', blurb: 'Stand on friends, push together, hold the plates.', color: '#2ec4a6' },
  { n: 2, name: 'Workshop', blurb: 'Crates, buttons, timers and lifts.', color: '#ffb26b' },
  { n: 3, name: 'Rooftops', blurb: 'Grab and throw: crates, the key, each other.', color: '#4d96ff' },
  { n: 4, name: 'Funhouse', blurb: 'Colour gates, scales and moving floors.', color: '#ff6b6b' },
  { n: 5, name: 'Night Market', blurb: 'The dark, a lantern, and a rope between you.', color: '#8a7fd6' },
  { n: 6, name: 'Clockwork', blurb: 'The screen scrolls. Keep up, together.', color: '#ffc43d' },
];

/** "1-3" from "../levels/1/03.txt" */
export function idFromPath(path: string): string {
  const m = path.match(/levels\/(\d+)\/(\w+)\.(txt|json)$/)!;
  return `${Number(m[1])}-${m[2] === 'f' ? 'F' : Number(m[2])}`;
}

export const LEVELS: Level[] = Object.keys(txts)
  .map((p) => {
    const id = idFromPath(p);
    const json = jsons[p.replace(/\.txt$/, '.json')];
    return parseLevel(id, txts[p], json);
  })
  .sort((a, b) => a.world - b.world || a.index - b.index);

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): Level | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

export function worldLevels(n: number): Level[] {
  return LEVELS.filter((l) => l.world === n);
}
