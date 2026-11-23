/**
 * Every number the levels are designed against (DESIGN.md "Movement numbers"). Units are tiles and
 * seconds; y grows downward. Tests in tests/physics.test.ts hold the stack table and gap rules to
 * these values, so change them only together with the levels.
 */
export const HZ = 60;
export const DT = 1 / HZ;

export const PLAYER_W = 0.9;
export const PLAYER_H = 0.9;
export const CRATE_SIZE = 0.9;

export const GRAVITY = 60;
export const FALL_CAP = 18;
/** feet rise this far above where they left the ground */
export const JUMP_APEX = 2.5;
/**
 * The launch speed whose apex, stepped the way the world steps (speed first, then position, at
 * 60 Hz), is exactly `apex`. The continuous formula sqrt(2 g h) falls about 0.14 tiles short.
 */
export function launchSpeed(apex: number): number {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    let vy = -v;
    let y = 0;
    let top = 0;
    for (let t = 0; t < 600 && vy < 0; t++) {
      vy += GRAVITY / 60;
      y += vy / 60;
      top = Math.min(top, y);
    }
    if (-top < apex) lo = v;
    else hi = v;
  }
  return (lo + hi) / 2;
}
export const JUMP_V = launchSpeed(JUMP_APEX);
/** releasing jump early cuts upward speed to this */
export const JUMP_CUT_V = 6;

export const RUN_SPEED = 6;
export const GROUND_ACCEL = 60;
export const AIR_ACCEL = 35;
export const COYOTE_TICKS = 3;
export const BUFFER_TICKS = 7;

export const PUSH_SPEED = 2.5;

/**
 * A thrown thing peaks this far above where it left the thrower's head: a thrown friend's feet
 * reach 0.9 + 2.9 = 3.8 above the thrower's floor (DESIGN.md "Decisions").
 */
export const THROW_APEX = 2.9;
export const THROW_VX = 7;
export const THROW_VY = launchSpeed(THROW_APEX);
/** how far beside you Grab reaches */
export const GRAB_REACH = 0.35;

export const SPRING_APEX = 5.5;
export const SPRING_V = launchSpeed(SPRING_APEX);

export const LIFT_SPEED = 2;
export const SCALE_SPEED = 3;
export const SCALE_MAX = 3;
export const BRIDGE_RESPAWN_TICKS = 3 * HZ;
export const POP_TICKS = HZ;

/** the normal view, and how far the shared camera may zoom out */
export const VIEW_W = 30;
export const VIEW_H = 17;
export const MAX_ZOOM_OUT = 1.6;

export const EPS = 1e-6;
/** contact tolerance: touching within this counts as standing on / against */
export const TOUCH = 0.02;

export const COLORS = ['#ff6b6b', '#4d96ff', '#2ec4a6', '#ffc43d'] as const;
