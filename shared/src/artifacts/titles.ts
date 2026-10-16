// Title fallbacks for extras and spec files: index value, else the document's own title, else the filename.

export function firstHeading(markdown: string): string | null {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown)
  return match?.[1] ?? null
}

export function htmlTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
  const title = match?.[1]?.trim()
  return title === undefined || title === '' ? null : title
}

export function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('/') + 1)
}

/**
 * `explicit` when given and non-blank; else the first `# ` heading of a markdown file or the
 * `<title>` of an HTML file (when `content` is given); else the filename.
 */
export function deriveTitle(filePath: string, explicit: string | null | undefined, content: string | null): string {
  if (explicit !== undefined && explicit !== null && explicit.trim() !== '') return explicit.trim()
  if (content !== null) {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return firstHeading(content) ?? basename(filePath)
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return htmlTitle(content) ?? basename(filePath)
  }
  return basename(filePath)
}
