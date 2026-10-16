import type { RequestHandler, Response } from 'express'
import type { ApiError } from '@review-dash/shared'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The API controls local repos and starts agent runs, so only the local dashboard may talk to it:
 * every request needs a loopback `Host` (a DNS-rebinding page arrives with its own domain there) and
 * a state-changing one also a loopback `Origin` when the browser sends one (a cross-site form or
 * fetch does; the CLI and curl send none). `dashboardUrl`'s host is allowed too, for a custom `DASHBOARD_URL`.
 */
export function localOnly(dashboardUrl: string): RequestHandler {
  const allowed = new Set(LOOPBACK_HOSTS)
  const dashboardHost = hostnameOf(dashboardUrl)
  if (dashboardHost !== null) allowed.add(dashboardHost)
  const reject = (res: Response, error: string) => {
    const body: ApiError = { error }
    res.status(403).json(body)
  }
  return (req, res, next) => {
    const host = hostnameOf(req.headers.host ?? '')
    if (host === null || !allowed.has(host)) return reject(res, `host ${JSON.stringify(req.headers.host ?? '')} is not allowed`)
    const origin = req.headers.origin
    if (origin !== undefined && !SAFE_METHODS.has(req.method)) {
      const originHost = hostnameOf(origin)
      if (originHost === null || !allowed.has(originHost)) return reject(res, `origin ${JSON.stringify(origin)} is not allowed`)
    }
    next()
  }
}

/** Types a browser runs or styles when opened as a page. */
function canBeActive(contentType: string): boolean {
  return /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml)/i.test(contentType)
}

/**
 * Served files come from repos and agents, and the API shares the dashboard's origin: `sandbox`
 * gives an opened file an opaque origin, and anything that can script (SVG, HTML, XML) also loses
 * network and script access. Images in `<img>` and the sandboxed preview frame are not affected.
 */
export function contentSecurityPolicy(contentType: string): string {
  return canBeActive(contentType) ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" : 'sandbox'
}
