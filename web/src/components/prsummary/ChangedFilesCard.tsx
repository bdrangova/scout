import type { TreeFile, TreeStats } from '@scout/shared'
import { Link } from 'react-router'
import { ContentCard } from '@/components/common/ContentCard'
import { FileStatusChip } from '@/components/diff/FileStatusChips'
import { ChangeBar } from '@/components/files/ChangeBar'
import { fileStatusBadge } from '@/lib/file-status'
import { formatAdditions, formatDeletions, pluralize } from '@/lib/format'
import { fileRoute, splitPath } from '@/lib/paths'
import { FILES_KIND } from './summary-cards'

function statusDigest(stats: TreeStats): string {
  const parts = [
    stats.added > 0 && `${stats.added} added`,
    stats.modified > 0 && `${stats.modified} modified`,
    stats.deleted > 0 && `${stats.deleted} deleted`,
    stats.renamed > 0 && `${stats.renamed} renamed`,
  ].filter(Boolean)
  return parts.join(', ')
}

export interface ChangedFilesCardProps {
  sessionId: string
  files: readonly TreeFile[]
  stats: TreeStats
}

/** Every changed file with its status and size of change; a row opens the file on the Review page. */
export function ChangedFilesCard({ sessionId, files, stats }: ChangedFilesCardProps) {
  return (
    <ContentCard
      label="Changed files"
      kind={FILES_KIND}
      title="Changed files"
      subtitle={`${pluralize(stats.files, 'file')} · ${formatAdditions(stats.additions)} ${formatDeletions(stats.deletions)}${statusDigest(stats) ? ` · ${statusDigest(stats)}` : ''}`}
      collapseLabel="Changed files"
      bodyClassName="p-0"
    >
      <ul aria-label="Changed files" className="m-0 flex max-h-[520px] flex-col overflow-y-auto p-0">
        {files.map((file) => {
          const { dir, name } = splitPath(file.path)
          return (
            <li key={file.path} className="border-b-fine border-line last:border-b-0">
              <Link to={fileRoute(sessionId, file.path)} className="flex min-w-0 items-center gap-2.5 px-4 py-2 text-[13px] hover:bg-paper-2">
                <FileStatusChip spec={fileStatusBadge(file)} className="lg:w-[84px] lg:justify-start" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={file.path}>
                  {dir && <span className="text-ink-muted">{dir}</span>}
                  <span className="font-bold">{name}</span>
                </span>
                <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
                  {formatAdditions(file.additions)} {formatDeletions(file.deletions)}
                </span>
                <ChangeBar additions={file.additions} deletions={file.deletions} className="shrink-0 max-sm:hidden" />
              </Link>
            </li>
          )
        })}
      </ul>
    </ContentCard>
  )
}
