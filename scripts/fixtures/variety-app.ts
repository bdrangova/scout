// "variety-app": a repo whose uncommitted change set has at least two files of every type the
// dashboard distinguishes (.ts .tsx .js .jsx .yaml/.yml .json .css .md) plus a binary .png, in every
// status (added, modified, deleted, renamed with edits, untracked), one >2000-line diff (collapsed:
// too-many-changed-lines, the large-file gate) and a regenerated lockfile (collapsed: generated).
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { git, reposDir, writeFiles } from './common.ts'
import { lockfile } from './trial-app.ts'

export const VARIETY_BRANCH = 'feature/comments-on-posts'

/** `src/data/countries.ts`: ~2,100 generated lines so the diff trips COLLAPSE_CHANGED_LINES (1,500). */
function countriesTable(): string {
  const lines = ['// Generated from the ISO 3166 export; see scripts/build.js.', 'export interface Country {', '  code: string', '  name: string', '  dial: string', '}', '', 'export const COUNTRIES: readonly Country[] = [']
  for (let i = 0; i < 2100; i += 1) {
    const code = String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26)) + String(i % 10)
    lines.push(`  { code: '${code}', name: 'Region ${String(i + 1).padStart(4, '0')}', dial: '+${100 + (i % 900)}' },`)
  }
  lines.push(']', '')
  return lines.join('\n')
}

const DATES_TS = `export function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return \`\${minutes} min ago\`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return \`\${hours} h ago\`
  return \`\${Math.round(hours / 24)} d ago\`
}
`

const TOOLBAR_JSX = `import React from 'react'

export function Toolbar({ onRefresh, onExport }) {
  return (
    <div className="toolbar">
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
      <button type="button" onClick={onExport}>
        Export
      </button>
    </div>
  )
}
`

