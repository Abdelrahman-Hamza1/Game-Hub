/** Plates and levers are pressed while a body or crate stands on them; buttons time out. */
import { PLATE_MARGIN } from '../constants';
import type { World } from '../world';
import { tileDX } from '../train';

export function updateTriggers(w: World, init: boolean): void {
  const lv = w.lv;
  for (let g = 0; g < lv.triggers.length; g++) {
    const def = lv.triggers[g];
    if (def.type !== 'plate' && def.type !== 'lever') continue;
    let pressed = false;
    for (const [tx, ty] of def.tiles) {
      const ox = w.offs.length ? tileDX(w, tx, ty) : 0;
      const x0 = tx + ox - PLATE_MARGIN;
      const x1 = tx + ox + 1 + PLATE_MARGIN;
      const y0 = ty - PLATE_MARGIN;
      const y1 = ty + 1 + PLATE_MARGIN;
      for (const a of w.actors) {
        if (a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1) {
          pressed = true;
          break;
        }
      }
      if (!pressed) {
        for (const c of w.crates) {
          if (c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1) {
            pressed = true;
            break;
          }
        }
      }
      if (pressed) break;
    }
    const st = w.triggers[g];
    if (!init && pressed !== st.pressed) {
      const [tx, ty] = def.tiles[0];
      w.emit('plate', -1, tx + 0.5, ty + 0.5, g, pressed ? 1 : 0);
    }
    st.pressed = pressed;
  }
}

/** Is this trigger active right now? Plates/levers pressed, switches on, buttons running. */
export function triggerActive(w: World, g: number): boolean {
  const def = w.lv.triggers[g];
  const st = w.triggers[g];
  switch (def.type) {
    case 'plate':
    case 'lever':
      return st.pressed;
    case 'switch':
      return st.on;
    case 'button':
      return w.t < st.until;
    default:
      return false;
  }
}
