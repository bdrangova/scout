// NODE ONLY (see run.ts). Parsers for `git diff --numstat -z` and `--name-status -z` output.

export interface NumstatEntry {
  path: string
  oldPath: string | null
  additions: number
  deletions: number
  binary: boolean
}

/** Parses `git diff --numstat -z` output: `add\tdel\tpath\0`, renames as `add\tdel\t\0old\0new\0`. */
export function parseNumstatZ(text: string): NumstatEntry[] {
  const fields = text.split('\0')
  const entries: NumstatEntry[] = []
  let i = 0
  while (i < fields.length) {
    const record = fields[i]
    if (record === undefined || record === '') {
      i += 1
      continue
    }
    const first = record.indexOf('\t')
    const second = first === -1 ? -1 : record.indexOf('\t', first + 1)
    if (first === -1 || second === -1) throw new Error(`unexpected numstat record: ${JSON.stringify(record)}`)
    const added = record.slice(0, first)
    const deleted = record.slice(first + 1, second)
    const inlinePath = record.slice(second + 1)
    const binary = added === '-' && deleted === '-'
    const additions = binary ? 0 : Number.parseInt(added, 10)
    const deletions = binary ? 0 : Number.parseInt(deleted, 10)
    if (Number.isNaN(additions) || Number.isNaN(deletions)) throw new Error(`unexpected numstat counts: ${JSON.stringify(record)}`)
    if (inlinePath === '') {
      const oldPath = fields[i + 1]
      const newPath = fields[i + 2]
      if (oldPath === undefined || newPath === undefined) throw new Error('truncated numstat rename record')
      entries.push({ path: newPath, oldPath, additions, deletions, binary })
      i += 3
    } else {
      entries.push({ path: inlinePath, oldPath: null, additions, deletions, binary })
      i += 1
    }
  }
  return entries
}

export type NameStatusCode = 'A' | 'M' | 'D' | 'R' | 'C' | 'T'

export interface NameStatusEntry {
  code: NameStatusCode
  /** Similarity score for renames and copies, else null. */
  score: number | null
  path: string
  oldPath: string | null
}

function isNameStatusCode(value: string): value is NameStatusCode {
  return value === 'A' || value === 'M' || value === 'D' || value === 'R' || value === 'C' || value === 'T'
}

/** Parses `git diff --name-status -z` output: `M\0path\0`, `R100\0old\0new\0`, `C75\0old\0new\0`. */
export function parseNameStatusZ(text: string): NameStatusEntry[] {
  const fields = text.split('\0')
  const entries: NameStatusEntry[] = []
  let i = 0
  while (i < fields.length) {
    const status = fields[i]
    if (status === undefined || status === '') {
      i += 1
      continue
    }
    const code = status.charAt(0)
    if (!isNameStatusCode(code)) throw new Error(`unsupported name-status code: ${JSON.stringify(status)}`)
    if (code === 'R' || code === 'C') {
      const oldPath = fields[i + 1]
      const newPath = fields[i + 2]
      if (oldPath === undefined || newPath === undefined) throw new Error('truncated name-status rename record')
      const score = status.length > 1 ? Number.parseInt(status.slice(1), 10) : null
      entries.push({ code, score: score === null || Number.isNaN(score) ? null : score, path: newPath, oldPath })
      i += 3
    } else {
      const filePath = fields[i + 1]
      if (filePath === undefined) throw new Error('truncated name-status record')
      entries.push({ code, score: null, path: filePath, oldPath: null })
      i += 2
    }
  }
  return entries
}
