import path from 'node:path'
import { ManifestSchema } from '@review-dash/shared'
import type { Manifest } from '@review-dash/shared'
import { errorMessage, formatZodError } from '../errors.ts'
import { FileCache } from './cache.ts'

export const MANIFEST_FILE = 'manifest.json'

export type ManifestResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; error: string; missing: boolean }

export function parseManifest(text: string): ManifestResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `manifest.json is not valid JSON: ${errorMessage(err)}`, missing: false }
  }
  const result = ManifestSchema.safeParse(json)
  if (!result.success) {
    return { ok: false, error: `manifest.json is invalid: ${formatZodError(result.error)}`, missing: false }
  }
  return { ok: true, manifest: result.data }
}

/** Reads and validates `manifest.json` files, caching each parse until the file's mtime changes. */
export class ManifestReader {
  private readonly cache = new FileCache<ManifestResult>()

  /** `expectedId` is the folder name; a manifest whose `id` differs is reported as invalid. */
  async read(sessionDir: string, expectedId: string): Promise<ManifestResult> {
    const result = await this.cache.get(path.join(sessionDir, MANIFEST_FILE), parseManifest)
    if (result === null) {
      return { ok: false, error: 'manifest.json is missing (publish in progress?)', missing: true }
    }
    if (result.ok && result.manifest.id !== expectedId) {
      return {
        ok: false,
        error: `manifest id ${JSON.stringify(result.manifest.id)} does not match the folder name`,
        missing: false,
      }
    }
    return result
  }
}
