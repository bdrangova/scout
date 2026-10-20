export interface OutlineHeading {
  /** The rendered text (inline markup removed), as it appears in the page. */
  text: string
  /** How many headings before this one in the file have the same text. */
  occurrence: number
}

/** Drops the inline markup a heading's rendered text does not show. */
function plainText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
}

/**
 * The second- and third-level headings of a markdown file, in order, outside code fences. The
 * title (`#`) is the source row itself, so it is not listed.
 */
export function extractHeadings(markdown: string): OutlineHeading[] {
  const seen = new Map<string, number>()
  const headings: OutlineHeading[] = []
  let fence: { marker: string; length: number } | null = null
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fenceMatch) {
      const run = fenceMatch[1] ?? '```'
      const marker = run[0] ?? '`'
      if (fence === null) fence = { marker, length: run.length }
      else if (fence.marker === marker && run.length >= fence.length && (fenceMatch[2] ?? '').trim() === '') fence = null
      continue
    }
    if (fence !== null) continue
    const match = /^ {0,3}#{2,3}\s+(.+)$/.exec(line)
    if (!match) continue
    const text = plainText(match[1] ?? '')
    if (text === '') continue
    const occurrence = seen.get(text) ?? 0
    seen.set(text, occurrence + 1)
    headings.push({ text, occurrence })
  }
  return headings
}
