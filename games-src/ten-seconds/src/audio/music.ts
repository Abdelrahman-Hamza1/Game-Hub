/**
 * The layered soundtrack. The loop clock is the beat: one beat per second, ten beats a loop, in
 * sixteenths (4 steps a beat). The sim calls step() on every sixteenth, so slow motion slows the
 * music too. Each copy in the plan adds a layer:
 *
 *   1 bass · 2 arpeggio · 3 pad · 4 shaker · 5 lead · 6 bells
 */
const ROOTS = [57, 57, 57, 53, 53, 48, 48, 48, 55, 55]; // A A A F F C C C G G (MIDI), one per beat
const CHORDS: Record<number, number[]> = {
  57: [0, 3, 7, 12],
  53: [0, 4, 7, 11],
  48: [0, 4, 7, 12],
  55: [0, 4, 7, 10],
};
// lead motif: [beat, sixteenth, semitone offset from A4, length in steps]
const LEAD: [number, number, number, number][] = [
  [0, 0, 0, 3],
  [0, 3, 3, 1],
  [1, 0, 7, 4],
  [2, 2, 5, 2],
  [3, 0, 3, 3],
  [3, 3, 0, 1],
  [4, 0, -2, 4],
  [5, 0, 3, 2],
  [5, 2, 7, 2],
  [6, 0, 12, 4],
  [7, 2, 10, 2],
  [8, 0, 7, 3],
  [9, 0, 5, 2],
  [9, 2, 2, 2],
];
const BELLS: [number, number, number][] = [
  [0, 2, 19],
  [2, 0, 15],
  [4, 2, 17],
  [6, 0, 24],
  [7, 2, 22],
  [9, 0, 19],
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private layerGain: GainNode[] = [];
  layers = 0;

  constructor(ctx: AudioContext, bus: GainNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.out.connect(lp).connect(bus);
    for (let i = 0; i < 6; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.layerGain.push(g);
    }
    this.noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** How many layers play (copies in the plan, capped at 6); fades between counts. */
  setLayers(n: number): void {
    this.layers = Math.max(0, Math.min(6, n));
    const t = this.ctx.currentTime;
    const levels = [0.5, 0.22, 0.12, 0.16, 0.12, 0.1];
    this.layerGain.forEach((g, i) => g.gain.setTargetAtTime(i < this.layers ? levels[i] : 0, t, 0.25));
  }

  /** Hush everything (pause, menus). */
  silence(): void {
    const t = this.ctx.currentTime;
    this.layerGain.forEach((g) => g.gain.setTargetAtTime(0, t, 0.1));
  }

  /** Play sixteenth `step` of the loop (0 = loop start). `rate` < 1 in slow motion. */
  step(step: number, rate: number): void {
    if (this.ctx.state !== 'running' || this.layers === 0) return;
    const t = this.ctx.currentTime + 0.03;
    const beat = Math.floor(step / 4) % 10;
    const six = step % 4;
    const root = ROOTS[beat];
    const chord = CHORDS[root];
    const stepDur = 0.25 / Math.max(0.3, rate);
    const L = this.layers;
    // 1 bass: root on the beat, fifth on the "and"
    if (L >= 1 && (six === 0 || six === 2)) {
      const m = root - 24 + (six === 2 && beat % 2 === 1 ? 7 : 0);
      this.voice(0, mtof(m), stepDur * 1.8, 'triangle', 0.9, t);
    }
    // 2 arpeggio: eighths up the chord
    if (L >= 2 && six % 2 === 0) {
      const k = (beat * 2 + six / 2) % chord.length;
      this.voice(1, mtof(root + chord[k]), stepDur * 1.5, 'triangle', 0.8, t);
    }
    // 3 pad: chord on chord changes
    if (L >= 3 && six === 0 && (beat === 0 || ROOTS[beat] !== ROOTS[(beat + 9) % 10])) {
      const len = ROOTS.slice(beat).findIndex((r) => r !== root);
      const dur = (len < 0 ? 10 - beat : len) * 4 * stepDur;
      for (const iv of chord.slice(0, 3)) {
        this.voice(2, mtof(root + iv - 12), dur, 'sawtooth', 0.35, t, 0.25);
        this.voice(2, mtof(root + iv - 12) * 1.004, dur, 'sawtooth', 0.35, t, 0.25);
      }
    }
    // 4 shaker: sixteenths, accents off the beat
    if (L >= 4) this.hat(3, six === 2 ? 0.9 : 0.45, t);
    // 5 lead
    if (L >= 5) for (const [b, s, off, len] of LEAD) if (b === beat && s === six) this.voice(4, mtof(69 + off), len * stepDur, 'square', 0.5, t, 0.01);
    // 6 bells
    if (L >= 6) for (const [b, s, off] of BELLS) if (b === beat && s === six) this.voice(5, mtof(69 + off), 1.2, 'sine', 0.9, t, 0.002);
  }

  private voice(layer: number, f: number, dur: number, type: OscillatorType, gain: number, t: number, attack = 0.005): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur));
    if (type === 'sawtooth' || type === 'square') {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = type === 'square' ? 2200 : 1100;
      o.connect(f2).connect(g);
    } else o.connect(g);
    g.connect(this.layerGain[layer]);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private hat(layer: number, gain: number, t: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.layerGain[layer]);
    src.start(t);
    src.stop(t + 0.08);
  }
}
