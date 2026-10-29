import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { useMemo } from 'react'
import { createCssVariablesTheme } from 'shiki'
import { Streamdown, type LinkSafetyModalProps, type ThemeInput } from 'streamdown'
import { useMermaidConfig } from '@/lib/mermaid-theme'
import { cn } from '@/lib/utils'
import { LinkSafetyDialog, SafeImage } from './UntrustedParts'
import { imgTagsToMarkdown, UNTRUSTED_REHYPE_PLUGINS } from './untrusted-markdown'
import './markdown.css'

export interface MarkdownProps {
  source: string
  className?: string
  /** Mermaid blocks take most of the viewport (pan/zoom inside); the text keeps its usual flow. */
  tallDiagrams?: boolean
  /**
   * `untrusted` is for third-party text (GitHub comments, trusted authors included): links ask for
   * confirmation and show their host, only GitHub-hosted images load (pasted `<img>` tags included,
   * through the server's signed-in relay), no other raw HTML, no diagrams.
   * `trusted` (default) is the reviewer's own agent output.
   */
  variant?: 'trusted' | 'untrusted'
}

const PLUGINS = { code, mermaid }
const CODE_ONLY = { code }
const UNTRUSTED_COMPONENTS = { img: SafeImage }
const UNTRUSTED_LINK_SAFETY = { enabled: true, renderModal: (props: LinkSafetyModalProps) => <LinkSafetyDialog {...props} /> }
const LINK_SAFETY = { enabled: false }

/**
 * One Shiki theme whose colours are `var(--shiki-token-*)`: markdown.css points those at the
 * design's syntax tokens, so highlighted code follows the light/dark switch without re-rendering.
 * Streamdown wants a [light, dark] pair; both are this theme.
 */
const CSS_VARIABLES_THEME = createCssVariablesTheme({ name: 'scout', variablePrefix: '--shiki-', fontStyle: true })
const SHIKI_THEMES: [ThemeInput, ThemeInput] = [CSS_VARIABLES_THEME, CSS_VARIABLES_THEME]

/**
 * Static (non-streaming) GFM markdown with Shiki code blocks and Mermaid diagrams, typeset by
 * `markdown.css` on the design tokens. Streamdown's link-safety modal is off: the content is the
 * reviewer's own agent output, and plain anchors keep links readable (and testable) as links.
 */
export function Markdown({ variant = 'trusted', ...props }: MarkdownProps) {
  return variant === 'untrusted' ? <UntrustedMarkdown {...props} /> : <TrustedMarkdown {...props} />
}

function UntrustedMarkdown({ source, className }: Omit<MarkdownProps, 'variant'>) {
  return (
    <Streamdown
      mode="static"
      plugins={CODE_ONLY}
      shikiTheme={SHIKI_THEMES}
      linkSafety={UNTRUSTED_LINK_SAFETY}
      rehypePlugins={UNTRUSTED_REHYPE_PLUGINS}
      components={UNTRUSTED_COMPONENTS}
      className={cn('prose-rd', className)}
    >
      {imgTagsToMarkdown(source)}
    </Streamdown>
  )
}

function TrustedMarkdown({ source, className, tallDiagrams = false }: Omit<MarkdownProps, 'variant'>) {
  const config = useMermaidConfig()
  const mermaidOptions = useMemo(() => ({ config }), [config])
  return (
    <Streamdown
      mode="static"
      plugins={PLUGINS}
      shikiTheme={SHIKI_THEMES}
      mermaid={mermaidOptions}
      linkSafety={LINK_SAFETY}
      className={cn('prose-rd', tallDiagrams && 'prose-rd--tall', className)}
    >
      {source}
    </Streamdown>
  )
}
