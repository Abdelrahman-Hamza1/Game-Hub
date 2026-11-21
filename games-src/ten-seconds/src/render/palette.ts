/** Heist blueprint at night (DESIGN.md "Look, feel, audio"). */
export const C = {
  bg: '#091526',
  grid: 'rgba(120, 165, 230, 0.07)',
  gridMajor: 'rgba(120, 165, 230, 0.13)',
  wall: '#D7E6F7',
  wallFill: '#102440',
  hatch: 'rgba(215, 230, 247, 0.10)',
  doorClosed: '#FF4D5E',
  doorOpen: '#5BE49B',
  plate: '#FFC24B',
  lure: '#FF7EB6',
  target: '#FFC24B',
  exit: '#5BE49B',
  glass: '#8FD3FF',
  threat: '#FF4D5E',
  cone: 'rgba(255, 77, 94, 0.17)',
  coneEdge: 'rgba(255, 77, 94, 0.45)',
  camCone: 'rgba(255, 110, 120, 0.13)',
  player: '#FFFFFF',
  ink: '#E8F0FB',
  muted: '#8FA3C0',
  card: '#7BDFF2',
  mirror: '#C9D6E8',
  coin: '#FFD36B',
  crate: '#3B5E8C',
  stone: '#B388FF',
  laser: '#FF3B5C',
};

/** Copy colours, lane 1–6 (then they repeat). */
export const COPY = ['#4CC9F0', '#B388FF', '#FFC24B', '#5BE49B', '#FF7EB6', '#7BDFF2'];

export const copyColor = (lane: number) => COPY[lane % COPY.length];

/** Colour-blind mode adds a shape per lane. */
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon'] as const;
export type Shape = (typeof SHAPES)[number];

export const FONT_TITLE = '"Archivo", "Arial Black", system-ui, sans-serif';
export const FONT_UI = '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
