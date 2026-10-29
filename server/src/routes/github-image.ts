import { execFile } from 'node:child_process'
import { isGithubImageUrl } from '@scout/shared'
import { Router } from 'express'
import { badRequest } from '../errors.ts'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 4
const CACHE_SIZE = 64
const TOKEN_TTL_MS = 10 * 60 * 1000

export interface GithubImageDeps {
  fetch: typeof fetch
  /** The signed-in `gh` user's token, or null when gh is missing or signed out (public images still load). */
  token: () => Promise<string | null>
}

let cachedToken: { value: string | null; at: number } | null = null

function ghToken(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedToken.at < TOKEN_TTL_MS) return Promise.resolve(cachedToken.value)
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5_000 }, (err, out) => {
      const value = err ? null : out.trim() || null
      cachedToken = { value, at: Date.now() }
      resolve(value)
    })
  })
}

const DEFAULT_DEPS: GithubImageDeps = { fetch: (...args) => fetch(...args), token: ghToken }

/**
 * `GET /github-image?url=`: an image from a GitHub comment, fetched by the server. A pasted
 * screenshot on a private repo lives at github.com/user-attachments and only answers a signed-in
 * request, so the token goes to github.com itself and never to where it redirects (signed S3 links).
 * Only GitHub image hosts, only image responses, cached in memory since the signed links expire.
 */
export function githubImageRouter(deps: GithubImageDeps = DEFAULT_DEPS): Router {
  const router = Router()
  const cache = new Map<string, { type: string; body: Buffer }>()

  router.get('/github-image', async (req, res) => {
    const url = typeof req.query.url === 'string' ? req.query.url : undefined
    if (!url || !isGithubImageUrl(url)) throw badRequest('url must be an https image on a GitHub host')
    let image = cache.get(url) ?? null
    if (!image) {
      image = await fetchImage(url, deps)
      if (!image) {
        res.status(502).type('text/plain').send('could not load the image from GitHub')
        return
      }
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string)
      cache.set(url, image)
    }
    res
      .set('Content-Security-Policy', 'sandbox')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Cache-Control', 'private, max-age=3600')
      .type(image.type)
      .send(image.body)
  })
  return router
}

async function fetchImage(url: string, deps: GithubImageDeps): Promise<{ type: string; body: Buffer } | null> {
  let current = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = { Accept: 'image/*' }
    if (current.hostname === 'github.com') {
      const token = await deps.token()
      if (token) headers.Authorization = `token ${token}`
    }
    let res: Response
    try {
      res = await deps.fetch(current, { headers, redirect: 'manual' })
    } catch {
      return null
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      const next = location ? URL.parse(location, current.href) : null
      if (!next || next.protocol !== 'https:') return null
      current = next
      continue
    }
    const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!res.ok || !type.startsWith('image/')) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null
    const body = Buffer.from(await res.arrayBuffer())
    return body.length > MAX_BYTES ? null : { type, body }
  }
  return null
}
