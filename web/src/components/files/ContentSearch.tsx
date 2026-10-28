import { useEffect, useState } from 'react'
import type { SearchHit, SearchResponse } from '@scout/shared'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { apiGet } from '@/lib/api'
import { requestLineJump } from '@/lib/line-jump'
import { searchPath, splitPath } from '@/lib/paths'
import { cn } from '@/lib/utils'
import { HighlightedText } from './HighlightedText'
import { RepoFileDialog, type RepoFileTarget } from './RepoFileDialog'

export const MIN_SEARCH_LENGTH = 2

type Result = { key: string; response?: SearchResponse; error?: string }

function useSearch(sessionId: string, query: string, scope: 'diff' | 'repo', enabled: boolean): { result: Result | null; loading: boolean } {
  const key = `${scope}:${query}`
  const [result, setResult] = useState<Result | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    const timer = setTimeout(() => {
      apiGet<SearchResponse>(searchPath(sessionId, query, scope)).then(
        (response) => live && setResult({ key, response }),
        (err: unknown) => live && setResult({ key, error: err instanceof Error ? err.message : String(err) }),
      )
    }, scope === 'diff' ? 250 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [sessionId, query, scope, key, enabled])
  const current = enabled && result?.key === key ? result : null
  return { result: current, loading: enabled && current === null }
}

const KIND_MARK: Record<SearchHit['kind'], string> = { add: '+', del: '−', context: ' ' }

function Hits({ response, query, onHit }: { response: SearchResponse; query: string; onHit: (path: string, hit: SearchHit) => void }) {
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">
    {response.files.map((file) => {
      const { dir, name } = splitPath(file.path)
      return <li key={file.path} className="flex flex-col">
        <button type="button" title={file.path} onClick={() => onHit(file.path, file.hits[0]!)} className="flex min-w-0 items-baseline gap-1.5 rounded-sm px-2 py-0.5 text-left text-xs hover:bg-hover">
          <span className="shrink-0 font-semibold">{name}</span>
          <span className="truncate text-[11px] text-ink-muted">{dir}</span>
          <span className="ml-auto shrink-0 text-[11px] text-ink-muted tabular-nums">{file.hits.length}{file.truncated ? '+' : ''}</span>
        </button>
        {file.hits.map((hit) => <button key={`${hit.side}${hit.line}`} type="button" onClick={() => onHit(file.path, hit)}
          className={cn('flex min-w-0 gap-2 rounded-sm px-2 py-0.5 text-left font-mono text-[11px] leading-4 hover:bg-hover', hit.kind === 'add' && 'bg-diff-add', hit.kind === 'del' && 'bg-diff-del')}>
          <span className="w-9 shrink-0 text-right text-ink-muted tabular-nums">{response.scope === 'diff' ? KIND_MARK[hit.kind] : ''}{hit.line}</span>
          <span className="truncate whitespace-pre"><HighlightedText text={hit.text.trimStart()} query={query} /></span>
        </button>)}
      </li>
    })}
  </ul>
}

/**
 * Content search in the rail: the changed files' patch lines first (a hit opens the file at that
 * line); when the changes have none, "Search all files" runs over the whole repository, and a hit
 * outside the diff opens that file in a dialog.
 */
export function ContentSearch({ sessionId, query, diffPaths, onSelect }: { sessionId: string; query: string; diffPaths: ReadonlySet<string>; onSelect: (path: string) => void }) {
  const ready = query.length >= MIN_SEARCH_LENGTH
  const [repoFor, setRepoFor] = useState<string | null>(null)
  const [dialog, setDialog] = useState<RepoFileTarget | null>(null)
  const diff = useSearch(sessionId, query, 'diff', ready)
  const repo = useSearch(sessionId, query, 'repo', ready && repoFor === query)

  function open(path: string, hit: SearchHit) {
    if (diffPaths.has(path)) {
      onSelect(path)
      requestLineJump(path, hit.side, hit.line)
    } else {
      setDialog({ path, line: hit.line, query })
    }
  }

  let body
  if (!ready) body = <p className="m-0 px-2 py-3 text-xs font-medium text-ink-muted">Type at least {MIN_SEARCH_LENGTH} characters.</p>
  else if (diff.loading) body = <p className="m-0 px-2 py-3 text-xs text-ink-muted">Searching the changes…</p>
  else if (diff.result?.error) body = <Notice tone="warn" className="m-1">{diff.result.error}</Notice>
  else if (diff.result?.response && diff.result.response.files.length > 0) body = <Hits response={diff.result.response} query={query} onHit={open} />
  else body = <div className="flex flex-col gap-2 px-2 py-2">
    <p className="m-0 text-xs font-medium text-ink-muted">No matches in the changes.</p>
    {repoFor !== query ? <Button size="sm" className="self-start" onClick={() => setRepoFor(query)}>Search all files</Button>
      : repo.loading ? <p className="m-0 text-xs text-ink-muted">Searching the repository…</p>
      : repo.result?.error ? <Notice tone="warn">{repo.result.error}</Notice>
      : repo.result?.response && repo.result.response.files.length > 0 ? <>
          <p className="m-0 text-xs font-semibold text-ink-muted">In the repository{repo.result.response.truncated ? ' (first 500)' : ''}</p>
          <div className="-mx-2"><Hits response={repo.result.response} query={query} onHit={open} /></div>
        </>
      : <p className="m-0 text-xs font-medium text-ink-muted">No matches in the repository either.</p>}
  </div>

  return <div role="region" aria-label="Search results" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-0.5">
    {body}
    {diff.result?.response?.truncated && <p className="m-0 px-2 py-1 text-[11px] text-ink-muted">Showing the first 500 matches.</p>}
    <RepoFileDialog sessionId={sessionId} target={dialog} onClose={() => setDialog(null)} />
  </div>
}
