/** What the player wants to do this tick, independent of the input device. */
export interface Actions {
  /** Movement, each axis −1..1 (analog sticks can be partial). */
  moveX: number;
  moveY: number;
  sneak: boolean;
  click: boolean;
  clap: boolean;
  cane: boolean;
  hand: boolean;
  /** Throw a stone at this world point (tiles). */
  throwAt: { x: number; y: number } | null;
  /** Throw a stone full range in this direction (gamepad). */
  throwDir: { x: number; y: number } | null;
}

export function noActions(): Actions {
  return {
    moveX: 0, moveY: 0, sneak: false, click: false, clap: false, cane: false, hand: false,
    throwAt: null, throwDir: null,
  };
}
