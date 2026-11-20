/**
 * Echo memory: every boundary wall and floor feature keeps the brightness of the last echo that lit
 * it, decaying exponentially, plus the colour (sound kind) of the pulse that lit it most recently.
 */
import { Mat, type Level } from '../world/level';

export const CRYSTAL_HOLD = 10;
export const METAL_TAU_MULT = 3;
const EPS = 0.004;

export class Memory {
  /** Per boundary wall. */
  readonly bright: Float32Array;
  readonly kind: Uint8Array;
  readonly holdUntil: Float32Array;
  readonly fake: Uint8Array;
  /** Per floor feature (pits, rubble, rails). */
  readonly featBright: Float32Array;
  readonly featKind: Uint8Array;
  private readonly tauMult: Float32Array;

  constructor(private readonly level: Level, public tau: number) {
    const B = level.boundary.length;
    this.bright = new Float32Array(B);
    this.kind = new Uint8Array(B);
    this.holdUntil = new Float32Array(B);
    this.fake = new Uint8Array(B);
    this.featBright = new Float32Array(level.features.length);
    this.featKind = new Uint8Array(level.features.length);
    this.tauMult = new Float32Array(B);
    for (let k = 0; k < B; k++) {
      this.tauMult[k] = level.mat[level.boundary[k]] === Mat.Metal ? METAL_TAU_MULT : 1;
    }
  }

  /** Light boundary wall k. Brightness keeps the max; colour follows the latest pulse. */
  lightWall(k: number, b: number, kind: number, now: number, fake: boolean): void {
    if (b > this.bright[k]) this.bright[k] = b;
    this.kind[k] = kind;
    this.fake[k] = fake ? 1 : 0;
    if (this.level.mat[this.level.boundary[k]] === Mat.Crystal) this.holdUntil[k] = now + CRYSTAL_HOLD;
  }

  lightFeature(f: number, b: number, kind: number): void {
    if (b > this.featBright[f]) this.featBright[f] = b;
    this.featKind[f] = kind;
  }

  eraseFeature(f: number): void {
    this.featBright[f] = 0;
  }

  decay(dt: number, now: number): void {
    const base = Math.exp(-dt / this.tau);
    const metal = Math.exp(-dt / (this.tau * METAL_TAU_MULT));
    const b = this.bright;
    for (let k = 0; k < b.length; k++) {
      const v = b[k];
      if (v <= 0) continue;
      if (this.holdUntil[k] > now) continue;
      const nv = v * (this.tauMult[k] > 1 ? metal : base);
      b[k] = nv < EPS ? 0 : nv;
    }
    const f = this.featBright;
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v <= 0) continue;
      const nv = v * base;
      f[i] = nv < EPS ? 0 : nv;
    }
  }

  /** Decay factor for a single value (entities that fade like memory). */
  factor(dt: number): number {
    return Math.exp(-dt / this.tau);
  }
}