const VARIETY_BASE_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify(
    {
      name: 'variety-app',
      version: '2.3.0',
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'node scripts/build.js', test: 'vitest run', release: 'node scripts/release.js' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { typescript: '^5.9.0', vitest: '^4.0.0' },
    },
    null,
    2,
  )}\n`,
  'package-lock.json': lockfile([]),
  'tsconfig.json': `${JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', noEmit: true }, include: ['src'] }, null, 2)}\n`,
  'README.md': `# variety-app

A small social feed: posts, users and (soon) comments.

## Scripts

- \`npm run dev\` starts Vite.
- \`npm run build\` bundles with \`scripts/build.js\`.
- \`npm run release\` tags and publishes.
`,
  'CONTRIBUTING.md': `# Contributing

1. Branch from \`master\`.
2. Keep pull requests small.
3. Run \`npm test\` before pushing.
`,
  'docs/setup.md': `# Setup

Install Node 22, run \`npm install\`, then \`npm run dev\`. The API is mocked under \`src/api/\`.
`,
  'src/index.ts': `import { renderFeed } from './components/UserCard'
import { listPosts } from './api/posts'
import { listUsers } from './api/users'

export async function main(root: HTMLElement): Promise<void> {
  const [users, posts] = await Promise.all([listUsers(), listPosts()])
  root.replaceChildren(renderFeed(users, posts))
}
`,
  'src/api/users.ts': `export interface User {
  id: string
  name: string
  avatarUrl: string | null
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch('/api/users')
  if (!response.ok) throw new Error(\`users: \${response.status}\`)
  return (await response.json()) as User[]
}
`,
  'src/api/posts.ts': `export interface Post {
  id: string
  authorId: string
  body: string
  createdAt: string
}

export async function listPosts(): Promise<Post[]> {
  const response = await fetch('/api/posts')
  if (!response.ok) throw new Error(\`posts: \${response.status}\`)
  return (await response.json()) as Post[]
}
`,
  'src/utils/dates.ts': DATES_TS,
  'src/components/Avatar.tsx': `import type { User } from '../api/users'

export function renderAvatar(user: User): HTMLElement {
  const img = document.createElement('img')
  img.className = 'avatar'
  img.alt = user.name
  img.src = user.avatarUrl ?? '/assets/logo.png'
  return img
}
`,
  'src/components/UserCard.tsx': `import type { Post } from '../api/posts'
import type { User } from '../api/users'
import { renderAvatar } from './Avatar'

export function renderFeed(users: User[], posts: Post[]): HTMLElement {
  const list = document.createElement('ul')
  list.className = 'feed'
  for (const post of posts) {
    const author = users.find((u) => u.id === post.authorId)
    const item = document.createElement('li')
    if (author) item.append(renderAvatar(author))
    const body = document.createElement('p')
    body.textContent = post.body
    item.append(body)
    list.append(item)
  }
  return list
}
`,
  'src/components/Legacy.tsx': `/** @deprecated the old table view; replaced by the feed. */
export function renderLegacyTable(rows: string[][]): HTMLElement {
  const table = document.createElement('table')
  for (const row of rows) {
    const tr = document.createElement('tr')
    for (const cell of row) {
      const td = document.createElement('td')
      td.textContent = cell
      tr.append(td)
    }
    table.append(tr)
  }
  return table
}
`,
  'src/legacy/widget.jsx': `import React from 'react'

export function Widget({ title, children }) {
  return (
    <section className="widget">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
`,
  'src/legacy/Toolbar.jsx': TOOLBAR_JSX,
  'scripts/build.js': `import { build } from 'vite'

await build({ root: process.cwd(), build: { outDir: 'dist', sourcemap: true } })
console.log('built')
`,
  'scripts/release.js': `import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
execSync(\`git tag v\${version}\`, { stdio: 'inherit' })
console.log(\`tagged v\${version}\`)
`,
  '.github/workflows/ci.yml': `name: ci
on:
  push:
    branches: [master]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
`,
  'config/app.yaml': `app:
  name: variety-app
  feed:
    pageSize: 20
    refreshSeconds: 30
`,
  'config/db.yml': `development:
  adapter: sqlite
  database: dev.sqlite3
test:
  adapter: sqlite
  database: ':memory:'
`,
  'config/features.json': `${JSON.stringify({ comments: false, reactions: false, darkMode: true }, null, 2)}\n`,
  'src/styles/base.css': `:root { --fg: #1f2933; --bg: #fff; --muted: #6b7280; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--fg); background: var(--bg); }
.feed { list-style: none; padding: 0; margin: 0; }
.feed li { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.avatar { width: 32px; height: 32px; border-radius: 50%; }
`,
  'src/styles/theme.css': `.theme-dark { --fg: #e5e7eb; --bg: #111827; --muted: #9ca3af; }
`,
  'src/styles/old.css': `.legacy-table { border-collapse: collapse; }
.legacy-table td { border: 1px solid #ccc; padding: 4px 8px; }
`,
}

const COMMENTS_TS = `export interface Comment {
  id: string
  postId: string
  authorId: string
  body: string
  createdAt: string
}

export async function listComments(postId: string): Promise<Comment[]> {
  const response = await fetch(\`/api/posts/\${encodeURIComponent(postId)}/comments\`)
  if (!response.ok) throw new Error(\`comments: \${response.status}\`)
  return (await response.json()) as Comment[]
}

export async function addComment(postId: string, body: string): Promise<Comment> {
  const response = await fetch(\`/api/posts/\${encodeURIComponent(postId)}/comments\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(\`comments: \${response.status}\`)
  return (await response.json()) as Comment
}
`

