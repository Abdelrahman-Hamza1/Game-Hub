/** A cheap hash of everything that matters in a world state (determinism tests, debug overlay). */
import type { World } from './world';

export function hashWorld(w: World): string {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    // hash the exact float bits
    buf[0] = v;
    for (let i = 0; i < 2; i++) {
      h ^= u32[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
  };
  mix(w.t);
  for (const a of w.actors) {
    mix(a.x);
    mix(a.y);
    mix(a.face);
    mix(a.carry);
    mix(a.state.length);
    mix(a.crouch);
  }
  for (const it of w.items) {
    mix(it.x);
    mix(it.y);
    mix(it.carrier);
  }
  for (const c of w.crates) {
    mix(c.x);
    mix(c.y);
  }
  for (const o of w.doorOpen) mix(o ? 1 : 0);
  for (const t of w.triggers) mix((t.pressed ? 1 : 0) + (t.on ? 2 : 0) + t.until * 4);
  for (const g of w.guards) {
    mix(g.x);
    mix(g.y);
    mix(g.face);
  }
  for (const c of w.cameras) mix(c.angle);
  for (const hd of w.hounds) {
    mix(hd.x);
    mix(hd.y);
  }
  return h.toString(16).padStart(8, '0');
}

const buf = new Float64Array(1);
const u32 = new Uint32Array(buf.buffer);
