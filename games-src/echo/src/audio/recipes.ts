/** Synthesized sound recipes (brief §6). Each schedules nodes into `out` starting at t. */
import type { SoundKind } from '../sound/pulses';
import { Mat } from '../world/level';

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
  /** Playback-rate multiplier (Mimic copies are detuned). */
  rate: number;
  /** Detune in cents for oscillators. */
  cents: number;
  noise: AudioBuffer;
}

function env(v: Voice, peak: number, attack: number, decay: number, start = 0): GainNode {
  const g = v.ctx.createGain();
  const t = v.t + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(v.out);
  return g;
}

function noise(v: Voice, dest: AudioNode, dur: number, start = 0): AudioBufferSourceNode {
  const s = v.ctx.createBufferSource();
  s.buffer = v.noise;
  s.playbackRate.value = v.rate;
  s.connect(dest);
  const offset = Math.random() * Math.max(0, v.noise.duration - dur - 0.05);
  s.start(v.t + start, offset, dur + 0.05);
  return s;
}

function filter(v: Voice, type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq * v.rate;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

function osc(v: Voice, type: OscillatorType, freq: number, dest: AudioNode, dur: number, start = 0, endFreq?: number): OscillatorNode {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, v.t + start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, v.t + start + dur);
  o.detune.value = v.cents;
  o.connect(dest);
  o.start(v.t + start);
  o.stop(v.t + start + dur + 0.05);
  return o;
}

function thump(v: Voice, peak: number, freq: number, dur: number): void {
  const g = env(v, peak, 0.004, dur);
  noise(v, filter(v, 'lowpass', freq * 2, 0.7, filter(v, 'bandpass', freq, 1.2, g)), dur);
}

function ring(v: Voice, peak: number, freqs: number[], dur: number, start = 0): void {
  freqs.forEach((f, i) => {
    const g = env(v, peak / (i + 1.3), 0.002, dur * (1 - i * 0.15), start);
    osc(v, 'triangle', f, g, dur, start);
  });
}

function clicks(v: Voice, n: number, spread: number, peak: number, freq: number): void {
  for (let i = 0; i < n; i++) {
    const start = Math.random() * spread;
    const g = env(v, peak * (0.5 + Math.random() * 0.5), 0.001, 0.012, start);
    noise(v, filter(v, 'highpass', freq, 0.7, g), 0.02, start);
  }
}

