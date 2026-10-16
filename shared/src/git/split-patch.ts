// NODE ONLY (see run.ts); pure string handling, kept here because only the server slices patches.
/**
 * Splits a `git diff -M --full-index` patch into per-file patches so a single file's diff can be
 * served (and parsed by `@pierre/diffs`) on its own. Each value is the complete per-file patch
 * starting at its `diff --git` header.
 */

const HEADER_PREFIX = 'diff --git '

/** Keyed by the file's new path (its old path for deletions). */
export function splitPatch(patchText: string): Map<string, string> {
  const files = new Map<string, string>()
  // Content lines start with ' ', '+', '-', '\' or '@', so a line starting with `diff --git `
  // can only be a header; anything before the first header (a preamble) is dropped.
  for (const chunk of patchText.split(/^(?=diff --git )/m)) {
    if (!chunk.startsWith(HEADER_PREFIX)) continue
    const key = patchFileKey(chunk)
    if (key !== null && !files.has(key)) files.set(key, chunk)
  }
  return files
}

/**
 * The path a per-file patch is keyed by: `rename to` / `copy to` when present, else the `+++`
 * path, else the `---` path (deletions), else the `diff --git` header (binary files, mode-only
 * changes).
 */
export function patchFileKey(chunk: string): string | null {
  const lines = chunk.split(/\r?\n/)
  let newPath: string | null = null
  let oldPath: string | null = null
  for (const line of lines.slice(1)) {
    if (line.startsWith('@@') || line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) break
    if (line.startsWith('rename to ')) return unquotePath(line.slice('rename to '.length))
    if (line.startsWith('copy to ')) return unquotePath(line.slice('copy to '.length))
    if (line.startsWith('+++ ')) {
      const p = unquotePath(line.slice(4))
      if (p !== '/dev/null') newPath = stripPrefix(p, 'b/')
    } else if (line.startsWith('--- ')) {
      const p = unquotePath(line.slice(4))
      if (p !== '/dev/null') oldPath = stripPrefix(p, 'a/')
    }
  }
  if (newPath !== null) return newPath
  if (oldPath !== null) return oldPath
  return parseHeaderLine(lines[0] ?? '')?.newPath ?? null
}

/** Parses `diff --git a/<old> b/<new>`, with either side C-quoted. */
export function parseHeaderLine(line: string): { oldPath: string; newPath: string } | null {
  if (!line.startsWith(HEADER_PREFIX)) return null
  const rest = line.slice(HEADER_PREFIX.length).replace(/\r$/, '')
  if (rest.startsWith('"')) {
    const first = readCString(rest, 0)
    if (first === null) return null
    const tail = rest.slice(first.end).replace(/^ /, '')
    const second = tail.startsWith('"') ? readCString(tail, 0)?.value : tail
    if (second === undefined || second === '') return null
    return { oldPath: stripPrefix(first.value, 'a/'), newPath: stripPrefix(second, 'b/') }
  }
  // Unquoted paths may contain spaces. For anything but a rename the header is `a/<p> b/<p>`,
  // so the two halves have the same length and the same path.
  if ((rest.length - 1) % 2 === 0) {
    const half = (rest.length - 1) / 2
    const a = rest.slice(0, half)
    const b = rest.slice(half + 1)
    if (rest.charAt(half) === ' ' && a.startsWith('a/') && b.startsWith('b/') && a.length > 2 && a.slice(2) === b.slice(2)) {
      return { oldPath: a.slice(2), newPath: b.slice(2) }
    }
  }
  // Renames carry `rename from/to` lines, so this is a best effort for unusual producers.
  const idx = rest.lastIndexOf(' b/')
  if (idx > 0) return { oldPath: stripPrefix(rest.slice(0, idx), 'a/'), newPath: rest.slice(idx + 3) }
  const space = rest.lastIndexOf(' ')
  if (space > 0) return { oldPath: rest.slice(0, space), newPath: rest.slice(space + 1) }
  return null
}

const SIMPLE_ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
}

/**
 * Reads a C-style quoted string (as git writes with `core.quotePath`) starting at `start`, which
 * must be the opening quote. Octal escapes are raw UTF-8 bytes. Returns the decoded value and the
 * index just past the closing quote, or `null` when unterminated.
 */
export function readCString(s: string, start: number): { value: string; end: number } | null {
  if (s.charAt(start) !== '"') return null
  const bytes: number[] = []
  let i = start + 1
  while (i < s.length) {
    const ch = s.charAt(i)
    if (ch === '"') return { value: Buffer.from(bytes).toString('utf8'), end: i + 1 }
    if (ch === '\\') {
      const next = s.charAt(i + 1)
      if (/^[0-7]$/.test(next)) {
        let j = i + 1
        let octal = ''
        while (j < s.length && j < i + 4 && /^[0-7]$/.test(s.charAt(j))) {
          octal += s.charAt(j)
          j += 1
        }
        bytes.push(Number.parseInt(octal, 8) & 0xff)
        i = j
        continue
      }
      const code = SIMPLE_ESCAPES[next]
      if (code !== undefined) {
        bytes.push(code)
      } else {
        bytes.push(...Buffer.from(next, 'utf8'))
      }
      i += 2
      continue
    }
    const char = String.fromCodePoint(s.codePointAt(i) ?? 0xfffd)
    bytes.push(...Buffer.from(char, 'utf8'))
    i += char.length
  }
  return null
}

/** Unquotes a C-quoted path; plain paths are returned unchanged. */
export function unquotePath(raw: string): string {
  return raw.startsWith('"') ? (readCString(raw, 0)?.value ?? raw) : raw
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s
}
