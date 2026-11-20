/** Hints and messages are written for keyboard; reword them for touch and gamepad players. */
export type Device = 'keyboard' | 'touch' | 'gamepad';

const RULES: Record<Exclude<Device, 'keyboard'>, [RegExp, string][]> = {
  touch: [
    [/Hold Shift to sneak/g, 'Turn on Sneak'],
    [/\bShift\b/g, 'Sneak'],
    [/clap with Space/g, 'clap with the Clap button'],
    [/\bSpace\b/g, 'Clap'],
    [/Click to throw a stone/g, 'Tap where you want to throw a stone'],
    [/\bPress E\b/g, 'Tap Hand'],
    [/\bpress E\b/g, 'tap Hand'],
    [/Press R to retry now/g, 'Retrying…'],
  ],
  gamepad: [
    [/Hold Shift/g, 'Hold LT'],
    [/\bShift\b/g, 'LT'],
    [/with Space/g, 'with A'],
    [/\bSpace\b/g, 'A'],
    [/Click to throw a stone/g, 'Press RT to throw a stone (aim with the right stick)'],
    [/\bPress E\b/g, 'Press Y'],
    [/\bpress E\b/g, 'press Y'],
    [/Press R to retry now/g, 'Press Select to retry now'],
  ],
};

export function wordFor(text: string, device: Device): string {
  if (device === 'keyboard') return text;
  let out = text;
  for (const [re, rep] of RULES[device]) out = out.replace(re, rep);
  return out;
}
