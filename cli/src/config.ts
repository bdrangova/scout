// `~/.ai-review/config.json` `{ port }`: the dashboard writes it at startup so URLs are right.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { DEFAULT_WEB_PORT, type ManifestKind } from '@review-dash/shared'

export const CONFIG_FILE = 'config.json'

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  /** GitHub logins whose PR comments are handed to the agent although they are not repo members (copied into pr-comments.json at every sync). */
  trustedPrCommentAuthors: z.array(z.string()).optional(),
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
  return `http://127.0.0.1:${config.port}`
}

/** `/s/<id>` for a code review, `/t/<id>` for a test run. */
export function dashboardUrl(config: Config, id: string, kind: ManifestKind = 'code-review'): string {
  return `${dashboardOrigin(config)}/${kind === 'test-run' ? 't' : 's'}/${id}`
}
