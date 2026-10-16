import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, localOnly } from './security.ts'

function appWith(dashboardUrl = 'http://127.0.0.1:4546') {
  const app = express()
  app.use(localOnly(dashboardUrl))
  app.all('/ping', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('localOnly', () => {
  it('lets the local dashboard and tools without an Origin through', async () => {
    const app = appWith()
    expect((await request(app).get('/ping')).status).toBe(200)
    expect((await request(app).post('/ping')).status).toBe(200)
    expect((await request(app).post('/ping').set('Origin', 'http://localhost:4546')).status).toBe(200)
    expect((await request(app).put('/ping').set('Origin', 'http://127.0.0.1:4746')).status).toBe(200)
  })

  it('rejects a Host that is not loopback (DNS rebinding)', async () => {
    const app = appWith()
    const res = await request(app).get('/ping').set('Host', 'rebind.example.com:4545')
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('rebind.example.com')
  })

  it('rejects a cross-site Origin on state-changing methods, including the null origin of a sandbox', async () => {
    const app = appWith()
    for (const origin of ['https://evil.example', 'http://localhost.evil.example:4546', 'null']) {
      for (const method of ['post', 'put', 'delete'] as const) {
        expect((await request(app)[method]('/ping').set('Origin', origin)).status).toBe(403)
      }
    }
  })

  it('allows the host of a custom DASHBOARD_URL', async () => {
    const app = appWith('https://review.internal.test:8443')
    expect((await request(app).post('/ping').set('Origin', 'https://review.internal.test:8443').set('Host', 'review.internal.test')).status).toBe(200)
    expect((await request(app).post('/ping').set('Origin', 'https://other.test')).status).toBe(403)
  })
})

describe('contentSecurityPolicy', () => {
  it('sandboxes every served file and cuts scripts, styles and requests out of SVG, HTML and XML', () => {
    expect(contentSecurityPolicy('image/png')).toBe('sandbox')
    expect(contentSecurityPolicy('video/webm')).toBe('sandbox')
    expect(contentSecurityPolicy('text/plain; charset=utf-8')).toBe('sandbox')
    for (const type of ['image/svg+xml', 'text/html; charset=utf-8', 'application/xhtml+xml', 'text/xml']) {
      expect(contentSecurityPolicy(type)).toContain("default-src 'none'")
      expect(contentSecurityPolicy(type)).toContain('sandbox')
    }
  })
})
