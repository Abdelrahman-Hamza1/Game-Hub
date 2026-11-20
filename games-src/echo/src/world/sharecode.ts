/**
 * Share codes: a level (grid + meta) packed into a URL-safe string (DESIGN.md decision 20).
 *
 *   code    = "E1." + base64url(payload)            (no padding)
 *   payload = flags u8 · stones u8 · parTime varint
 *             · name length varint · name UTF-8 · hint length varint · hint UTF-8
 *             · grid tokens · checksum u16 (FNV-1a of everything before it, folded to 16 bits)
 *
 * Grid tokens, rows separated by 0x0A:
 *   0x20–0x7E  a literal tile character
 *   0x80–0xFF  repeat the last character of this row (b − 0x7F) more times (1…128)
 *   0x01 n     copy n characters (varint) from the row above, same columns
 *
 * Synchronous, deterministic and free of browser-only APIs, so it runs in Node tests. Characters
 * that aren't in the legend are encoded as rock walls ('#'), which is how `parseLevel` reads them.
 */
import { LEGEND, normalizeMeta, splitRows, type LevelMeta } from './level';
import { MAX_LEVEL_H, MAX_LEVEL_W } from '../game/constants';

export interface SharedLevel {
  text: string;
  meta: LevelMeta;
}

export const SHARE_PREFIX = 'E1.';
/** Longest code `decodeShare` accepts (characters after the prefix). */
export const MAX_SHARE_CODE = 20_000;

const NEWLINE = 0x0a;
const COPY_ABOVE = 0x01;
const REPEAT = 0x80;
const MAX_REPEAT = 128;
const FLAG_CHASE = 1;
/** UTF-8 byte budget for name/hint: normalizeMeta caps them at 60/200 UTF-16 units (≤ 3 bytes each). */
const MAX_NAME_BYTES = 60 * 3;
const MAX_HINT_BYTES = 200 * 3;
const MAX_PAR = 1_000_000_000;

// ---------- bytes ----------

class Writer {
  private bytes: number[] = [];
  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  varint(v: number): void {
    let n = Math.max(0, Math.floor(v));
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
  }
  raw(b: Uint8Array): void {
    for (const x of b) this.bytes.push(x);
  }
  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Thrown internally on malformed input; `decodeShare` turns it into null. */
class Malformed extends Error {}

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array, private readonly end: number) {}
  get left(): number {
    return this.end - this.pos;
  }
  u8(): number {
    if (this.pos >= this.end) throw new Malformed('eof');
    return this.b[this.pos++];
  }
  peek(): number {
    return this.pos < this.end ? this.b[this.pos] : -1;
  }
  varint(maxBytes = 5): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < maxBytes; i++) {
      const byte = this.u8();
      v += (byte & 0x7f) * mul;
      if (!(byte & 0x80)) {
        if (i > 0 && byte === 0) throw new Malformed('non-canonical varint');
        return v;
      }
      mul *= 0x80;
    }
    throw new Malformed('varint too long');
  }
  slice(n: number): Uint8Array {
    if (n > this.left) throw new Malformed('eof');
    const s = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
}

function checksum(b: Uint8Array, end: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < end; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ (h >>> 16)) & 0xffff;
}

// ---------- base64url ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INDEX[B64.charCodeAt(i)] = i;

