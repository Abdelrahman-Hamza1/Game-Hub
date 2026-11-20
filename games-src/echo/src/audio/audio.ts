/**
 * Web Audio engine (brief §6): one AudioContext started on the first gesture, positioned synth
 * sounds, path-distance falloff, reverb by room size, heartbeat, waterfall noise and a title drone.
 */
import type { Game } from '../game/game';
import type { GameEvent } from '../game/events';
import { MIMIC_DETUNE_CENTS } from '../game/constants';
import type { Pulse } from '../sound/pulses';
import { tileAt } from '../world/grid';
import { gainFor, heartBpm, heartGain, panFor, roomFor, detuneRate, type RoomSize } from './mix';
import { heartbeat, impulse, noiseBuffer, playRecipe, type Voice } from './recipes';

type AudioCtor = typeof AudioContext;

export interface HeardSound {
  pulse: Pulse;
  /** Path distance to the player. */
  dist: number;
  gain: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private reverbIn!: GainNode;
  private wet: Record<RoomSize, GainNode> = {} as Record<RoomSize, GainNode>;
  private noise!: AudioBuffer;
  private room: RoomSize | null = null;
  private nextBeat = 0;
  private waterfalls: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; tile: number }[] = [];
  private waterfallGame: Game | null = null;
  private droneNodes: AudioNode[] = [];
  private droneGain: GainNode | null = null;
  private volume = 0.8;
  private muted = false;

  /** Create/resume the context. Must run inside a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(comp);
    this.reverbIn = ctx.createGain();
    const sizes: [RoomSize, number, number][] = [['small', 0.45, 3], ['medium', 1.3, 2.4], ['large', 2.8, 2]];
    for (const [name, secs, decay] of sizes) {
      const conv = ctx.createConvolver();
      conv.buffer = impulse(ctx, secs, decay);
      const g = ctx.createGain();
      g.gain.value = 0;
      this.reverbIn.connect(conv);
      conv.connect(g);
      g.connect(comp);
      this.wet[name] = g;
    }
    this.noise = noiseBuffer(ctx);
    this.setRoom('medium');
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    const v = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private setRoom(room: RoomSize): void {
    if (!this.ctx || room === this.room) return;
    this.room = room;
    const t = this.ctx.currentTime;
    const level: Record<RoomSize, number> = { small: 0.18, medium: 0.32, large: 0.5 };
    for (const k of Object.keys(this.wet) as RoomSize[]) {
      this.wet[k].gain.setTargetAtTime(k === room ? level[k] : 0, t, 0.25); // crossfade
    }
  }

  /** One-shot positioned voice routed to dry + reverb. */
  private voice(gain: number, pan: number, rate = 1, cents = 0, delay = 0): Voice | null {
    if (!this.ctx || gain <= 0.003) return null;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    p.connect(send);
    send.connect(this.reverbIn);
    // Let the graph be collected after the sound ends.
    setTimeout(() => { try { p.disconnect(); send.disconnect(); } catch { /* ignore */ } }, 4000 + delay * 1000);
    return { ctx, out: g, t: ctx.currentTime + 0.005 + delay, rate, cents, noise: this.noise };
  }

  /** Path distance from the player to a pulse source (Infinity if out of earshot). */
  static distance(game: Game, p: Pulse): number {
    const pt = tileAt(game.level, game.player.x, game.player.y);
    return Math.min(p.field.dist[pt], game.pathFromPlayer(p.tile));
  }

  /** Play the sounds in this frame's events. Returns the ones the player could hear (captions). */
  handle(game: Game, events: GameEvent[]): HeardSound[] {
    const heard: HeardSound[] = [];
    for (const e of events) {
      if (e.type !== 'sound') continue;
      const p = e.pulse;
      if (p.owner === 'attract') continue;
      const own = p.owner === 'player';
      const dist = own ? 0 : AudioEngine.distance(game, p);
      const gain = gainFor(p.kind, p.radius, dist);
      if (gain <= 0.003) continue;
      heard.push({ pulse: p, dist, gain });
      const pan = own ? 0 : panFor(p.x - game.player.x);
      const cents = p.fake ? MIMIC_DETUNE_CENTS : 0;
      const v = this.voice(gain, pan, p.fake ? detuneRate(cents) : 1, cents);
      if (v) playRecipe(v, p.kind, p.mat);
    }
    return heard;
  }

  /** Per-frame: heartbeat, reverb room, waterfall noise. */
  update(game: Game): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.setRoom(roomFor(game.roomSize));

    if (game.status === 'playing' && game.listeners.length) {
      const d = game.nearestThreat;
      const hg = heartGain(d);
      if (hg > 0 && now >= this.nextBeat) {
        this.nextBeat = now + 60 / heartBpm(d);
        const v = this.voice(hg, 0);
        if (v) heartbeat(v, 1);
      } else if (hg <= 0) {
        this.nextBeat = Math.max(this.nextBeat, now);
      }
    }

    if (this.waterfallGame !== game) this.setupWaterfalls(game);
    for (const w of this.waterfalls) {
      const f = game.fields.get(w.tile, 24);
      const pt = tileAt(game.level, game.player.x, game.player.y);
      const d = f.dist[pt];
      const g = Number.isFinite(d) ? 0.5 * Math.pow(Math.max(0, 1 - d / 22), 1.4) : 0;
      w.gain.gain.setTargetAtTime(game.status === 'playing' ? g : 0, now, 0.15);
      w.pan.pan.setTargetAtTime(panFor((w.tile % game.level.w) + 0.5 - game.player.x), now, 0.15);
    }
  }

  private setupWaterfalls(game: Game): void {
    this.stopWorld();
    this.waterfallGame = game;
    if (!this.ctx || game.attract) return;
    for (const tile of game.level.waterfalls) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(lp).connect(gain).connect(pan).connect(this.dry);
      src.start();
      this.waterfalls.push({ src, gain, pan, tile });
    }
  }

  /** Silence looping world sounds (leaving a level). */
  stopWorld(): void {
    for (const w of this.waterfalls) {
      try { w.src.stop(); w.pan.disconnect(); } catch { /* ignore */ }
    }
    this.waterfalls = [];
    this.waterfallGame = null;
  }

  /** Quiet drone for the title and results screens only (no music during play). */
  drone(on: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (on && !this.droneGain) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 2);
      g.connect(this.dry);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      lp.connect(g);
      const send = ctx.createGain();
      send.gain.value = 0.8;
      lp.connect(send).connect(this.reverbIn);
      const nodes: AudioNode[] = [g, lp, send];
      for (const [f, type] of [[55, 'sine'], [82.4, 'sine'], [110.6, 'triangle']] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = type === 'triangle' ? 0.25 : 0.5;
        o.connect(og).connect(lp);
        o.start();
        nodes.push(o, og);
      }
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoG.gain.value = 220;
      lfo.connect(lfoG).connect(lp.frequency);
      lfo.start();
      nodes.push(lfo, lfoG);
      this.droneNodes = nodes;
      this.droneGain = g;
    } else if (!on && this.droneGain) {
      const g = this.droneGain;
      const nodes = this.droneNodes;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.3);
      this.droneGain = null;
      this.droneNodes = [];
      setTimeout(() => {
        for (const n of nodes) {
          try { if (n instanceof OscillatorNode) n.stop(); n.disconnect(); } catch { /* ignore */ }
        }
      }, 2000);
    }
  }
}