export function playRecipe(v: Voice, kind: SoundKind, mat: number): void {
  switch (kind) {
    case 'step':
    case 'sneak': {
      const soft = kind === 'sneak' ? 0.4 : 1;
      if (mat === Mat.Water) {
        const g = env(v, 0.9 * soft, 0.005, 0.18);
        noise(v, filter(v, 'bandpass', 1200, 1, g), 0.22);
        clicks(v, 3, 0.15, 0.25 * soft, 3000);
      } else if (mat === Mat.Gravel) {
        thump(v, 0.5 * soft, 160, 0.05);
        clicks(v, 6, 0.08, 0.5 * soft, 2500);
      } else if (mat === Mat.Metal) {
        thump(v, 0.5 * soft, 170, 0.05);
        ring(v, 0.25 * soft, [520, 1240, 2130], 0.4);
      } else {
        thump(v, soft, kind === 'sneak' ? 120 : 150, 0.05);
      }
      break;
    }
    case 'click': {
      const g = env(v, 0.8, 0.001, 0.015);
      osc(v, 'sine', 3000, g, 0.02);
      noise(v, filter(v, 'highpass', 2500, 0.8, env(v, 0.4, 0.001, 0.01)), 0.015);
      break;
    }
    case 'clap': {
      noise(v, filter(v, 'bandpass', 1500, 0.9, env(v, 1, 0.001, 0.035)), 0.06);
      osc(v, 'sine', 2400, env(v, 0.25, 0.002, 0.06), 0.07);
      break;
    }
    case 'stone': {
      osc(v, 'sine', 110, env(v, 0.9, 0.003, 0.09), 0.1, 0, 60);
      thump(v, 0.6, 200, 0.06);
      for (let i = 0; i < 3; i++) {
        const s = 0.07 + i * 0.06 + Math.random() * 0.02;
        noise(v, filter(v, 'bandpass', 2200, 4, env(v, 0.35 / (i + 1), 0.001, 0.02, s)), 0.03, s);
      }
      if (mat === Mat.Water) noise(v, filter(v, 'bandpass', 1000, 1, env(v, 0.6, 0.005, 0.25)), 0.3);
      break;
    }
    case 'cane': {
      noise(v, filter(v, 'bandpass', 2500, 8, env(v, 0.8, 0.001, 0.02)), 0.03);
      osc(v, 'sine', 900, env(v, 0.25, 0.001, 0.02), 0.03);
      break;
    }
    case 'wind': {
      const g = env(v, 0.5, 0.6, 1.4);
      const f = filter(v, 'bandpass', 500, 0.7, g);
      f.frequency.setValueAtTime(380 * v.rate, v.t);
      f.frequency.linearRampToValueAtTime(700 * v.rate, v.t + 0.8);
      noise(v, f, 2.1);
      break;
    }
    case 'drip': {
      osc(v, 'sine', 1800, env(v, 0.6, 0.002, 0.09), 0.1, 0, 900);
      break;
    }
    case 'growl': {
      const g = env(v, 0.8, 0.05, 0.45);
      const lp = filter(v, 'lowpass', 400, 2, g);
      const lfo = v.ctx.createOscillator();
      const lfoGain = v.ctx.createGain();
      lfo.frequency.value = 9;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start(v.t);
      lfo.stop(v.t + 0.55);
      osc(v, 'sawtooth', 55, lp, 0.5);
      osc(v, 'sawtooth', 58.5, lp, 0.5);
      break;
    }
    case 'breath': {
      const g = env(v, 0.25, 0.35, 0.5);
      noise(v, filter(v, 'lowpass', 800, 0.5, g), 0.9);
      break;
    }
    case 'call': {
      // "Hello?!" — a rising then falling voice-like tone through a formant.
      const g = env(v, 0.7, 0.03, 0.4);
      const bp = filter(v, 'bandpass', 900, 2, g);
      const o = osc(v, 'sawtooth', 330, bp, 0.42);
      o.frequency.linearRampToValueAtTime(420, v.t + 0.12);
      o.frequency.linearRampToValueAtTime(300, v.t + 0.4);
      osc(v, 'sine', 660, env(v, 0.2, 0.03, 0.35), 0.4);
      break;
    }
    case 'swarm': {
      for (let i = 0; i < 26; i++) {
        const s = Math.random() * 0.9;
        const f = 4000 + Math.random() * 3000;
        osc(v, 'sine', f, env(v, 0.18, 0.002, 0.03, s), 0.04, s, f * 1.3);
      }
      noise(v, filter(v, 'highpass', 3000, 0.7, env(v, 0.2, 0.05, 0.9)), 1);
      break;
    }
    case 'rumble': {
      noise(v, filter(v, 'lowpass', 140, 1, env(v, 0.8, 0.03, 0.38)), 0.42);
      clicks(v, 3, 0.35, 0.25, 3500);
      break;
    }
    case 'crash': {
      noise(v, filter(v, 'lowpass', 900, 0.7, env(v, 1, 0.002, 0.6)), 0.7);
      ring(v, 0.45, [210, 517, 893, 1460], 1.2);
      thump(v, 1, 80, 0.2);
      break;
    }
  }
}

/** Two low sine thumps: lub-dub. */
export function heartbeat(v: Voice, peak: number): void {
  osc(v, 'sine', 62, env(v, peak, 0.01, 0.12), 0.14, 0, 45);
  osc(v, 'sine', 55, env(v, peak * 0.7, 0.01, 0.12, 0.17), 0.14, 0.17, 40);
}

/** Decaying noise impulse response for a ConvolverNode. */
export function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
