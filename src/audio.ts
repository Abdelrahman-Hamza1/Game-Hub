// Small synthesized sound effects and spoken calls (browser speech synthesis),
// so there are no audio files to ship.

import { CALL_BY_ID } from './sim/constants'

let ctx: AudioContext | null = null
let soundOn = true
let voiceOn = true

export function setAudio(sound: boolean, voice: boolean): void {
  soundOn = sound
  voiceOn = voice
}

/** Browsers only allow audio after a user gesture. */
export function unlockAudio(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      ctx = null
    }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
  if (!ctx || !soundOn) return
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, vol: number, freq: number): void {
  if (!ctx || !soundOn) return
  const t = ctx.currentTime
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(t)
}

export function sfx(type: string): void {
  switch (type) {
    case 'grab':
      noise(0.06, 0.25, 900)
      break
    case 'step':
      noise(0.04, 0.12, 500)
      break
    case 'clip':
      tone(2200, 0.05, 'square', 0.08)
      setTimeout(() => tone(1700, 0.06, 'square', 0.07), 60)
      break
    case 'clipstart':
      noise(0.12, 0.08, 2500)
      break
    case 'clipfail':
    case 'pop':
      tone(300, 0.25, 'sawtooth', 0.08, -180)
      break
    case 'fall':
      noise(0.7, 0.18, 700)
      break
    case 'catch':
      tone(90, 0.3, 'sine', 0.35, -40)
      noise(0.15, 0.2, 300)
      break
    case 'ground':
      tone(60, 0.45, 'sine', 0.5, -30)
      noise(0.3, 0.4, 200)
      break
    case 'top':
      tone(660, 0.12, 'triangle', 0.12)
      setTimeout(() => tone(880, 0.12, 'triangle', 0.12), 120)
      setTimeout(() => tone(1320, 0.25, 'triangle', 0.12), 240)
      break
    case 'chalk':
      noise(0.25, 0.06, 4000)
      break
    case 'unclip':
      tone(1500, 0.08, 'square', 0.1, -900)
      break
  }
}

export function sayCall(id: number, role: 'leader' | 'belayer'): void {
  const call = CALL_BY_ID.get(id)
  if (!call) return
  if (!voiceOn || typeof speechSynthesis === 'undefined') {
    tone(role === 'leader' ? 520 : 390, 0.1, 'triangle', 0.08)
    return
  }
  const u = new SpeechSynthesisUtterance(call.text.replace('!', ''))
  u.rate = 1.15
  u.pitch = role === 'leader' ? 1.1 : 0.85
  u.volume = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}
