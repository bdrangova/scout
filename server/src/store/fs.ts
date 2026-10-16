import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export function isMissing(err: unknown): boolean {
  const code = err !== null && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** `null` when the file (or a directory on its path) does not exist. */
export async function readTextIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

export async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile()
  } catch (err) {
    if (isMissing(err)) return false
    throw err
  }
}

/** Writes `data` to a sibling temp file and renames it over `file`, creating parent folders. */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await fs.writeFile(tmp, data, 'utf8')
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}
