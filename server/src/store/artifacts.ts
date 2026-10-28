import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import {
  ARTIFACT_INDEX_FILE,
  EvidenceIndexSchema,
  ExtrasIndexSchema,
  SESSION_EVIDENCE_DIR,
  SESSION_EXTRAS_DIR,
  SESSION_SPEC_DIR,
  SpecIndexSchema,
  deriveEvidence,
  deriveExtras,
  deriveSpec,
} from '@scout/shared'
import type { EvidenceItem, ExtraItem, SpecItem } from '@scout/shared'
import { errorMessage, formatZodError } from '../errors.ts'
import { isMissing } from './fs.ts'

export type ArtifactKind = 'evidence' | 'extras' | 'spec'

export const ARTIFACT_DIRS: Readonly<Record<ArtifactKind, string>> = {
  evidence: SESSION_EVIDENCE_DIR,
  extras: SESSION_EXTRAS_DIR,
  spec: SESSION_SPEC_DIR,
}

export interface SessionArtifacts {
  evidence: EvidenceItem[]
  extras: ExtraItem[]
  spec: SpecItem[]
}

/** Only the head of a document is needed for its title; large HTML artifacts are not read whole. */
const TITLE_READ_BYTES = 64 * 1024

function isHidden(rel: string): boolean {
  return rel.split('/').some((segment) => segment.startsWith('.'))
}

/**
 * Regular files under `dir`, recursively, as posix paths relative to `dir`, sorted. Symlinks and
 * dot-files are skipped so nothing outside the folder can be listed or served. Empty when missing.
 */
export async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true, recursive: true })
  } catch (err) {
    if (isMissing(err)) return []
    throw err
  }
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const rel = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
    if (rel === '' || rel.startsWith('..') || isHidden(rel)) continue
    files.push(rel)
  }
  return files.sort()
}

/** `index.json` parsed with `schema`; null when absent, and null (after logging) when invalid. */
export async function readIndex<T>(dir: string, schema: z.ZodType<T>, label: string, log: (message: string) => void): Promise<T | null> {
  let text: string
  try {
    text = await fsp.readFile(path.join(dir, ARTIFACT_INDEX_FILE), 'utf8')
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    log(`${label} is not valid JSON and was ignored: ${errorMessage(err)}`)
    return null
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    log(`${label} is invalid and was ignored: ${formatZodError(result.error)}`)
    return null
  }
  return result.data
}

/** Synchronous head read for `deriveExtras`/`deriveSpec` title fallbacks; null when unreadable. */
function readHead(dir: string): (file: string) => string | null {
  return (file) => {
    let fd: number | null = null
    try {
      fd = fs.openSync(path.join(dir, ...file.split('/')), 'r')
      const buffer = Buffer.alloc(TITLE_READ_BYTES)
      const read = fs.readSync(fd, buffer, 0, buffer.length, 0)
      return buffer.subarray(0, read).toString('utf8')
    } catch {
      return null
    } finally {
      if (fd !== null) fs.closeSync(fd)
    }
  }
}

/** The derived evidence, extras and spec items of a session folder. */
export async function deriveArtifacts(sessionDir: string, log: (message: string) => void): Promise<SessionArtifacts> {
  const evidenceDir = path.join(sessionDir, SESSION_EVIDENCE_DIR)
  const extrasDir = path.join(sessionDir, SESSION_EXTRAS_DIR)
  const specDir = path.join(sessionDir, SESSION_SPEC_DIR)
  const [evidenceFiles, extrasFiles, specFiles, evidenceIndex, extrasIndex, specIndex] = await Promise.all([
    listFilesRecursive(evidenceDir),
    listFilesRecursive(extrasDir),
    listFilesRecursive(specDir),
    readIndex(evidenceDir, EvidenceIndexSchema, `${SESSION_EVIDENCE_DIR}/${ARTIFACT_INDEX_FILE}`, log),
    readIndex(extrasDir, ExtrasIndexSchema, `${SESSION_EXTRAS_DIR}/${ARTIFACT_INDEX_FILE}`, log),
    readIndex(specDir, SpecIndexSchema, `${SESSION_SPEC_DIR}/${ARTIFACT_INDEX_FILE}`, log),
  ])
  return {
    evidence: deriveEvidence(evidenceFiles, evidenceIndex),
    extras: deriveExtras(extrasFiles, extrasIndex, readHead(extrasDir)),
    spec: deriveSpec(specFiles, specIndex, readHead(specDir)),
  }
}

/** The paths an artifact route may serve for `kind`. */
export function artifactPaths(artifacts: SessionArtifacts, kind: ArtifactKind): Set<string> {
  return new Set(artifacts[kind].map((item) => item.path))
}
