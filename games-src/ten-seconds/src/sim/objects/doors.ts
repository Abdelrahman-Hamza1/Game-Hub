/** Door rules. Doors open and close instantly; a crate in the doorway jams a door open. */
import { CARD_RANGE, CRATE_HALF, HZ } from '../constants';
import type { DoorDef } from '../level';
import { unstick } from '../actors';
import { triggerActive } from './triggers';
import type { World } from '../world';

export function doorWanted(w: World, d: DoorDef): boolean {
  const wired = () => d.wireIdx;
  let open = false;
  switch (d.rule) {
    case 'plate':
    case 'button':
      open = wired().some((g) => triggerActive(w, g));
      break;
    case 'switch':
      open = wired().reduce((acc, g) => acc !== triggerActive(w, g), false);
      break;
    case 'inverted':
      open = !wired().some((g) => triggerActive(w, g));
      break;
    case 'card':
      open = w.items.some((it) => {
        if (it.kind !== 'card' || it.carrier < 0) return false;
        return d.tiles.some(([tx, ty]) => Math.hypot(tx + 0.5 - it.x, ty + 0.5 - it.y) <= CARD_RANGE);
      });
      break;
    case 'timer':
      open = w.t >= d.open[0] * HZ && w.t < d.open[1] * HZ;
      break;
    case 'cycle': {
      const p = d.period * HZ;
      const k = (((w.t - d.phase * HZ) % p) + p) % p;
      open = k < d.openFor * HZ;
      break;
    }
  }
  return d.invert ? !open : open;
}

export function updateDoors(w: World, init: boolean): void {
  const lv = w.lv;
  for (let i = 0; i < lv.doors.length; i++) {
    const d = lv.doors[i];
    let open = doorWanted(w, d);
    const was = w.doorOpen[i];
    if (!open && was && !init && jammed(w, d)) open = true;
    w.doorOpen[i] = open;
    if (!init && open !== was) {
      const [tx, ty] = d.tiles[0];
      w.emit('door', -1, tx + 0.5, ty + 0.5, i, open ? 1 : 0);
      if (!open && w.live) unstick(w, w.live);
    }
  }
}

function jammed(w: World, d: DoorDef): boolean {
  return w.crates.some((c) =>
    d.tiles.some(([tx, ty]) => Math.abs(c.x - (tx + 0.5)) < 0.5 + CRATE_HALF - 0.05 && Math.abs(c.y - (ty + 0.5)) < 0.5 + CRATE_HALF - 0.05),
  );
}
