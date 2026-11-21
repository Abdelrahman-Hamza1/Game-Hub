// Not part of the app's tsconfig (it runs in Node); Vite compiles it with esbuild.
import { defineConfig, type Plugin } from 'vitest/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HUB_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

/**
 * In `npm run dev`, also serve the hub's /shared/ SDK, /games.json and room page, so the Game Night
 * bar shows up exactly as it does on the real site.
 */
function hubFiles(): Plugin {
  return {
    name: 'game-night-hub-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/shared/') && url !== '/games.json') return next()
        const file = resolve(HUB_ROOT, '.' + url)
        if (!file.startsWith(HUB_ROOT) || !existsSync(file)) return next()
        res.setHeader('Content-Type', url.endsWith('.json') ? 'application/json' : 'text/javascript')
        res.end(readFileSync(file))
      })
    },
  }
}

// Builds into the Game Night hub's games/short-rope/ folder.
// base: './' keeps every asset path relative, so the game works from any sub-path.
export default defineConfig({
  base: './',
  plugins: [hubFiles()],
  build: {
    outDir: '../../games/short-rope',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { port: 5174 },
  test: { environment: 'node' },
})
