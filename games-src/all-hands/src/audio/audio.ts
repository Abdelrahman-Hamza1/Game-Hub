/**
 * Every sound is synthesized with Web Audio, and so is the music: a soft loop in four parts that
 * fills in as more of the team gets home. Nothing plays until a user gesture unlocks audio.
 */
import type { GameEvent } from '../sim/types';

type Wave = OscillatorType;

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private musicVol = 0.6;
  private muted = false;
  private lastPush = 0;
  private musicOn = false;
  private nextBar = 0;
  private bar = 0;
  /** 0..4: how many music parts play */
  layers = 1;
  private timer: number | null = null;

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
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      const n = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      let seed = 7;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x7fffffff) * 2 - 1;
      }
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
    if (!this.ctx || !this.master || !this.sfx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.volume * 0.8, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.35, t, 0.1);
  }

  // ───────────────────────── building blocks ─────────────────────────

  private tone(freq: number, dur: number, opts: { wave?: Wave; gain?: number; slide?: number; delay?: number; attack?: number; bus?: GainNode | null } = {}): void {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfx;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.wave ?? 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, opts: { gain?: number; freq?: number; q?: number; delay?: number; type?: BiquadFilterType } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq ?? 1200;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, ((t * 7.3) % 0.8) + 0.01);
    src.stop(t + dur + 0.02);
  }

  /** each player has their own pitch, so you can hear who did what */
  private pitch(p: number): number {
    return [1, 1.12, 0.9, 1.25][p] ?? 1;
  }

  // ───────────────────────── game sounds ─────────────────────────

  play(evs: GameEvent[]): void {
    if (!this.ctx) return;
    for (const e of evs) {
      const k = e.p >= 0 ? this.pitch(e.p) : 1;
      switch (e.type) {
        case 'jump':
          this.tone(330 * k, 0.14, { wave: 'square', gain: 0.05, slide: 1.8 });
          break;
        case 'land':
          this.tone(120 * k, 0.08, { wave: 'sine', gain: 0.12, slide: 0.6 });
          break;
        case 'grab':
          this.tone(520 * k, 0.07, { wave: 'triangle', gain: 0.12, slide: 1.4 });
          break;
        case 'throw':
          this.hiss(0.18, { freq: 1800, q: 0.7, gain: 0.12 });
          this.tone(400 * k, 0.16, { gain: 0.06, slide: 2 });
          break;
        case 'drop':
          this.tone(300 * k, 0.08, { gain: 0.08, slide: 0.7 });
          break;
        case 'key':
          [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.18, { delay: i * 0.05, gain: 0.08, wave: 'sine' }));
          break;
        case 'open':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, { delay: i * 0.07, gain: 0.09 }));
          break;
        case 'enter':
          this.tone(392 * k, 0.12, { gain: 0.1, slide: 1.5 });
          this.tone(587 * k, 0.16, { gain: 0.08, delay: 0.07 });
          break;
        case 'exit':
          this.tone(587 * k, 0.12, { gain: 0.08, slide: 0.7 });
          break;
        case 'pop':
          this.tone(700 * k, 0.05, { wave: 'square', gain: 0.08 });
          this.tone(500 * k, 0.4, { wave: 'triangle', gain: 0.1, slide: 0.25, delay: 0.04 });
          break;
        case 'respawn':
          [660, 990].forEach((f, i) => this.tone(f * k, 0.12, { delay: i * 0.06, gain: 0.06, wave: 'sine' }));
          break;
        case 'plate':
          this.tone(e.on ? 660 : 440, 0.06, { wave: 'square', gain: 0.05 });
          break;
        case 'button':
          this.tone(e.on ? 880 : 520, 0.05, { wave: 'square', gain: 0.05 });
          break;
        case 'gate':
          this.hiss(0.25, { freq: e.on ? 900 : 500, q: 2, gain: 0.08 });
          this.tone(e.on ? 220 : 165, 0.25, { wave: 'sawtooth', gain: 0.03, slide: e.on ? 1.5 : 0.7 });
          break;
        case 'spring':
          this.tone(200, 0.35, { wave: 'sine', gain: 0.14, slide: 3.5 });
          break;
        case 'flag':
          [784, 988, 1175].forEach((f, i) => this.tone(f, 0.2, { delay: i * 0.06, gain: 0.07, wave: 'sine' }));
          break;
        case 'crumble':
          this.hiss(0.35, { freq: 400, q: 0.6, gain: 0.2, type: 'lowpass' });
          break;
        case 'push': {
          const now = this.ctx.currentTime;
          if (now - this.lastPush > 0.22) {
            this.lastPush = now;
            this.hiss(0.2, { freq: 160, q: 0.8, gain: 0.1, type: 'lowpass' });
          }
          break;
        }
        case 'win':
          [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, { delay: i * 0.09, gain: 0.1 }));
          break;
      }
    }
  }

  chat(p: number): void {
    this.tone(1046 * this.pitch(p), 0.06, { wave: 'sine', gain: 0.06 });
  }

  click(): void {
    this.tone(700, 0.04, { wave: 'square', gain: 0.03 });
  }

  // ───────────────────────── music ─────────────────────────

  startMusic(): void {
    if (this.musicOn) return;
    this.musicOn = true;
    if (!this.ctx) return;
    this.nextBar = this.ctx.currentTime + 0.1;
    this.bar = 0;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.nextBar < this.ctx.currentTime + 0.6) {
        this.scheduleBar(this.nextBar, this.bar++);
        this.nextBar += BAR;
      }
      this.timer = window.setTimeout(tick, 200);
    };
    tick();
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleBar(t0: number, bar: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const chord = CHORDS[bar % CHORDS.length];
    const at = (beat: number) => Math.max(0, t0 + beat * BEAT - ctx.currentTime);
    // 1: bass on every beat
    for (let b = 0; b < 4; b++) this.tone(chord[0] / 2, BEAT * 0.9, { wave: 'triangle', gain: 0.22, delay: at(b), bus: this.musicBus, attack: 0.02 });
    // 2: soft chord on beats 1 and 3
    if (this.layers >= 2) for (const b of [0, 2]) for (const f of chord) this.tone(f, BEAT * 1.6, { wave: 'sine', gain: 0.05, delay: at(b), bus: this.musicBus, attack: 0.05 });
    // 3: an arpeggio in eighths
    if (this.layers >= 3) for (let i = 0; i < 8; i++) this.tone(chord[i % 3] * 2, BEAT * 0.4, { wave: 'triangle', gain: 0.035, delay: at(i / 2), bus: this.musicBus });
    // 4: a little tune
    if (this.layers >= 4) {
      const tune = TUNE[bar % TUNE.length];
      tune.forEach((f, i) => f && this.tone(f, BEAT * 0.8, { wave: 'square', gain: 0.025, delay: at(i), bus: this.musicBus }));
    }
  }
}

const BPM = 104;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
// C - Am - F - G, in a gentle register
const CHORDS = [
  [261.6, 329.6, 392.0],
  [220.0, 261.6, 329.6],
  [174.6, 220.0, 261.6],
  [196.0, 246.9, 293.7],
];
const TUNE = [
  [523.3, 0, 659.3, 587.3],
  [523.3, 440.0, 0, 523.3],
  [440.0, 0, 523.3, 587.3],
  [587.3, 523.3, 493.9, 0],
];
