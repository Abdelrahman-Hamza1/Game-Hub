/**
 * "Sorbet": flat pastel colour, no outlines, no texture. Each world tints the sky and ground; the
 * objects keep one colour everywhere so they read the same in every world.
 */
export const INK = '#3d3d5c';
export const INK_SOFT = '#5c5c7a';
export const PAPER = '#ffffff';

export const PLAYER = ['#ff6b6b', '#4d96ff', '#2ec4a6', '#ffc43d'];
/** player colours dark enough for text on white */
export const PLAYER_TEXT = ['#e0474f', '#3d6fd6', '#1f8a74', '#a87800'];

export const OBJ = {
  block: '#ffb26b',
  blockShade: '#f29a4d',
  crate: '#e0a067',
  crateShade: '#c8854c',
  switch: '#ff7a7a',
  switchOff: '#e9b3b3',
  key: '#ffb703',
  lift: '#4d96ff',
  mover: '#8a7fd6',
  pan: '#8a7fd6',
  spring: '#2ec4a6',
  springShade: '#1f9e85',
  spike: '#8c8ca3',
  door: '#ffffff',
  doorInside: '#3d3d5c',
  flag: '#2ec4a6',
  flagOff: '#c4c4d4',
  plank: '#e0a067',
};

export interface WorldLook {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundTop: string;
  /** far shapes in the background */
  hill: string;
  /** clouds / stars */
  deco: 'clouds' | 'stars' | 'gears' | 'bunting' | 'chimneys' | 'leaves';
  night: boolean;
}

export const LOOKS: Record<number, WorldLook> = {
  1: { skyTop: '#ffeadf', skyBottom: '#ffd9e2', ground: '#8fd3bf', groundTop: '#b8e8da', hill: '#ffe2dc', deco: 'clouds', night: false },
  2: { skyTop: '#fff1dc', skyBottom: '#ffe1cc', ground: '#c9b8a6', groundTop: '#ddd0c2', hill: '#ffe9d6', deco: 'gears', night: false },
  3: { skyTop: '#e3f0ff', skyBottom: '#ffe3ea', ground: '#9fb3d1', groundTop: '#c3d2e8', hill: '#ecdff0', deco: 'chimneys', night: false },
  4: { skyTop: '#fde7f3', skyBottom: '#fff0d9', ground: '#c7a8e6', groundTop: '#dcc7f0', hill: '#ffe1ef', deco: 'bunting', night: false },
  5: { skyTop: '#272a5c', skyBottom: '#45468c', ground: '#6c68c8', groundTop: '#9894e8', hill: '#33366f', deco: 'stars', night: true },
  6: { skyTop: '#fff3d6', skyBottom: '#ffe2c2', ground: '#d4b483', groundTop: '#e8cfa6', hill: '#ffead0', deco: 'gears', night: false },
};

export const lookFor = (world: number): WorldLook => LOOKS[world] ?? LOOKS[1];
