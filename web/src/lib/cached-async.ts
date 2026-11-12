/** Anything with zod's `safeParse`, to check a stored answer still has the current shape. */
export interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

const PREFIX = 'scout.cache.'
// The last answer per key, kept in memory and in the browser's storage (shared by every tab, kept across reloads) so a page shows at once.
const memory = new Map<string, unknown>()

export function readCache<T>(key: string, schema: Parser<T>): T | null {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    memory.set(key, parsed.data)
    return parsed.data
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown): void {
  memory.set(key, value)
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the in-memory copy still serves this tab.
  }
}

/** Test hook: forget every cached answer. */
export function clearAsyncCache(): void {
  memory.clear()
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    // Nothing stored.
  }
}
