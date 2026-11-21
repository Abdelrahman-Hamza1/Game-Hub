#!/usr/bin/env node
// Build every game in games-src/ into games/<id>/, the folder the site serves.
//
//   node scripts/build-games.mjs            install if needed, then build each game
//   node scripts/build-games.mjs --test     also run each game's tests first
//   node scripts/build-games.mjs --ci       clean install (npm ci) and tests: what the deploy runs
//   node scripts/build-games.mjs echo       only the named game(s)
//
// A game in games-src/<id>/ needs a package.json with "build" (and "test" if it has tests) scripts,
// and its build must write to ../../games/<id>/. The id must also be in games.json.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'games-src')
const args = process.argv.slice(2)
const ci = args.includes('--ci')
const test = ci || args.includes('--test')
const only = args.filter((a) => !a.startsWith('--'))

const listed = new Set(JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8')).map((g) => g.id))
const games = existsSync(SRC)
  ? readdirSync(SRC).filter((id) => existsSync(join(SRC, id, 'package.json')) && (!only.length || only.includes(id)))
  : []
for (const id of only) if (!games.includes(id)) fail(`No game "${id}" in games-src/.`)

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } })

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

for (const id of games) {
  const dir = join(SRC, id)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  console.log(`\n━━ ${id} ━━`)
  if (!listed.has(id)) fail(`${id} is in games-src/ but not in games.json. Add an entry with "id": "${id}".`)
  if (!pkg.scripts?.build) fail(`${id}/package.json has no "build" script.`)

  if (ci) run('npm ci --no-audit --no-fund', dir)
  else if (!existsSync(join(dir, 'node_modules'))) run('npm install --no-audit --no-fund', dir)
  if (test && pkg.scripts.test) run('npm test', dir)
  run('npm run build', dir)

  const out = join(ROOT, 'games', id, 'index.html')
  if (!existsSync(out) || statSync(out).mtimeMs < Date.now() - 10 * 60 * 1000) {
    fail(`${id} didn't build into games/${id}/. Set build.outDir to '../../games/${id}' in its vite.config.ts.`)
  }
}

console.log(`\n✓ Built ${games.length} game${games.length === 1 ? '' : 's'}: ${games.join(', ') || 'none'}`)
