/** A random cave (cellular automaton) for the title screen's live echo background. */
import { Rng } from '../engine/rng';

export function generateCave(w: number, h: number, seed: number): string {
  const rng = new Rng(seed);
  let g: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    g.push([]);
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      g[y].push(edge || rng.next() < 0.45);
    }
  }
  for (let step = 0; step < 5; step++) {
    const n: boolean[][] = [];
    for (let y = 0; y < h; y++) {
      n.push([]);
      for (let x = 0; x < w; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { n[y].push(true); continue; }
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy][x + dx]) walls++;
        n[y].push(walls >= 5);
      }
    }
    g = n;
  }
  return g.map((row) => row.map((wall) => (wall ? '#' : '.')).join('')).join('\n');
}
