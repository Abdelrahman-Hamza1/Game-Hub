// Route share codes: the route JSON, deflated and base64url-encoded, so it fits
// in a link: https://<user>.github.io/short-rope/?route=<code>

import { validRoute } from '../sim/routes'
import type { Route } from '../sim/types'

function toB64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encodeRoute(r: Route): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(r))
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')))
  }
  return 'j' + toB64url(json)
}

export async function decodeRoute(code: string): Promise<Route | null> {
  try {
    const kind = code[0]
    const bytes = fromB64url(code.slice(1))
    const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
    const obj = JSON.parse(new TextDecoder().decode(raw))
    return validRoute(obj) ? obj : null
  } catch {
    return null
  }
}

export function baseUrl(): string {
  return location.origin + location.pathname
}

export async function routeLink(r: Route): Promise<string> {
  return `${baseUrl()}?route=${await encodeRoute(r)}`
}
