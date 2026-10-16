// Idempotent merge of the review-dash hooks and permission into a Claude Code settings file.
// Existing entries are never removed or reordered; a hook is recognised by its script name.

export type JsonObject = Record<string, unknown>

export interface HookSpec {
  /** Hook event, e.g. `UserPromptSubmit` or `Stop`. */
  event: string
  /** The command to register when no existing hook mentions `matchKey`. */
  command: string
  timeout: number
  /** Substring identifying this hook in an existing command (the script file name). */
  matchKey: string
}

export interface MergeResult {
  settings: JsonObject
  changed: boolean
  added: string[]
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureObject(parent: JsonObject, key: string): JsonObject {
  const current = parent[key]
  if (current === undefined) {
    const created: JsonObject = {}
    parent[key] = created
    return created
  }
  if (!isObject(current)) throw new Error(`settings: "${key}" is not an object`)
  return current
}

function ensureArray(parent: JsonObject, key: string): unknown[] {
  const current = parent[key]
  if (current === undefined) {
    const created: unknown[] = []
    parent[key] = created
    return created
  }
  if (!Array.isArray(current)) throw new Error(`settings: "${key}" is not an array`)
  return current
}

function groupMentions(group: unknown, matchKey: string): boolean {
  if (!isObject(group) || !Array.isArray(group.hooks)) return false
  return group.hooks.some((hook) => isObject(hook) && typeof hook.command === 'string' && hook.command.includes(matchKey))
}

export function mergeSettings(existing: unknown, input: { hooks: readonly HookSpec[]; allow: readonly string[] }): MergeResult {
  if (existing !== undefined && !isObject(existing)) throw new Error('settings file is not a JSON object')
  const settings: JsonObject = existing === undefined ? {} : (structuredClone(existing) as JsonObject)
  const added: string[] = []

  const allow = ensureArray(ensureObject(settings, 'permissions'), 'allow')
  for (const entry of input.allow) {
    if (!allow.includes(entry)) {
      allow.push(entry)
      added.push(`permissions.allow: ${entry}`)
    }
  }

  const hooks = ensureObject(settings, 'hooks')
  for (const spec of input.hooks) {
    const groups = ensureArray(hooks, spec.event)
    if (groups.some((group) => groupMentions(group, spec.matchKey))) continue
    groups.push({ hooks: [{ type: 'command', command: spec.command, timeout: spec.timeout }] })
    added.push(`hooks.${spec.event}: ${spec.matchKey}`)
  }

  return { settings, changed: added.length > 0, added }
}
