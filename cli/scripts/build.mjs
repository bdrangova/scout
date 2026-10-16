// Bundles the CLI into a single ESM file. Runtime dependencies stay external (they are
// installed next to the bundle); the workspace package @review-dash/shared is inlined.
// The skill and hook templates are copied next to the bundle so `install` finds them from any cwd.
import { chmod, cp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const outfile = path.join(root, 'dist', 'index.js')

await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  external: Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@review-dash/')),
  legalComments: 'none',
  logLevel: 'info',
})
await chmod(outfile, 0o755)

const templatesOut = path.join(root, 'dist', 'templates')
await rm(templatesOut, { recursive: true, force: true })
await cp(path.join(root, 'templates'), templatesOut, { recursive: true })
