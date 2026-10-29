import { defaultRehypePlugins, type StreamdownProps } from 'streamdown'

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function parseUrl(value: string | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * GitHub stores a pasted screenshot as a raw `<img>` tag, and raw HTML never becomes elements here:
 * each tag with a `src` is rewritten to a markdown image first, so it goes through the same host gate.
 */
export function imgTagsToMarkdown(source: string): string {
  return source.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const url = src?.[1] ?? src?.[2]
    if (!url) return tag
    const alt = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const text = (alt?.[1] ?? alt?.[2] ?? '').replace(/[[\]]/g, '')
    return `![${text}](<${url.replace(/[<>\s]/g, '')}>)`
  })
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

function visit(node: HastNode, fn: (element: HastNode) => void): void {
  if (node.type === 'element') fn(node)
  for (const child of node.children ?? []) visit(child, fn)
}

/**
 * Runs after sanitize and harden: a link that is not http(s)/mailto stops being a link, and every
 * remaining link gets its destination host appended to its text, so "click here" shows where to.
 */
function rehypeLinkHost() {
  return (tree: HastNode) => {
    visit(tree, (element) => {
      if (element.tagName !== 'a') return
      const href = typeof element.properties?.href === 'string' ? element.properties.href : undefined
      const url = parseUrl(href)
      if (href?.startsWith('#') || href === 'streamdown:incomplete-link') return
      if (!url || !LINK_PROTOCOLS.has(url.protocol)) {
        element.tagName = 'span'
        delete element.properties?.href
        return
      }
      if (url.protocol === 'mailto:') return
      element.children = [...(element.children ?? []), { type: 'element', tagName: 'span', properties: { className: ['link-host'] }, children: [{ type: 'text', value: ` (${url.host})` }] }]
    })
  }
}

const HARDEN_OPTIONS = { allowedLinkPrefixes: ['*'], allowedImagePrefixes: ['*'], allowedProtocols: ['http:', 'https:', 'mailto:'], allowDataImages: false }
const sanitizeEntry = defaultRehypePlugins.sanitize
const hardenEntry = defaultRehypePlugins.harden
const hardenPlugin = Array.isArray(hardenEntry) ? hardenEntry[0] : undefined
// Fail loudly if a streamdown upgrade renames these: running without them would be silently unsafe.
if (!sanitizeEntry || typeof hardenPlugin !== 'function') throw new Error('streamdown no longer exposes the sanitize/harden rehype plugins')

/**
 * No `rehype-raw`: raw HTML in the markdown never becomes elements. Sanitize stays as a second layer
 * (no script/iframe/style/on* attributes), and harden is configured explicitly: http(s) links only,
 * no data: images. Images are then gated per host by the `img` component below.
 */
export const UNTRUSTED_REHYPE_PLUGINS: NonNullable<StreamdownProps['rehypePlugins']> = [sanitizeEntry, [hardenPlugin, HARDEN_OPTIONS], rehypeLinkHost]
