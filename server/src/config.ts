import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AgentAdapterNameSchema, DASHBOARD_HOST, DEFAULT_SERVER_PORT, DEFAULT_WEB_PORT } from '@scout/shared'
import type { AgentAdapterName } from '@scout/shared'

export interface Config {
  /** TCP port, from `AI_REVIEW_PORT` (default 4545). The generic `PORT` is ignored on purpose: the desktop browser-preview harness injects the web port there. */
  port: number
  /** Store root, from `AI_REVIEW_HOME` (default `~/.ai-review`), absolute. */
  home: string
  /** From `AGENT_ADAPTER` (default `claude-code`). */
  adapter: AgentAdapterName
  /** `AI_REVIEW_CLAUDE_BIN`, else `claude` on PATH, else `~/.local/bin/claude`, else null. */
  claudeBin: string | null
  /** Origin of the web app, from `DASHBOARD_URL` (default `http://scout.localhost:4546`), used in the sent markdown. */
  dashboardUrl: string
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
    throw new Error(`AI_REVIEW_PORT must be an integer between 0 and 65535, got "${raw}"`)
  }
  return port
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

export function resolveClaudeBin(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.AI_REVIEW_CLAUDE_BIN
  if (explicit) return expandHome(explicit)
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (dir === '') continue
    const candidate = path.join(dir, 'claude')
    if (isExecutable(candidate)) return candidate
  }
  const fallback = path.join(os.homedir(), '.local', 'bin', 'claude')
  return isExecutable(fallback) ? fallback : null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const adapter = AgentAdapterNameSchema.safeParse(env.AGENT_ADAPTER ?? 'claude-code')
  if (!adapter.success) {
    throw new Error(
      `AGENT_ADAPTER must be one of ${AgentAdapterNameSchema.options.join(', ')}, got "${env.AGENT_ADAPTER}"`,
    )
  }
  return {
    port: parsePort(env.AI_REVIEW_PORT),
    home: path.resolve(expandHome(env.AI_REVIEW_HOME ?? '~/.ai-review')),
    adapter: adapter.data,
    claudeBin: resolveClaudeBin(env),
    dashboardUrl: (env.DASHBOARD_URL ?? DEFAULT_DASHBOARD_URL).replace(/\/+$/, ''),
  }
}
