/** Every number from the design, in tiles and ticks (60 ticks per second). */
export const HZ = 60;
export const LOOP_SECONDS = 10;
export const SHORT_LOOP_SECONDS = 5; // after a rewind stone

export const SPEED = 9.4 / HZ; // tiles per tick
export const BODY_R = 0.5; // touch, sight, plates, pickups
export const COLLIDE_R = 0.4; // walls, doors, crates (see DESIGN.md Decisions)
export const PICKUP_R = 0.7;
export const PLATE_MARGIN = 0.2; // an actor's centre within this of a plate tile presses it
export const CRATE_PUSH = 0.4; // fraction of walking speed while pushing
export const CRATE_HALF = 0.45;
export const DROP_COOLDOWN = Math.round(0.75 * HZ);
export const MAX_COPIES = 6;

export const GUARD_SPEED = 4.4 / HZ;
export const GUARD_RUN = 6.3 / HZ;
export const GUARD_WAIT = 6 * HZ;
export const GUARD_TURN = 7 / HZ; // rad per tick
export const GUARD_SWEEP = (20 * Math.PI) / 180;
export const CONE_LEN = 9;
export const CONE_HALF = 0.55;
export const NEAR = 1; // anyone this close to a guard (with line of sight) is seen
export const HEARING = 12;

export const CAM_LEN = 10;
export const CAM_HALF = (20 * Math.PI) / 180;
export const SHUTTER_TICKS = 3 * HZ;

export const HOUND_SPEED = 6 / HZ;
export const HOUND_DELAY = 2 * HZ;
export const HOUND_R = 0.45;

export const AUDITOR_WAIT = 3 * HZ;

export const CARD_RANGE = 1.5;
export const COIN_RANGE = 6;
export const COIN_SPEED = 20 / HZ;
export const CROUCH_TICKS = HZ;
export const VAULT_TICKS = 18;
export const WINDOW_REACH = 1.05; // centre distance to a window tile to pass through it
export const LOWWALL_REACH = 1.05;
