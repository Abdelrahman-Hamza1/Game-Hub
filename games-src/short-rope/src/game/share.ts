// Route share codes: the route JSON, deflated and base64url-encoded, so it fits
// in a link: https://<user>.github.io/short-rope/?route=<code>

import { validRoute, validWall, type Wall } from '../sim/routes'
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

async function encode(obj: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(obj))
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')))
  }
  return 'j' + toB64url(json)
}

async function decode(code: string): Promise<unknown> {
  try {
    const kind = code[0]
    const bytes = fromB64url(code.slice(1))
    const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
    return JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return null
  }
}

export const encodeRoute = (r: Route) => encode(r)
export const encodeWall = (w: Wall) => encode(w)

export async function decodeRoute(code: string): Promise<Route | null> {
  const obj = await decode(code)
  return validRoute(obj) ? obj : null
}

export async function decodeWall(code: string): Promise<Wall | null> {
  const obj = await decode(code)
  return validWall(obj) ? obj : null
}

export function baseUrl(): string {
  return location.origin + location.pathname
}

export async function routeLink(r: Route): Promise<string> {
  return `${baseUrl()}?route=${await encodeRoute(r)}`
}

/** a link to a whole gym wall; it opens with this colour picked */
export async function wallLink(w: Wall, pick = 0): Promise<string> {
  return `${baseUrl()}?wall=${await encodeWall(w)}&pick=${pick}`
}
