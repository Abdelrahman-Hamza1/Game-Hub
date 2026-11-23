/** Settings and progress in localStorage (keys prefixed "all-hands:"). Every access is wrapped. */
import { LEVELS } from './levels';

export interface Settings {
  volume: number;
  music: number;
  reducedMotion: 'auto' | 'on' | 'off';
  /** every level open (for testing, or friends who've played before) */
  unlockAll: boolean;
}

export interface LevelBest {
  /** seconds */
  time: number;
  fast: boolean;
  noPop: boolean;
}

export interface Progress {
  best: Record<string, LevelBest>;
}

const KEY_SETTINGS = 'all-hands:settings';
const KEY_PROGRESS = 'all-hands:progress';

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, music: 0.6, reducedMotion: 'auto', unlockAll: false };

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
    /* storage blocked: keep going in memory */
  }
}

const unit = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(KEY_SETTINGS) ?? {};
  return {
    volume: unit(s.volume, DEFAULT_SETTINGS.volume),
    music: unit(s.music, DEFAULT_SETTINGS.music),
    reducedMotion: s.reducedMotion === 'on' || s.reducedMotion === 'off' ? s.reducedMotion : 'auto',
    unlockAll: s.unlockAll === true,
  };
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s);
}

export function loadProgress(): Progress {
  const p = read<Progress>(KEY_PROGRESS);
  return p && typeof p.best === 'object' && p.best ? p : { best: {} };
}

/** Record a clear; returns whether it was a new best time. */
export function recordClear(id: string, time: number, par: number, pops: number): { best: boolean; prev: LevelBest | null } {
  const p = loadProgress();
  const prev = p.best[id] ?? null;
  const now: LevelBest = { time, fast: time <= par, noPop: pops === 0 };
  const merged: LevelBest = prev
    ? { time: Math.min(prev.time, time), fast: prev.fast || now.fast, noPop: prev.noPop || now.noPop }
    : now;
  p.best[id] = merged;
  write(KEY_PROGRESS, p);
  return { best: !prev || time < prev.time, prev };
}

/**
 * Worlds open in order (a world opens when the previous world's last level is cleared); inside a
 * world, clearing a level opens the next two.
 */
export function unlocked(id: string, s: Settings = loadSettings()): boolean {
  if (s.unlockAll) return true;
  const best = loadProgress().best;
  const lv = LEVELS.find((l) => l.id === id);
  if (!lv) return false;
  if (lv.world > 1) {
    const prevWorld = LEVELS.filter((l) => l.world === lv.world - 1);
    const last = prevWorld[prevWorld.length - 1];
    if (!last || !best[last.id]) return false;
  }
  if (lv.index <= 2) return true;
  return !!best[`${lv.world}-${lv.index - 1}`] || !!best[`${lv.world}-${lv.index - 2}`];
}

export function clearedCount(): number {
  const best = loadProgress().best;
  return LEVELS.filter((l) => best[l.id]).length;
}

/** The first open level that isn't cleared yet (for "Continue"). */
export function nextToPlay(): string {
  const best = loadProgress().best;
  for (const l of LEVELS) if (!best[l.id] && unlocked(l.id)) return l.id;
  return LEVELS[0].id;
}
