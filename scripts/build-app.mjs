// Builds the stable copy the background service runs: the server bundled into one file with all its
// dependencies, plus the built web app. It is written next to the target and swapped in at the end, so a
// failed build leaves the running copy alone, and edits to the source never reach it until the next build.
// Usage: node scripts/build-app.mjs [<target dir>]   (default: $SCOUT_HOME/app, i.e. ~/.scout/app)
import { execFileSync } from 'node:child_process'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = process.env.SCOUT_HOME?.replace(/^~(?=\/|$)/, os.homedir()) ?? path.join(os.homedir(), '.scout')
const target = path.resolve(process.argv[2] ?? path.join(home, 'app'))
const next = `${target}.next`

await rm(next, { recursive: true, force: true })
await mkdir(next, { recursive: true })

await build({
  entryPoints: [path.join(root, 'server', 'src', 'index.ts')],
  outfile: path.join(next, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Express and its helpers are CommonJS and call require() for Node built-ins.
  banner: { js: "import { createRequire as __scoutRequire } from 'node:module'; const require = __scoutRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
})

execFileSync('npx', ['vite', 'build', '--outDir', path.join(next, 'web'), '--emptyOutDir'], {
  cwd: path.join(root, 'web'),
  stdio: ['ignore', 'inherit', 'inherit'],
})

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== ''
await writeFile(
  path.join(next, 'build.json'),
  `${JSON.stringify({ source: root, commit, dirty, builtAt: new Date().toISOString() }, null, 2)}\n`,
)

await rm(`${target}.prev`, { recursive: true, force: true })
await rename(target, `${target}.prev`).catch((err) => {
  if (err.code !== 'ENOENT') throw err
})
await rename(next, target)
console.log(`built ${target} from ${commit}${dirty ? ' (with uncommitted changes)' : ''}`)
