/** Settings and progress in localStorage (keys prefixed "ten-seconds:"). Every access is wrapped. */
import type { DifficultyId } from './game/difficulty';

export interface Settings {
  difficulty: DifficultyId;
  volume: number;
  music: number;
  reducedMotion: 'auto' | 'on' | 'off';
  colorblind: boolean;
  /** show every copy's path on the map */
  paths: boolean;
}

export interface LevelBest {
  loops: number;
  time: number;
  par: boolean;
  clean: boolean;
  swift: boolean;
}

export interface Progress {
  best: Record<string, LevelBest>;
}

const KEY_SETTINGS = 'ten-seconds:settings';
const KEY_PROGRESS = 'ten-seconds:progress';

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'normal',
  volume: 0.8,
  music: 0.7,
  reducedMotion: 'auto',
  colorblind: false,
  paths: true,
};

export function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep going in memory */
  }
}

const num = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(KEY_SETTINGS) ?? {};
  const d = DEFAULT_SETTINGS;
  return {
    difficulty: s.difficulty === 'assist' || s.difficulty === 'hardcore' || s.difficulty === 'normal' ? s.difficulty : d.difficulty,
    volume: num(s.volume, d.volume),
    music: num(s.music, d.music),
    reducedMotion: s.reducedMotion === 'on' || s.reducedMotion === 'off' ? s.reducedMotion : 'auto',
    colorblind: typeof s.colorblind === 'boolean' ? s.colorblind : d.colorblind,
    paths: typeof s.paths === 'boolean' ? s.paths : d.paths,
  };
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

export function loadProgress(): Progress {
  const p = read<Partial<Progress>>(KEY_PROGRESS);
  const best: Record<string, LevelBest> = {};
  if (p?.best && typeof p.best === 'object') {
    for (const [k, v] of Object.entries(p.best)) {
      if (v && typeof v.loops === 'number' && typeof v.time === 'number') best[k] = { loops: v.loops, time: v.time, par: !!v.par, clean: !!v.clean, swift: !!v.swift };
    }
  }
  return { best };
}

export function saveProgress(p: Progress): void {
  write(KEY_PROGRESS, p);
}

/** Every field keeps its own best. */
export function mergeBest(prev: LevelBest | undefined, r: LevelBest): LevelBest {
  if (!prev) return { ...r };
  return {
    loops: Math.min(prev.loops, r.loops),
    time: Math.min(prev.time, r.time),
    par: prev.par || r.par,
    clean: prev.clean || r.clean,
    swift: prev.swift || r.swift,
  };
}
