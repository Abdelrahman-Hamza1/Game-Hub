/**
 * A recording is one loop of the player: per tick, the position after moving, the facing and the
 * actions taken. Copies replay recordings by position (see actors.ts), with a trim: `delay` ticks
 * waiting on the start tile first, and only the first `cut` frames played.
 */
export const ACT_USE = 1;

export interface Recording {
  /** unique per level session */
  id: number;
  /** bigger = recorded more recently (the Hound and the Auditor care) */
  stamp: number;
  len: number;
  xs: Float64Array;
  ys: Float64Array;
  face: Float64Array;
  act: Uint8Array;
  /** ticks spent waiting at the start before frame 0 plays */
  delay: number;
  /** frames played; after that the copy stands still */
  cut: number;
}

let nextId = 1;

export function newRecording(capacity: number, stamp: number): Recording {
  return {
    id: nextId++,
    stamp,
    len: 0,
    xs: new Float64Array(capacity),
    ys: new Float64Array(capacity),
    face: new Float64Array(capacity),
    act: new Uint8Array(capacity),
    delay: 0,
    cut: 0,
  };
}

export function pushFrame(r: Recording, x: number, y: number, face: number, act: number): void {
  if (r.len >= r.xs.length) grow(r);
  const i = r.len++;
  r.xs[i] = x;
  r.ys[i] = y;
  r.face[i] = face;
  r.act[i] = act;
  r.cut = r.len;
}

function grow(r: Recording): void {
  const n = Math.max(16, r.xs.length * 2);
  const cp = <T extends Float64Array | Uint8Array>(a: T, b: T) => (b.set(a), b);
  r.xs = cp(r.xs, new Float64Array(n));
  r.ys = cp(r.ys, new Float64Array(n));
  r.face = cp(r.face, new Float64Array(n));
  r.act = cp(r.act, new Uint8Array(n));
}

/** The world tick range [start, end) in which the copy plays frames. */
export function activeSpan(r: Recording): [number, number] {
  return [r.delay, r.delay + r.cut];
}

/** Move the start (delay) and end (cut) of a copy; clamps to sensible values. */
export function setTrim(r: Recording, delay: number, cut: number, loopTicks: number): void {
  r.delay = Math.max(0, Math.min(loopTicks - 1, Math.round(delay)));
  r.cut = Math.max(1, Math.min(r.len, Math.round(cut)));
}

/** Where the copy stands at its last played frame (the Auditor walks there). */
export function endPoint(r: Recording, sx: number, sy: number): [number, number] {
  if (r.cut <= 0) return [sx, sy];
  return [r.xs[r.cut - 1], r.ys[r.cut - 1]];
}

export function cloneRecording(r: Recording): Recording {
  return {
    ...r,
    xs: r.xs.slice(),
    ys: r.ys.slice(),
    face: r.face.slice(),
    act: r.act.slice(),
  };
}

/** Serialisable form (solutions, the title demo, debugging). */
export interface RecordingJson {
  stamp: number;
  delay: number;
  cut: number;
  frames: [number, number, number, number][];
}

export function recordingToJson(r: Recording): RecordingJson {
  const frames: [number, number, number, number][] = [];
  for (let i = 0; i < r.len; i++) frames.push([r.xs[i], r.ys[i], r.face[i], r.act[i]]);
  return { stamp: r.stamp, delay: r.delay, cut: r.cut, frames };
}

export function recordingFromJson(j: RecordingJson): Recording {
  const r = newRecording(j.frames.length || 1, j.stamp);
  for (const f of j.frames) pushFrame(r, f[0], f[1], f[2], f[3]);
  r.delay = j.delay;
  r.cut = Math.min(j.cut, r.len);
  return r;
}
