import path from 'node:path'
import { BLUEPRINT_LAYOUT_FILE, BlueprintLayoutSchema } from '@scout/shared'
import type { BlueprintLayout } from '@scout/shared'
import { readTextIfExists } from './fs.ts'

export function blueprintLayoutFile(sessionDir: string): string {
  return path.join(sessionDir, ...BLUEPRINT_LAYOUT_FILE.split('/'))
}

/** `review/blueprint.json` (dashboard-owned); null when absent, unreadable, invalid or another session's. */
export async function readBlueprintLayout(sessionDir: string, sessionId: string): Promise<BlueprintLayout | null> {
  try {
    const text = await readTextIfExists(blueprintLayoutFile(sessionDir))
    if (text === null) return null
    const parsed = BlueprintLayoutSchema.safeParse(JSON.parse(text))
    return parsed.success && parsed.data.sessionId === sessionId ? parsed.data : null
  } catch {
    return null
  }
}
