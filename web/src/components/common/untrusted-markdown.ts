import { defaultRehypePlugins, type StreamdownProps } from 'streamdown'

/** Image hosts a comment may load from: GitHub's own, where pasted screenshots and attachments live. */
const IMAGE_HOSTS: readonly RegExp[] = [/^github\.com$/, /^user-images\.githubusercontent\.com$/, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.githubusercontent\.com$/]
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function parseUrl(value: string | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** True for an https image on an allowed GitHub host; everything else is never requested. */
export function isAllowedImageUrl(value: string | undefined): boolean {
  const url = parseUrl(value)
  return url !== null && url.protocol === 'https:' && IMAGE_HOSTS.some((host) => host.test(url.hostname))
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