const VARIETY_BRANCH_FILES: Record<string, string> = {
  // .ts — modified ×2, added ×2 (one huge), renamed below
  'src/index.ts': VARIETY_BASE_FILES['src/index.ts']!.replace(
    "import { listUsers } from './api/users'\n",
    "import { listUsers } from './api/users'\nimport { listComments } from './api/comments'\n",
  ).replace(
    '  root.replaceChildren(renderFeed(users, posts))\n',
    "  const comments = await Promise.all(posts.map((post) => listComments(post.id)))\n  root.replaceChildren(renderFeed(users, posts, comments.flat()))\n",
  ),
  'src/api/users.ts': VARIETY_BASE_FILES['src/api/users.ts']!.replace(
    '  avatarUrl: string | null\n}',
    '  avatarUrl: string | null\n  /** ISO 3166 alpha-2; drives the dial code shown next to the name. */\n  country: string | null\n}',
  ),
  'src/api/comments.ts': COMMENTS_TS,
  'src/data/countries.ts': countriesTable(),
  'src/utils/time.ts': `${DATES_TS}
export function formatDialCode(dial: string): string {
  return dial.startsWith('+') ? dial : \`+\${dial}\`
}
`,
  // .tsx — modified, added (Legacy.tsx deleted below)
  'src/components/Avatar.tsx': VARIETY_BASE_FILES['src/components/Avatar.tsx']!.replace(
    "  img.src = user.avatarUrl ?? '/assets/logo.png'\n",
    "  img.src = user.avatarUrl ?? '/assets/logo.png'\n  img.loading = 'lazy'\n  img.width = 32\n  img.height = 32\n",
  ),
  'src/components/CommentList.tsx': `import type { Comment } from '../api/comments'
import { formatRelative } from '../utils/time'

export function renderComments(comments: Comment[]): HTMLElement {
  const list = document.createElement('ol')
  list.className = 'comments'
  for (const comment of comments) {
    const item = document.createElement('li')
    const body = document.createElement('p')
    body.textContent = comment.body
    const when = document.createElement('time')
    when.dateTime = comment.createdAt
    when.textContent = formatRelative(new Date(comment.createdAt))
    item.append(body, when)
    list.append(item)
  }
  return list
}
`,
  'src/components/UserCard.tsx': VARIETY_BASE_FILES['src/components/UserCard.tsx']!.replace(
    "import { renderAvatar } from './Avatar'\n",
    "import type { Comment } from '../api/comments'\nimport { renderAvatar } from './Avatar'\nimport { renderComments } from './CommentList'\n",
  )
    .replace('renderFeed(users: User[], posts: Post[])', 'renderFeed(users: User[], posts: Post[], comments: Comment[] = [])')
    .replace('    item.append(body)\n', '    item.append(body)\n    item.append(renderComments(comments.filter((c) => c.postId === post.id)))\n'),
  // .js — modified, added
  'scripts/build.js': `import { build } from 'vite'

const sourcemap = process.env.CI ? false : true
await build({ root: process.cwd(), build: { outDir: 'dist', sourcemap, target: 'es2022' } })
console.log(sourcemap ? 'built with source maps' : 'built')
`,
  'scripts/lint-staged.js': `import { execSync } from 'node:child_process'

const files = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\\n')
  .filter((f) => /\\.(ts|tsx|js|jsx)$/.test(f))
if (files.length > 0) execSync(\`npx eslint \${files.join(' ')}\`, { stdio: 'inherit' })
`,
  // .jsx — modified, renamed with edits below
  'src/legacy/widget.jsx': VARIETY_BASE_FILES['src/legacy/widget.jsx']!.replace('export function Widget({ title, children }) {', 'export function Widget({ title, children, collapsed = false }) {').replace(
    '      {children}\n',
    '      {collapsed ? null : children}\n',
  ),
  'src/legacy/Toolbar.legacy.jsx': `${TOOLBAR_JSX.replace("import React from 'react'\n", "import React from 'react'\n\n/** @deprecated kept for the admin page until it moves to the feed toolbar. */")}`,
  // .yaml / .yml — modified, added
  '.github/workflows/ci.yml': VARIETY_BASE_FILES['.github/workflows/ci.yml']!.replace('      - run: npm test\n', '      - run: npm test\n      - run: node scripts/lint-staged.js\n        if: github.event_name == \'pull_request\'\n'),
  'config/cache.yaml': `cache:
  comments:
    ttlSeconds: 60
    maxEntries: 5000
  users:
    ttlSeconds: 300
`,
  // .json — modified ×3 (lockfile collapsed), added
  'package.json': VARIETY_BASE_FILES['package.json']!.replace('"react-dom": "^19.0.0"', '"react-dom": "^19.0.0",\n    "tiny-cache": "^2.1.0"'),
  'package-lock.json': lockfile(['tiny-cache']),
  'config/features.json': `${JSON.stringify({ comments: true, reactions: false, darkMode: true, lazyAvatars: true }, null, 2)}\n`,
  '.prettierrc.json': `${JSON.stringify({ semi: false, singleQuote: true, printWidth: 120 }, null, 2)}\n`,
  // .css — modified, added (old.css deleted below)
  'src/styles/base.css': `${VARIETY_BASE_FILES['src/styles/base.css']!}.feed li p { margin: 0; flex: 1; }
`,
  'src/styles/comments.css': `.comments { list-style: none; margin: 8px 0 0; padding: 0 0 0 44px; }
.comments li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); }
.comments time { white-space: nowrap; }
`,
  // .md — modified, added as untracked below (CONTRIBUTING.md deleted below)
  'README.md': `${VARIETY_BASE_FILES['README.md']!}
## Comments

Comments load per post from \`/api/posts/:id/comments\` and render under the post body. See \`docs/comments.md\`.
`,
}