export function toBase64Url(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((b.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** Strict decoder: rejects foreign characters, impossible lengths and non-zero padding bits. */
export function fromBase64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if (bits > 0 && (acc & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

// ---------- encode ----------

function rowCodes(row: string): number[] {
  const codes: number[] = [];
  for (const ch of row) codes.push(LEGEND[ch] ? ch.charCodeAt(0) : 0x23 /* '#' */);
  return codes;
}

export function encodeShare(level: SharedLevel): string {
  const meta = normalizeMeta(level.meta);
  const enc = new TextEncoder();
  const name = enc.encode(meta.name);
  const hint = enc.encode(meta.hint);

  const w = new Writer();
  w.u8(meta.chase ? FLAG_CHASE : 0);
  w.u8(meta.stones);
  w.varint(Math.min(MAX_PAR, meta.parTime));
  w.varint(name.length);
  w.raw(name);
  w.varint(hint.length);
  w.raw(hint);

  const rows = splitRows(level.text).map(rowCodes);
  rows.forEach((row, y) => {
    if (y > 0) w.u8(NEWLINE);
    const above = y > 0 ? rows[y - 1] : null;
    let x = 0;
    while (x < row.length) {
      let same = 1;
      while (x + same < row.length && row[x + same] === row[x]) same++;
      let copy = 0;
      if (above) while (x + copy < row.length && x + copy < above.length && row[x + copy] === above[x + copy]) copy++;
      if (copy >= 3 && copy > same) {
        w.u8(COPY_ABOVE);
        w.varint(copy);
        x += copy;
        continue;
      }
      w.u8(row[x]);
      let rest = same - 1;
      while (rest > 0) {
        const k = Math.min(rest, MAX_REPEAT);
        w.u8(REPEAT + k - 1);
        rest -= k;
      }
      x += same;
    }
  });

  const body = w.done();
  const out = new Uint8Array(body.length + 2);
  out.set(body);
  const sum = checksum(body, body.length);
  out[body.length] = sum >> 8;
  out[body.length + 1] = sum & 0xff;
  return SHARE_PREFIX + toBase64Url(out);
}

// ---------- decode ----------

/** Pull the bare code out of a code, `#level=<code>`, `level=<code>` or a full URL. */
function extractCode(input: string): string | null {
  let s = input.trim();
  try {
    if (s.includes('%')) s = decodeURIComponent(s);
  } catch {
    /* keep it as typed */
  }
  const at = s.lastIndexOf('level=');
  if (at >= 0) s = s.slice(at + 'level='.length).split(/[&\s]/)[0];
  if (!s.startsWith(SHARE_PREFIX)) return null;
  return s.slice(SHARE_PREFIX.length);
}

function decodeUtf8(b: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    throw new Malformed('bad utf-8');
  }
}

export function decodeShare(code: string): SharedLevel | null {
  try {
    if (typeof code !== 'string' || code.length > MAX_SHARE_CODE + 4096) return null;
    const body = extractCode(code);
    if (body === null || body.length === 0 || body.length > MAX_SHARE_CODE) return null;
    const bytes = fromBase64Url(body);
    if (!bytes || bytes.length < 3) return null;
    const end = bytes.length - 2;
    if (checksum(bytes, end) !== ((bytes[end] << 8) | bytes[end + 1])) return null;

    const r = new Reader(bytes, end);
    const flags = r.u8();
    if (flags & ~FLAG_CHASE) return null;
    const stones = r.u8();
    const parTime = r.varint();
    const nameLen = r.varint(2);
    if (nameLen > MAX_NAME_BYTES) return null;
    const name = decodeUtf8(r.slice(nameLen));
    const hintLen = r.varint(2);
    if (hintLen > MAX_HINT_BYTES) return null;
    const hint = decodeUtf8(r.slice(hintLen));

    const rows: string[] = [];
    let row: number[] = [];
    const finishRow = () => {
      rows.push(String.fromCharCode(...row));
      if (rows.length > MAX_LEVEL_H) throw new Malformed('too tall');
      row = [];
    };
    const push = (c: number) => {
      row.push(c);
      if (row.length > MAX_LEVEL_W) throw new Malformed('too wide');
    };
    while (r.left > 0) {
      const t = r.u8();
      if (t === NEWLINE) {
        finishRow();
      } else if (t === COPY_ABOVE) {
        const above = rows[rows.length - 1];
        const n = r.varint(2);
        if (!above || n < 1 || row.length + n > above.length) return null;
        for (let k = 0; k < n; k++) push(above.charCodeAt(row.length));
      } else if (t >= REPEAT) {
        if (!row.length) return null;
        const c = row[row.length - 1];
        for (let k = t - REPEAT + 1; k > 0; k--) push(c);
      } else if (t >= 0x20 && t <= 0x7e && LEGEND[String.fromCharCode(t)]) {
        push(t);
      } else {
        return null;
      }
    }
    finishRow();
    if (rows.length === 0 || rows.every((x) => x.length === 0)) return null;

    const meta = normalizeMeta({ name, stones, hint, parTime, ...(flags & FLAG_CHASE ? { chase: true } : {}) });
    return { text: rows.join('\n'), meta };
  } catch {
    return null;
  }
}
