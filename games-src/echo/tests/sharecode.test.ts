import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { LEGEND, normalizeMeta, splitRows, validateLevel, type LevelMeta } from '../src/world/level';
import { decodeShare, encodeShare, fromBase64Url, toBase64Url } from '../src/world/sharecode';

const URL_SAFE = /^E1\.[A-Za-z0-9_-]+$/;

function roundTrip(text: string, meta: LevelMeta) {
  const code = encodeShare({ text, meta });
  const back = decodeShare(code);
  expect(back).not.toBeNull();
  expect(splitRows(back!.text)).toEqual(splitRows(text));
  expect(back!.meta).toEqual(normalizeMeta(meta));
  return code;
}

/** A small valid level that uses every legend character. */
function everyTileLevel(): string {
  const chars = Object.keys(LEGEND).filter((c) => c !== '#' && c !== 'S' && c !== 'E' && c !== 'H' && c !== '=');
  const w = chars.length + 4;
  const rows = [
    '#'.repeat(w),
    '#S.' + chars.join('') + '#',
    '#.' + '.'.repeat(chars.length) + 'E#',
    '#.' + '='.repeat(4) + 'H' + '='.repeat(4) + '.'.repeat(chars.length - 9) + '.#',
    '#' + 'XK'.repeat((w - 2) / 2) + (w % 2 ? 'X' : '') + '#',
    '#'.repeat(w),
  ];
  return rows.join('\n');
}

describe('share codes', () => {
  it('round-trips every bundled level', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
    for (const entry of LEVELS) {
      const code = roundTrip(entry.text, entry.meta);
      expect(code).toMatch(URL_SAFE);
    }
  });

  it('codes for real levels are much shorter than the raw text', () => {
    let rawTotal = 0;
    let codeTotal = 0;
    for (const entry of LEVELS) {
      const raw = splitRows(entry.text).join('\n') + JSON.stringify(entry.meta);
      const code = encodeShare({ text: entry.text, meta: entry.meta });
      expect(code.length).toBeLessThan(raw.length * 0.75);
      rawTotal += raw.length;
      codeTotal += code.length;
    }
    expect(codeTotal).toBeLessThan(rawTotal * 0.55);
  });

  it('round-trips a level using every legend character', () => {
    const text = everyTileLevel();
    for (const ch of Object.keys(LEGEND)) expect(text).toContain(ch);
    expect(splitRows(text).every((r) => r.length === splitRows(text)[0].length)).toBe(true);
    roundTrip(text, { name: 'All tiles', stones: 7, hint: 'Everything at once', parTime: 42, chase: true });
  });

  it('keeps unicode names and hints intact', () => {
    const meta: LevelMeta = { name: 'Grotte 洞窟 🦇 Échos', stones: 2, hint: 'Ссылка — «тише» 🤫', parTime: 75 };
    const code = roundTrip(LEVELS[0].text, meta);
    expect(code).toMatch(URL_SAFE);
    expect(decodeShare(code)!.meta.name).toBe('Grotte 洞窟 🦇 Échos');
  });

  it('normalises meta on the way in and out', () => {
    const code = encodeShare({ text: LEVELS[0].text, meta: { name: '  ', stones: 99, hint: '', parTime: 1.4 } });
    expect(decodeShare(code)!.meta).toEqual(normalizeMeta({ name: '', stones: 20, hint: '', parTime: 5 }));
  });

  it('round-trips large, ragged and blank-row grids within the cap', () => {
    const big = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 96 }, (_, x) => '#.WGMTXK'[(x * 7 + y * 3 + ((x * y) % 5)) % 8]).join(''),
    ).join('\n');
    roundTrip(big, normalizeMeta({}));
    roundTrip('#####\n#S.E#\n\n###\n#####', normalizeMeta({}));
  });

  it('decoded levels still validate like the originals', () => {
    for (const entry of LEVELS) {
      const back = decodeShare(encodeShare({ text: entry.text, meta: entry.meta }))!;
      expect(validateLevel(back.text)).toEqual(validateLevel(entry.text));
    }
  });

  it('accepts a bare code, a #level= hash and a full URL', () => {
    const code = encodeShare({ text: LEVELS[0].text, meta: LEVELS[0].meta });
    const want = decodeShare(code);
    expect(want).not.toBeNull();
    expect(decodeShare(`#level=${code}`)).toEqual(want);
    expect(decodeShare(`level=${code}`)).toEqual(want);
    expect(decodeShare(`https://example.com/games/echo/#level=${code}`)).toEqual(want);
    expect(decodeShare(`  https://example.com/games/echo/?x=1#level=${code}&other=2 \n`)).toEqual(want);
    expect(decodeShare(`https://example.com/games/echo/#level=${encodeURIComponent(code)}`)).toEqual(want);
  });

  it('returns null for garbage, truncated and tampered input', () => {
    const code = encodeShare({ text: LEVELS[0].text, meta: LEVELS[0].meta });
    const bad: string[] = [
      '',
      'E1.',
      'E1',
      'hello world',
      '#level=',
      'E2.' + code.slice(3),
      code.slice(3),
      'E1.!!!!',
      'E1.' + 'A'.repeat(50),
      'E1.' + '_'.repeat(400),
      'E1.' + 'A'.repeat(25_000),
      code + 'é',
      code.slice(0, code.length - 1),
      code.slice(0, code.length - 5),
      code.slice(0, Math.floor(code.length / 2)),
      code.slice(0, 10),
      code + 'AA',
    ];
    // Flip characters in the middle and near both ends.
    for (const pos of [3, 4, 8, 20, Math.floor(code.length / 2), code.length - 3, code.length - 1]) {
      const c = code[pos];
      const swap = c === 'A' ? 'B' : 'A';
      bad.push(code.slice(0, pos) + swap + code.slice(pos + 1));
    }
    for (const s of bad) expect(decodeShare(s), s.slice(0, 40)).toBeNull();
    // Never throws, even on non-strings smuggled in at runtime.
    expect(decodeShare(undefined as unknown as string)).toBeNull();
    expect(decodeShare(42 as unknown as string)).toBeNull();
  });

  it('rejects well-formed payloads that break the limits', () => {
    // A grid wider than 96 tiles, encoded by hand with a valid checksum, must be refused.
    const wide = encodeShare({ text: '#'.repeat(97) + '\n' + '#'.repeat(97), meta: normalizeMeta({}) });
    expect(decodeShare(wide)).toBeNull();
    const tall = encodeShare({ text: Array.from({ length: 65 }, () => '###').join('\n'), meta: normalizeMeta({}) });
    expect(decodeShare(tall)).toBeNull();
    const ok = encodeShare({ text: Array.from({ length: 64 }, () => '#'.repeat(96)).join('\n'), meta: normalizeMeta({}) });
    expect(decodeShare(ok)).not.toBeNull();
  });

  it('base64url helpers round-trip and are strict', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 0xff);
      const s = toBase64Url(b);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64Url(s)!)).toEqual(Array.from(b));
    }
    expect(fromBase64Url('A')).toBeNull();
    expect(fromBase64Url('AB')).toBeNull(); // non-zero padding bits
    expect(fromBase64Url('A=')).toBeNull();
  });
});
