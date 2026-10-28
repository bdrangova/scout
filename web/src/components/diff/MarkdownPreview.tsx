import type { Scope, TreeFile } from '@scout/shared'
import { TriangleAlert } from 'lucide-react'
import { Markdown } from '@/components/common/Markdown'
import { Button } from '@/components/ui/button'
import { useFileContents } from '@/lib/hooks'
import { BodyNotice } from './LargeFileGate'

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
    <div className="flex flex-col bg-surface">
      <p className="border-b-fine border-line bg-paper-2 px-5 py-1.5 text-xs font-semibold text-ink-muted">
        {side === 'before' ? 'Rendered before side (deleted)' : 'Rendered after side'}
        {' · '}
        <span className="font-mono font-medium">{file.path}</span>
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
      <BodyNotice
        tone="err"
        icon={TriangleAlert}
        title="Couldn't load this preview"
        action={
          <Button size="sm" onClick={reload}>
            Retry
          </Button>
        }
      >
        {error.message}
      </BodyNotice>
    )
  }
  if (loading || content === null) {
    return (
      <p className="px-6 py-8 text-sm text-ink-muted" aria-busy="true">
        Loading preview…
      </p>
    )
  }
  if (content.trim() === '') {
    return <BodyNotice title="This file is empty." />
  }
  return <Markdown source={content} className="px-6 py-5" />
}
