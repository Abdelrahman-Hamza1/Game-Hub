/** The Watchmaker rewinds the room every few seconds, unless all his escapement levers are held. */
import { HZ } from '../constants';
import { triggerActive } from '../objects/triggers';
import type { World } from '../world';

export function watchmakerCheck(w: World): void {
  const wm = w.lv.watchmaker;
  if (!wm) return;
  const every = Math.round(wm.every * HZ);
  if (w.t === 0 || w.t % every !== 0) return;
  const held = wm.levers.every((l) => {
    const g = w.lv.triggers.findIndex((t) => t.letter === l);
    return g >= 0 && triggerActive(w, g);
  });
  if (held) return;
  w.rewound = true;
  const cx = w.lv.w / 2;
  w.fail({ by: 'watchmaker', index: 0, actor: -1, t: w.t, x0: cx, y0: 1, x1: cx, y1: 1 });
}
