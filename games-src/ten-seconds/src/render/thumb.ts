/** A tiny blueprint of a level for menus (walls, doors, exit, target). Cached per level. */
import { Tile, type Level } from '../sim/level';

const cache = new Map<string, string>();

export function levelThumb(lv: Level, locked = false): string {
  const key = `${lv.id}:${lv.text.length}:${locked}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 4;
  const cv = document.createElement('canvas');
  cv.width = lv.w * s;
  cv.height = lv.h * s;
  const g = cv.getContext('2d');
  if (!g) return '';
  g.fillStyle = '#0b1a30';
  g.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const t = lv.tiles[y * lv.w + x];
      let c = '';
      if (t === Tile.Wall || t === Tile.Emitter) c = locked ? '#2a3a55' : '#7f97b8';
      else if (t === Tile.Door) c = locked ? '#3a3a55' : '#ff4d5e';
      else if (t === Tile.Window) c = '#8fd3ff';
      else if (t === Tile.Low) c = '#4a6488';
      else if (lv.exitAt[y * lv.w + x] && !locked) c = '#2f8a5f';
      if (c) {
        g.fillStyle = c;
        g.fillRect(x * s, y * s, s, s);
      }
    }
  }
  if (!locked) {
    const t = lv.items.find((i) => i.kind === 'target');
    if (t) {
      g.fillStyle = '#ffc24b';
      g.fillRect(t.x * s - 1, t.y * s - 1, s + 2, s + 2);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(lv.start[0] * s, lv.start[1] * s, s, s);
    g.fillStyle = '#ff4d5e';
    for (const gd of [...lv.guards, ...lv.auditors]) g.fillRect(gd.x * s, gd.y * s, s, s);
  }
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
