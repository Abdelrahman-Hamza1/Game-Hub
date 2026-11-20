/** Events the simulation emits for the renderer, audio and UI to consume. */
import type { Pulse } from '../sound/pulses';

export type GameEvent =
  | { type: 'sound'; pulse: Pulse }
  | { type: 'alert'; x: number; y: number }
  | { type: 'caught'; x: number; y: number }
  | { type: 'fell' }
  | { type: 'won' }
  | { type: 'pickup'; stones: number }
  | { type: 'nostones' }
  | { type: 'hand'; held: boolean }
  | { type: 'delivered'; rescued: number; total: number }
  | { type: 'swarm'; x: number; y: number }
  | { type: 'panic'; x: number; y: number }
  | { type: 'cart'; x: number; y: number }
  | { type: 'message'; text: string }
  | { type: 'shake'; amount: number };
