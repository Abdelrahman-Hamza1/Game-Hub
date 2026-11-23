/**
 * Every kind of level object, in update order. To add one:
 *   1. write src/sim/objects/<kind>.ts exporting `build(lv): Thing[]` (see plate.ts, the simplest)
 *   2. list it here (things that power wires come before gates, which read the power)
 *   3. teach tools/check-levels.mjs its tile and JSON key, and draw it in src/render/things.ts
 */
import type { Level } from '../level';
import type { Thing } from '../types';
import * as plate from './plate';
import * as button from './button';
import * as bridge from './bridge';
import * as scale from './scale';
import * as lift from './lift';
import * as mover from './mover';
import * as gate from './gate';

const KINDS: { build(lv: Level): Thing[] }[] = [plate, button, bridge, scale, lift, mover, gate];

export function buildThings(lv: Level): Thing[] {
  return KINDS.flatMap((k) => k.build(lv));
}
