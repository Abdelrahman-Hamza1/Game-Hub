/**
 * Every sound is synthesized with Web Audio: the clock, footsteps (panned per actor), plates,
 * doors, bells, paradox glitches, the alarm, the rewind sweep, chimes, the success arpeggio, and
 * the layered music (music.ts). Nothing plays until the first user gesture unlocks the context.
 */
import { Music } from './music';

type Ctx = AudioContext;

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  music: Music | null = null;
  private volume = 0.8;
  private musicVol = 0.7;
  private muted = false;

  /** Call from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      const n = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, n, n);
      const data = this.noiseBuf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      this.music = new Music(ctx, this.musicBus);
      this.apply();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number, music: number): void {
    this.volume = v;
    this.musicVol = music;
    this.apply();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.apply();
  }

  private apply(): void {
    if (!this.ctx || !this.master || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.05);
  }

  private get ok(): boolean {
    return !!this.ctx && !!this.sfx && this.ctx.state === 'running' && !this.muted;
  }

  private now(): number {
    return this.ctx!.currentTime + 0.005;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; pan?: number; at?: number; slide?: number; attack?: number } = {}): void {
    if (!this.ok) return;
    const ctx = this.ctx!;
    const t = opts.at ?? this.now();
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o.connect(g);
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { gain?: number; freq?: number; q?: number; type?: BiquadFilterType; pan?: number; at?: number; sweepTo?: number } = {}): void {
    if (!this.ok || !this.noiseBuf) return;
    const ctx = this.ctx!;
    const t = opts.at ?? this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = src.connect(f).connect(g);
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.sfx!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- the sounds ----------

  /** The clock: every second; higher in the last two. */
  tick(secondsLeft: number): void {
    const hi = secondsLeft <= 2;
    this.noise(0.03, { freq: hi ? 5200 : 3400, q: 8, gain: hi ? 0.32 : 0.22 });
    this.tone(hi ? 1760 : 1180, 0.05, { type: 'square', gain: hi ? 0.05 : 0.03 });
  }

  step(pan: number, live: boolean): void {
    this.noise(0.045, { freq: live ? 520 : 420, q: 1.4, gain: live ? 0.07 : 0.025, pan, type: 'lowpass' });
  }

  plate(down: boolean, pan: number): void {
    this.tone(down ? 320 : 240, 0.08, { type: 'triangle', gain: 0.16, pan });
    this.noise(0.03, { freq: 2400, q: 3, gain: 0.08, pan });
  }

  door(open: boolean, pan: number): void {
    this.noise(0.22, { freq: open ? 600 : 1100, sweepTo: open ? 1500 : 400, q: 2, gain: 0.14, pan });
    this.tone(open ? 140 : 110, 0.18, { type: 'sawtooth', gain: 0.025, pan, slide: open ? 1.3 : 0.75 });
  }

  press(pan: number): void {
    this.tone(880, 0.06, { type: 'square', gain: 0.05, pan });
  }

  bell(pan: number): void {
    for (const [f, g] of [
      [1318, 0.16],
      [1975, 0.07],
      [2637, 0.04],
    ] as const) {
      this.tone(f, 1.6, { gain: g, pan, attack: 0.002 });
    }
  }

  pickup(pan: number): void {
    this.tone(660, 0.08, { type: 'triangle', gain: 0.12, pan });
    this.tone(990, 0.12, { type: 'triangle', gain: 0.1, pan, at: this.ctx ? this.now() + 0.06 : 0 });
  }

  drop(pan: number): void {
    this.tone(520, 0.1, { type: 'triangle', gain: 0.1, pan, slide: 0.7 });
  }

  whoosh(pan: number): void {
    this.noise(0.25, { freq: 800, sweepTo: 2400, q: 1.5, gain: 0.1, pan });
  }

  coinLand(pan: number): void {
    this.tone(2400, 0.25, { type: 'triangle', gain: 0.08, pan });
    this.tone(3100, 0.18, { type: 'sine', gain: 0.05, pan, at: this.ctx ? this.now() + 0.08 : 0 });
  }

  paradox(pan: number): void {
    if (!this.ok) return;
    const t = this.now();
    for (let i = 0; i < 6; i++) this.tone(200 + ((i * 337) % 900), 0.05, { type: 'square', gain: 0.06, pan, at: t + i * 0.035 });
    this.noise(0.25, { freq: 3000, q: 0.7, gain: 0.08, pan, at: t });
  }

  alarm(): void {
    if (!this.ok) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      this.tone(880, 0.16, { type: 'sawtooth', gain: 0.12, at: t + i * 0.2 });
      this.tone(660, 0.16, { type: 'sawtooth', gain: 0.1, at: t + i * 0.2 + 0.1 });
    }
  }

  /** A descending tape sound, 0.65 s. */
  rewind(): void {
    if (!this.ok) return;
    const t = this.now();
    this.tone(900, 0.62, { type: 'sawtooth', gain: 0.06, slide: 0.12, at: t, attack: 0.03 });
    this.tone(1340, 0.62, { type: 'triangle', gain: 0.04, slide: 0.15, at: t, attack: 0.03 });
    this.noise(0.6, { freq: 4000, sweepTo: 300, q: 0.8, gain: 0.08, at: t });
  }

  chime(): void {
    if (!this.ok) return;
    const t = this.now();
    this.tone(1046, 0.6, { gain: 0.09, at: t });
    this.tone(1568, 0.8, { gain: 0.06, at: t + 0.07 });
  }

  success(): void {
    if (!this.ok) return;
    const t = this.now();
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', gain: 0.12, at: t + i * 0.09 }));
    this.tone(2093, 1.2, { gain: 0.05, at: t + 0.45 });
  }

  /** The sting as the target crosses into the exit in the payoff replay. */
  sting(): void {
    if (!this.ok) return;
    const t = this.now();
    for (const f of [392, 494, 587, 784]) this.tone(f, 1.4, { type: 'sawtooth', gain: 0.035, at: t, attack: 0.01 });
    this.noise(0.6, { freq: 6000, q: 0.5, gain: 0.06, at: t });
  }

  ui(): void {
    this.tone(1200, 0.04, { type: 'triangle', gain: 0.05 });
  }

  denied(): void {
    this.tone(180, 0.14, { type: 'square', gain: 0.06 });
  }
}

export const audio = new Audio();
