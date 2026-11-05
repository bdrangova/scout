import os from 'node:os'
import path from 'node:path'
import { DASHBOARD_HOST, DEFAULT_SERVER_PORT, DEFAULT_WEB_PORT } from '@scout/shared'

export interface Config {
  /** TCP port, from `SCOUT_PORT` (default 4545). The generic `PORT` is ignored on purpose: the desktop browser-preview harness injects the web port there. */
  port: number
  /** Store root, from `SCOUT_HOME` (default `~/.scout`), absolute. */
  home: string
  /** Origin of the web app, from `DASHBOARD_URL` (default `http://scout.localhost:4546`), used in the sent markdown. */
  dashboardUrl: string
  /** Built web app to serve next to the API, from `SCOUT_WEB_DIR` (absolute), else null (Vite serves it). */
  webDir: string | null
}

export const DEFAULT_DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DEFAULT_WEB_PORT}`

function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_SERVER_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`SCOUT_PORT must be an integer between 0 and 65535, got "${raw}"`)
  }
  return port
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.SCOUT_PORT),
    home: path.resolve(expandHome(env.SCOUT_HOME ?? '~/.scout')),
    dashboardUrl: (env.DASHBOARD_URL ?? DEFAULT_DASHBOARD_URL).replace(/\/+$/, ''),
    webDir: env.SCOUT_WEB_DIR ? path.resolve(expandHome(env.SCOUT_WEB_DIR)) : null,
  }
}
