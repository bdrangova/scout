// `~/.scout/config.json` `{ port }`: the dashboard writes it at startup so URLs are right.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { DASHBOARD_HOST, DEFAULT_WEB_PORT, type ManifestKind } from '@scout/shared'

export const CONFIG_FILE = 'config.json'

export const RepoConfigSchema = z.object({
  /** Shell command run in a checkout that prints its runtime (`CheckoutRuntimeSchema`) as JSON; see `scout env`. */
  runtime: z.string().min(1).optional(),
})
export type RepoConfig = z.infer<typeof RepoConfigSchema>

export const ConfigSchema = z.object({
  /** Defaulted, so a file the dashboard's Settings wrote first (only `worktreeFolders`) still keeps `repos`. */
  port: z.number().int().min(1).max(65535).default(DEFAULT_WEB_PORT),
  /** GitHub logins whose PR comments are handed to the agent although they are not repo members (copied into pr-comments.json at every sync). */
  trustedPrCommentAuthors: z.array(z.string()).optional(),
  /** Per repository, keyed by the main worktree's absolute path, so every linked worktree of it shares the entry. */
  repos: z.record(z.string(), RepoConfigSchema).optional(),
  /** Registered pack folders (`scout pack add`), absolute, in order; see `@scout/shared/packs`. */
  packs: z.array(z.string().min(1)).optional(),
})
export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = { port: DEFAULT_WEB_PORT }

export async function readConfig(home: string): Promise<Config> {
  try {
    const parsed = ConfigSchema.safeParse(JSON.parse(await readFile(path.join(home, CONFIG_FILE), 'utf8')))
    return parsed.success ? parsed.data : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

export function dashboardOrigin(config: Config): string {
  return `http://${DASHBOARD_HOST}:${config.port}`
}

/** `/s/<id>` for a code review, `/t/<id>` for a test run. */
export function dashboardUrl(config: Config, id: string, kind: ManifestKind = 'code-review'): string {
  return `${dashboardOrigin(config)}/${kind === 'test-run' ? 't' : 's'}/${id}`
}
