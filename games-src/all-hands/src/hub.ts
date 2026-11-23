// Optional integration with the Game Night hub's SDK (shared/gamenight.js, loaded by index.html).
// Everything here degrades to "no hub" when the SDK isn't on the page.

export interface HubPlayer {
  id: string
  name: string
  color: string
  host: boolean
}

export interface HubRoom {
  code: string
  me: HubPlayer
  players: HubPlayer[]
  hostId: string
  readonly isHost: boolean
  send(type: string, data: unknown): void
  sendTo(id: string, type: string, data: unknown): void
  sendToHost(type: string, data: unknown): void
  on(type: string, fn: (data: unknown, from: string) => void): () => void
  onPlayers(fn: (players: HubPlayer[]) => void): () => void
  end(result?: string): void
}

interface GameNightSdk {
  id: string
  root: string
  inRoom: boolean
  ready(): Promise<{ meta: unknown; room: HubRoom | null }>
  sound: { readonly on: boolean; onChange(fn: (on: boolean) => void): () => void }
}

declare global {
  interface Window {
    GameNight?: GameNightSdk
  }
}

export const hub = (): GameNightSdk | null => (typeof window !== 'undefined' && window.GameNight) || null

/** Is the hub's mute button off (sound allowed)? True when the hub isn't there. */
export function hubSoundOn(): boolean {
  return hub()?.sound.on ?? true
}

/** Link to host a Game Night room with All Hands already picked. */
export function hostRoomUrl(): string | null {
  const h = hub()
  return h ? `${h.root}room.html?game=${encodeURIComponent(h.id)}` : null
}

/** Game Night room codes: 4 letters or digits (see assets/js/core.js). */
export function joinRoomUrl(code: string): string | null {
  const h = hub()
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return h && c.length === 4 ? `${h.root}room.html?code=${c}` : null
}
