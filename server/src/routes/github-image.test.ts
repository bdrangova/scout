import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '../errors.ts'
import { githubImageRouter, type GithubImageDeps } from './github-image.ts'

const ATTACHMENT = 'https://github.com/user-attachments/assets/abc'
const SIGNED = 'https://github-production-user-asset.s3.amazonaws.com/1/abc.png?X-Amz-Signature=x'

function appWith(deps: GithubImageDeps) {
  const app = express()
  app.use('/api', githubImageRouter(deps))
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof HttpError ? err.status : 500).end()
  })
  return app
}

function png() {
  return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } })
}

describe('GET /api/github-image', () => {
  it('fetches a private attachment signed in, and follows the redirect without the token', async () => {
    const fetchMock = vi.fn(async (url: URL | string) => (String(url) === ATTACHMENT ? new Response(null, { status: 302, headers: { location: SIGNED } }) : png()))
    const app = appWith({ fetch: fetchMock as typeof fetch, token: async () => 'tok' })
    const res = await request(app).get(`/api/github-image?url=${encodeURIComponent(ATTACHMENT)}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['content-security-policy']).toBe('sandbox')
    const calls = fetchMock.mock.calls as unknown as [URL, RequestInit][]
    expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe('token tok')
    expect(String(calls[1]?.[0])).toBe(SIGNED)
    expect((calls[1]?.[1].headers as Record<string, string>).Authorization).toBeUndefined()
    // Cached: a second request does not go out again.
    await request(app).get(`/api/github-image?url=${encodeURIComponent(ATTACHMENT)}`)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refuses hosts other than GitHub and non-image responses', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    const app = appWith({ fetch: fetchMock as typeof fetch, token: async () => null })
    expect((await request(app).get(`/api/github-image?url=${encodeURIComponent('https://tracker.example/a.png')}`)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await request(app).get(`/api/github-image?url=${encodeURIComponent(ATTACHMENT)}`)).status).toBe(502)
  })
})
