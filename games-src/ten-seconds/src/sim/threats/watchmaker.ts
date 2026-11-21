/**
 * The Watchmaker rewinds the room every few seconds, unless all his escapement levers are held.
 * His rewind ends the loop early, the way the clock running out does: the recording so far is
 * kept as a copy (which then stands still), so lever holders can be recorded one at a time.
 */
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
  w.status = 'over';
  w.emit('rewound', -1, w.lv.w / 2, 1);
}
