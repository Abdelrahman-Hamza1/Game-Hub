/**
 * The players: 12×12 pixel cubes in one colour, two dot eyes, tiny feet. Drawn once per colour and
 * pose into a small canvas, then scaled up with smoothing off so the pixels stay crisp.
 */
const CUBE = [
  '............',
  '..BBBBBBBB..',
  '.BBBBBBBBBB.',
  '.BBBBBBBBBB.',
  '.BBBBBDBBDB.',
  '.BBBBBDBBDB.',
  '.BBBBBBBBBB.',
  '.BBBBBBBBBB.',
  '.SBBBBBBBBB.',
  '.SSBBBBBBBB.',
  '..BBBBBBBB..',
  '..DD....DD..',
];
/** eyes closed (a blink, or a pop) */
const BLINK = CUBE.map((r, y) => (y === 4 ? r.replace(/D/g, 'B') : y === 5 ? r : r));

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

const cache = new Map<string, HTMLCanvasElement>();

export function cubeSprite(color: string, blink: boolean, eyes = '#2b2b3a'): HTMLCanvasElement {
  const key = color + (blink ? 'b' : '') + eyes;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d')!;
  const map = blink ? BLINK : CUBE;
  const fill: Record<string, string> = { B: color, S: shade(color, 0.82), D: eyes };
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const ch = map[y][x];
      if (ch === '.') continue;
      g.fillStyle = fill[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  cache.set(key, c);
  return c;
}

/** Pixel key, 9×6. */
export const KEY_PATH = 'M0 1h3v1h-3zM0 2h1v2h-1zM2 2h1v2h-1zM0 4h3v1h-3zM3 2h6v1h-6zM6 3h1v2h-1zM8 3h1v1h-1z';
let keyPath: Path2D | null = null;
export function keyShape(): Path2D {
  if (!keyPath) keyPath = new Path2D(KEY_PATH);
  return keyPath;
}
