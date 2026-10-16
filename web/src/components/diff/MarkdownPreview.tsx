import type { Scope, TreeFile } from '@review-dash/shared'
import { TriangleAlert } from 'lucide-react'
import { Markdown } from '@/components/common/Markdown'
import { Button } from '@/components/ui/button'
import { useFileContents } from '@/lib/hooks'
import { Notice } from './LargeFileGate'

interface MarkdownPreviewProps {
  file: TreeFile
  sessionId: string
  /** Read the sides from the scope's contents route instead of the full diff's. */
  scope?: Scope | null
}

/**
 * The rendered markdown of a diffed file: the after side, or the before side of a deleted file
 * (the only side that still exists). Refetched when the file's fingerprint moves.
 */
export function MarkdownPreview({ file, sessionId, scope = null }: MarkdownPreviewProps) {
  const side = file.status === 'deleted' ? 'before' : 'after'
  const { content, loading, error, reload } = useFileContents(sessionId, file.path, side, { fingerprint: file.fingerprint, scope })

  return (
    <div className="flex flex-col">
      <p className="border-b bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground">
        {side === 'before' ? 'Rendered before side (deleted)' : 'Rendered after side'}
        {' · '}
        <span className="font-mono">{file.path}</span>
      </p>
      <PreviewBody content={content} loading={loading} error={error} reload={reload} />
    </div>
  )
}

interface PreviewBodyProps {
  content: string | null
  loading: boolean
  error: Error | null
  reload: () => void
}

function PreviewBody({ content, loading, error, reload }: PreviewBodyProps) {
  if (error) {
    return (
      <Notice
        icon={<TriangleAlert className="size-5" aria-hidden />}
        title="Couldn't load this preview"
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            Retry
          </Button>
        }
      >
        {error.message}
      </Notice>
    )
  }
  if (loading || content === null) {
    return (
      <p className="px-6 py-8 text-sm text-muted-foreground" aria-busy="true">
        Loading preview…
      </p>
    )
  }
  if (content.trim() === '') {
    return <Notice title="This file is empty." />
  }
  return <Markdown source={content} className="px-6 py-5" />
}
