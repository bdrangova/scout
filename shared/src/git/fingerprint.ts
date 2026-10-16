// NODE ONLY (see run.ts). Content-derived 16-hex fingerprints for files and whole trees.
import { createHash } from 'node:crypto'

function sha1Hex16(parts: readonly (string | Buffer)[]): string {
  const hash = createHash('sha1')
  for (const part of parts) {
    hash.update(part)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

/** For text files that are in the patch: the per-file patch text itself. */
export function patchFingerprint(patch: string | Buffer): string {
  return sha1Hex16([patch])
}

/** For binary and omitted files: status, sizes and the blob ids on both sides (null where absent). */
export function metadataFingerprint(input: {
  status: string
  sizeBefore: number | null
  sizeAfter: number | null
  beforeBlob: string | null
  afterBlob: string | null
}): string {
  return sha1Hex16([
    'meta',
    input.status,
    String(input.sizeBefore ?? ''),
    String(input.sizeAfter ?? ''),
    input.beforeBlob ?? '',
    input.afterBlob ?? '',
  ])
}

/** Over the base, the head and every file's path and fingerprint, in path order. */
export function treeFingerprint(baseSha: string, headSha: string, files: readonly { path: string; fingerprint: string }[]): string {
  return sha1Hex16(['tree', baseSha, headSha, ...files.flatMap((file) => [file.path, file.fingerprint])])
}

/**
 * Over HEAD, the remote ref's sha (empty when there is none), every commit's sha with its
 * `pushed` flag in order, and the uncommitted stats; changes when a push, fetch, commit or edit happened.
 */
export function commitListFingerprint(input: {
  headSha: string
  remoteSha: string | null
  commits: readonly { sha: string; pushed: boolean }[]
  uncommitted: { files: number; additions: number; deletions: number } | null
}): string {
  const u = input.uncommitted
  return sha1Hex16([
    'commits',
    input.headSha,
    input.remoteSha ?? '',
    ...input.commits.flatMap((commit) => [commit.sha, commit.pushed ? '1' : '0']),
    u === null ? '' : `${u.files},${u.additions},${u.deletions}`,
  ])
}
