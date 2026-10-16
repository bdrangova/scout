import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

export interface MarkdownProps {
  source: string
  className?: string
  /** Mermaid blocks take most of the viewport (pan/zoom inside); the text keeps its usual flow. */
  tallDiagrams?: boolean
}

const PLUGINS = { code, mermaid }
const LINK_SAFETY = { enabled: false }

/** Typography for agent-written markdown; no Tailwind typography plugin, so the rules live here. */
const PROSE =
  'prose-rd text-sm leading-relaxed text-foreground ' +
  '[&>:first-child]:mt-0 [&>:last-child]:mb-0 ' +
  '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight ' +
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight ' +
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold ' +
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-muted-foreground ' +
  '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 ' +
  '[&_a]:text-info [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-info/80 ' +
  '[&_strong]:font-semibold [&_hr]:my-4 [&_hr]:border-border ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground ' +
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] ' +
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-[13px] [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold ' +
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_img]:max-w-full [&_img]:rounded-md'

/**
 * Streamdown's diagram box is as tall as its content; without a height the SVG shrinks to the
 * replaced-element default and a graph becomes a thumbnail. These give the pan/zoom box a viewport
 * height and let the SVG fill its width, capped at that height.
 */
const TALL_DIAGRAMS =
  '[&_[data-streamdown=mermaid]>div]:min-h-[70vh] [&_[data-streamdown=mermaid]_[role=img]]:w-full ' +
  '[&_[data-streamdown=mermaid]_[role=img]>svg]:max-h-[70vh] [&_[data-streamdown=mermaid]_[role=img]>svg]:w-full'

/**
 * Static (non-streaming) GFM markdown with Shiki code blocks and Mermaid diagrams. Streamdown's
 * link-safety modal is off: the content is the reviewer's own agent output, and plain anchors keep
 * links readable (and testable) as links.
 */
export function Markdown({ source, className, tallDiagrams = false }: MarkdownProps) {
  return (
    <Streamdown mode="static" plugins={PLUGINS} linkSafety={LINK_SAFETY} className={cn(PROSE, tallDiagrams && TALL_DIAGRAMS, className)}>
      {source}
    </Streamdown>
  )
}
