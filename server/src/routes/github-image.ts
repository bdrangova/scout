import { execFile } from 'node:child_process'
import { isGithubAttachmentUrl, isGithubImageRedirect, isGithubImageUrl } from '@scout/shared'
import { Router } from 'express'
import { badRequest } from '../errors.ts'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 4
const CACHE_SIZE = 64
const CACHE_BYTES = 64 * 1024 * 1024
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
 * request, so the token goes to github.com attachment links only and never to where they redirect (signed
 * storage links). Only GitHub image hosts at every hop, only image responses read up to a size cap, cached in
 * memory (by count and bytes) since the signed links expire. Only the dashboard itself may ask: a page on
 * another site cannot use it to probe what the signed-in user can see.
 */
export function githubImageRouter(deps: GithubImageDeps = DEFAULT_DEPS): Router {
  const router = Router()
  const cache = new Map<string, { type: string; body: Buffer }>()
  let cachedBytes = 0

  router.get('/github-image', async (req, res) => {
    // Browsers mark every request with where it came from; the dashboard's own <img> is same-origin (or `none` when opened directly).
    const site = req.get('sec-fetch-site')
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      res.status(403).type('text/plain').send('only the dashboard may load GitHub images')
      return
    }
    const url = typeof req.query.url === 'string' ? req.query.url : undefined
    if (!url || !isGithubImageUrl(url)) throw badRequest('url must be an https image on a GitHub host')
    let image = cache.get(url) ?? null
    if (!image) {
      image = await fetchImage(url, deps)
      if (!image) {
        res.status(502).type('text/plain').send('could not load the image from GitHub')
        return
      }
      while (cache.size > 0 && (cache.size >= CACHE_SIZE || cachedBytes + image.body.length > CACHE_BYTES)) {
        const oldest = cache.keys().next().value as string
        cachedBytes -= cache.get(oldest)?.body.length ?? 0
        cache.delete(oldest)
      }
      cache.set(url, image)
      cachedBytes += image.body.length
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
    if (isGithubAttachmentUrl(current)) {
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
      const target = location ? URL.parse(location, current.href) : null
      const next = target ? isGithubImageRedirect(target.href) : null
      if (!next) return null
      current = next
      continue
    }
    const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!res.ok || !type.startsWith('image/')) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null
    const body = await readCapped(res, MAX_BYTES)
    return body ? { type, body } : null
  }
  return null
}

/** The body, read chunk by chunk and abandoned as soon as it passes `max` bytes (a missing or lying length header cannot make it read more). */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  return Buffer.concat(chunks)
}
