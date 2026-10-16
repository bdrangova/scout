import fs from 'node:fs/promises'
import { isMissing } from './fs.ts'

interface Entry<T> {
  mtimeMs: number
  size: number
  value: T
}

/**
 * Caches the parsed form of a file by absolute path, keyed on the file's mtime and size, so
 * repeated reads of an unchanged `manifest.json` skip parsing. Atomic writes
 * (tmp + rename) always change the mtime, so a rewrite is picked up on the next read.
 */
export class FileCache<T> {
  private readonly entries = new Map<string, Entry<T>>()

  /** `null` when the file does not exist. */
  async get(file: string, parse: (text: string) => T): Promise<T | null> {
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(file)
    } catch (err) {
      if (isMissing(err)) {
        this.entries.delete(file)
        return null
      }
      throw err
    }
    const hit = this.entries.get(file)
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.value
    const value = parse(await fs.readFile(file, 'utf8'))
    this.entries.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value })
    return value
  }

  clear(): void {
    this.entries.clear()
  }
}
