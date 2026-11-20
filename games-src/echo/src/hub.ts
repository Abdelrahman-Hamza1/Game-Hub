/** Optional integration with the Game Night hub's SDK (shared/gamenight.js). */
interface GameNightSdk {
  sound: { readonly on: boolean; onChange(fn: (on: boolean) => void): () => void };
}

declare global {
  interface Window {
    GameNight?: GameNightSdk;
  }
}

/** Is the hub's mute button off (sound allowed)? True when the hub isn't there. */
export function hubSoundOn(): boolean {
  return window.GameNight ? window.GameNight.sound.on : true;
}

export function onHubSoundChange(fn: (on: boolean) => void): void {
  window.GameNight?.sound.onChange(fn);
}
