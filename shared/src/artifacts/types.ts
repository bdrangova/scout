// Artifact kinds by file extension. Pure; safe for the web.
import type { EvidenceType, ExtraType, SpecType } from '../schemas/artifacts.ts'

function extensionOf(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg'])
const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4', '.m4v', '.mov', '.ogv'])

export function evidenceTypeFromPath(filePath: string): EvidenceType | null {
  const ext = extensionOf(filePath)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

export function extraTypeFromPath(filePath: string): ExtraType | null {
  switch (extensionOf(filePath)) {
    case '.md':
    case '.markdown':
      return 'markdown'
    case '.html':
    case '.htm':
      return 'html'
    case '.mmd':
    case '.mermaid':
      return 'mermaid'
    default:
      return null
  }
}

/** `.html` → artifact, a filename starting with `jira` → jira, else markdown. Null for non-spec files. */
export function specTypeFromPath(filePath: string): SpecType | null {
  const ext = extensionOf(filePath)
  if (ext === '.html' || ext === '.htm') return 'artifact'
  if (ext !== '.md' && ext !== '.markdown' && ext !== '.txt') return null
  const name = filePath.slice(filePath.lastIndexOf('/') + 1).toLowerCase()
  return name.startsWith('jira') ? 'jira' : 'markdown'
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.mermaid': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json',
}

export function mimeFromPath(filePath: string): string | null {
  return MIME_BY_EXTENSION[extensionOf(filePath)] ?? null
}
