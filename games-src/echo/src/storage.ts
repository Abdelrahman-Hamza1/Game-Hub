/** Settings and progress in localStorage. Every access is wrapped: the game works without storage. */
import type { DifficultyId } from './game/difficulty';

export interface Settings {
  difficulty: DifficultyId;
  volume: number;
  muted: boolean;
  captions: boolean;
  shake: boolean;
  highContrast: boolean;
}

export type Rank = 'ghost' | 'guide' | 'survivor';

export interface LevelBest {
  time: number;
  sounds: number;
  alerts: number;
  rescued: number;
  total: number;
  ranks: Rank[];
}

export interface Progress {
  /** Level ids completed at least once. */
  done: string[];
  best: Record<string, LevelBest>;
}

const KEY_SETTINGS = 'echo:settings';
const KEY_PROGRESS = 'echo:progress';

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'blind',
  volume: 0.8,
  muted: false,
  captions: true,
  shake: true,
  highContrast: false,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep going in memory */
  }
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(KEY_SETTINGS) ?? {};
  const d = DEFAULT_SETTINGS;
  return {
    difficulty: s.difficulty === 'guide' || s.difficulty === 'hardcore' || s.difficulty === 'blind' ? s.difficulty : d.difficulty,
    volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : d.volume,
    muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
    captions: typeof s.captions === 'boolean' ? s.captions : d.captions,
    shake: typeof s.shake === 'boolean' ? s.shake : d.shake,
    highContrast: typeof s.highContrast === 'boolean' ? s.highContrast : d.highContrast,
  };
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

export function loadProgress(): Progress {
  const p = read<Partial<Progress>>(KEY_PROGRESS);
  return {
    done: Array.isArray(p?.done) ? p!.done.filter((x): x is string => typeof x === 'string') : [],
    best: p?.best && typeof p.best === 'object' ? p.best : {},
  };
}

export function saveProgress(p: Progress): void {
  write(KEY_PROGRESS, p);
}

/** Merge a new result into the best for a level: every field keeps its own best. */
export function mergeBest(prev: LevelBest | undefined, r: LevelBest): LevelBest {
  if (!prev) return { ...r, ranks: [...r.ranks] };
  const ranks = Array.from(new Set([...prev.ranks, ...r.ranks])) as Rank[];
  return {
    time: Math.min(prev.time, r.time),
    sounds: Math.min(prev.sounds, r.sounds),
    alerts: Math.min(prev.alerts, r.alerts),
    rescued: Math.max(prev.rescued, r.rescued),
    total: r.total,
    ranks: (['ghost', 'guide', 'survivor'] as Rank[]).filter((k) => ranks.includes(k)),
  };
}
