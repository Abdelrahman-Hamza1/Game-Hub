/** Every number from the brief, in one place. Distances are in tiles, times in seconds. */

export const TILE_PX = 16;
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

// ---- Sound propagation ----
export const RING_SPEED = 16;            // tiles per second
export const RING_END_PAD = 3;           // pulse ends when r > radius + 3
export const WALL_BAND = 1.1;            // |r − wallDist| < 1.1 lights a wall
export const WALL_REACH_PAD = 0.5;       // wallDist ≤ radius + 0.5
export const FLOOR_BAND = 0.55;          // |r − field| < 0.55 draws a floor dot
export const FLOOR_ALPHA = 0.35;
export const WALL_ORTHO_COST = 0.5;
export const WALL_DIAG_COST = 0.7;
export const DIAG = Math.SQRT2;          // 1.414…
export const ENTITY_BAND = 1.1;          // a ring passing an entity reveals it

// ---- Player ----
export const PLAYER_SPEED = 3.4;
export const SNEAK_SPEED = 1.5;
export const PLAYER_RADIUS = 0.28;
export const STEP_EVERY = 0.9;
export const SNEAK_STEP_EVERY = 0.7;
export const STEP_RADIUS = 4;
export const SNEAK_STEP_RADIUS = 1.2;

export const CLICK_RADIUS = 6;
export const CLICK_HEAR = 3;
export const CLICK_CONE_DEG = 70;
export const CLICK_COOLDOWN = 0.4;

export const CLAP_RADIUS = 12;
export const CLAP_COOLDOWN = 0.7;

export const STONE_RANGE = 10;
export const STONE_SPEED = 14;
export const STONE_RADIUS = 9;
export const STONE_MIN_RANGE = 1.5;
export const STONE_MAX_CARRY = 5;

export const CANE_RADIUS = 2;
export const CANE_HEAR = 1;
export const CANE_CONE_DEG = 100;
export const CANE_COOLDOWN = 0.3;

export const HAND_REACH = 1.2;
export const HAND_GRACE = 0.5;           // clap/throw drops the hand this long

// ---- Ambient ----
export const WIND_RADIUS = 6;
export const WIND_EVERY = 4;
export const DRIP_RADIUS = 5;
export const DRIP_EVERY = 2.6;
export const WATERFALL_ZONE = 8;
export const WATERFALL_MASK_HEAR = 2;    // player sounds inside the zone reach only 2 tiles

// ---- Listener ----
export const LISTENER_PATROL_SPEED = 1.1;
export const LISTENER_HUNT_SPEED = 3.1;
export const LISTENER_PATROL_RANGE = 7;
export const LISTENER_PATROL_REPICK = 6;
export const LISTENER_SEARCH_TIME = 2.2;
export const LISTENER_SEARCH_SPEED = 1.1;
export const LISTENER_GROWL_MIN = 5;
export const LISTENER_GROWL_MAX = 9;
export const LISTENER_GROWL_RADIUS = 6;
export const LISTENER_CATCH = 0.75;

// ---- Swarm ----
export const SWARM_TRIGGER_RADIUS = 9;
export const SWARM_ALARM_RADIUS = 14;
export const SWARM_FLIGHT_TIME = 3;
export const SWARM_RESETTLE = 12;
export const SWARM_COUNT = 60;

// ---- Mimic ----
export const MIMIC_DELAY_MIN = 1;
export const MIMIC_DELAY_MAX = 2;
export const MIMIC_HEAR_CLAP = 12;
export const MIMIC_HEAR_CLICK = 6;
export const MIMIC_DETUNE_CENTS = -30;

// ---- Tourists ----
export const TOURIST_BREATH_RADIUS = 2;
export const TOURIST_BREATH_EVERY = 3;
export const TOURIST_PANIC_AFTER = 2;
export const TOURIST_CALL_RADIUS = 8;
export const TOURIST_CALL_EVERY = 2;
export const TOURIST_FOLLOW_GAP = 1;

// ---- Minecart ----
export const CART_SPEED = 6;
export const CART_RUMBLE_RADIUS = 8;
export const CART_RUMBLE_EVERY = 0.4;
export const CART_CRASH_RADIUS = 18;
export const CART_REACH = 1.3;

// ---- Flow ----
export const FAIL_PAUSE = 1;             // "Heard." shows this long, then retry
export const MAX_LEVEL_W = 96;
export const MAX_LEVEL_H = 64;