const UNTRACKED_DOC = `# Comments

Each post can carry comments. They are fetched lazily per post and cached for a minute (\`config/cache.yaml\`).

- \`src/api/comments.ts\`: list and add.
- \`src/components/CommentList.tsx\`: rendering with relative timestamps.
`

/**
 * `variety-app`: base commit on `master`, pushed to the bare `variety-app-origin.git`, branch
 * `feature/comments-on-posts` with the change set in the working tree: renames and deletes staged,
 * most edits staged, `README.md` and `config/features.json` edited after staging, `docs/comments.md`
 * untracked, `assets/logo.png` replaced by another image (binary modified).
 */
export async function buildVarietyRepo(repo: string, origin: string, images: { before: string; after: string }): Promise<void> {
  await mkdir(repo, { recursive: true })
  await git(repo, ['init', '-q', '-b', 'master'])
  await writeFiles(repo, VARIETY_BASE_FILES)
  await mkdir(path.join(repo, 'assets'), { recursive: true })
  await writeFiles(repo, { 'assets/logo.png': await readFile(images.before) })
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'Feed with users and posts'])

  await git(reposDir, ['init', '-q', '--bare', origin])
  await git(repo, ['remote', 'add', 'origin', origin])
  await git(repo, ['push', '-q', '-u', 'origin', 'master'])
  await git(repo, ['remote', 'set-head', 'origin', 'master'])

  await git(repo, ['checkout', '-q', '-b', VARIETY_BRANCH])
  await git(repo, ['mv', 'src/utils/dates.ts', 'src/utils/time.ts'])
  await git(repo, ['mv', 'src/legacy/Toolbar.jsx', 'src/legacy/Toolbar.legacy.jsx'])
  await git(repo, ['rm', '-q', 'src/components/Legacy.tsx', 'src/styles/old.css', 'CONTRIBUTING.md'])
  const lateEdits = new Set(['README.md', 'config/features.json'])
  await writeFiles(repo, Object.fromEntries(Object.entries(VARIETY_BRANCH_FILES).filter(([rel]) => !lateEdits.has(rel))))
  await writeFiles(repo, { 'assets/logo.png': await readFile(images.after) })
  await git(repo, ['add', '-A'])
  await writeFiles(repo, Object.fromEntries(Object.entries(VARIETY_BRANCH_FILES).filter(([rel]) => lateEdits.has(rel))))
  await writeFiles(repo, { 'docs/comments.md': UNTRACKED_DOC })
}
