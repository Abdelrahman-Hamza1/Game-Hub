/**
 * Share codes: a level's text and JSON, deflated and base64url-encoded, so a whole level fits in a
 * link: `…/games/ten-seconds/#level=<code>`. Codes start with a version letter: "z" (deflate-raw)
 * or "p" (plain, when the browser has no CompressionStream).
 */
import type { LevelJson } from '../sim/level';

export interface SharedLevel {
  text: string;
  json: LevelJson;
}

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64 = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeLevel(l: SharedLevel): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify({ t: l.text, j: l.json }));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toB64(await pipe(raw, new CompressionStream('deflate-raw')));
    } catch {
      /* fall through to plain */
    }
  }
  return 'p' + toB64(raw);
}

export async function decodeLevel(code: string): Promise<SharedLevel | null> {
  try {
    const kind = code[0];
    let bytes = fromB64(code.slice(1));
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') return null;
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (kind !== 'p') return null;
    const o = JSON.parse(new TextDecoder().decode(bytes)) as { t?: unknown; j?: unknown };
    if (typeof o.t !== 'string' || !o.j || typeof o.j !== 'object') return null;
    if (o.t.length > 64 * 41) return null;
    return { text: o.t, json: o.j as LevelJson };
  } catch {
    return null;
  }
}
