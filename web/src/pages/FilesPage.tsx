import { effectiveVerdict, nextUnreviewedFile, type Scope, type TreeFile } from '@review-dash/shared'
import { FileCheck } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { CardDeck } from '@/components/diff/CardDeck'
import { clearVerdictUndo, undoLastVerdict, useVerdictAction } from '@/components/diff/useVerdictAction'
import { ScrollList } from '@/components/diff/ScrollList'
import { FileGrid } from '@/components/files/FileGrid'
import { FilesRailSection } from '@/components/files/FilesRailSection'
import { ReviewComplete } from '@/components/files/ReviewComplete'
import { CommitTimeline } from '@/components/timeline/CommitTimeline'
import { useCommits, useScopeTree } from '@/lib/hooks'
import { isCardMode, MODE_PARAM, parseMode, readLastCardMode, rememberCardMode } from '@/lib/mode'
import { fileRoute } from '@/lib/paths'
import { indexByPath, parseScope, resolveScope, SCOPE_PARAM, searchString, stepScope, withScope, type ScopeReview } from '@/lib/scope'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { useHotkeys, type HotkeyHandlers } from '@/lib/useHotkeys'
import { useMergesHidden } from '@/lib/useMergesHidden'
import { useReview } from '@/state/review-context'

/** The last non-null value seen (a scope's files stay on screen while the next scope loads). */
function useLastValue<T>(value: T | null): T | null {
  const [kept, setKept] = useState(value)
  if (value !== null && value !== kept) setKept(value)
  return value ?? kept
}

export function FilesPage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const { state, dispatch } = useReview()
  const sendVerdict = useVerdictAction()
  const params = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [mergesHidden, toggleMerges] = useMergesHidden()
  const mode = parseMode(searchParams.get(MODE_PARAM))
  const search = searchString(searchParams)
  // The full diff: the live tree, where verdicts live. A file that disappears from it simply vanishes.
  const fullFiles = detail.tree.files
  const fullByPath = useMemo(() => indexByPath(fullFiles), [fullFiles])
  // The scope (`?commit=`): a commit the loaded list knows, or the uncommitted changes; else the full diff.
  const commitsState = useCommits(sessionId)
  const scopeParam = parseScope(searchParams.get(SCOPE_PARAM))
  const scope = resolveScope(scopeParam, commitsState.commits)
  const scopeTree = useScopeTree(sessionId, scope)
  const scopeFiles = useLastValue(scopeTree.tree?.files ?? null)
  const scopeReady = scope === null || scopeTree.tree !== null
  const files = scope === null ? fullFiles : (scopeFiles ?? fullFiles)
  const splat = params['*'] ?? ''
  const urlFile = files.find((file) => file.path === splat) ?? null
  const urlPath = urlFile?.path ?? null
  const stateFile = state.review.ui.currentFile
  const statePath = stateFile !== null && files.some((file) => file.path === stateFile) ? stateFile : null
  const [commentFocusToken, bumpCommentFocus] = useReducer((count: number) => count + 1, 0)
  const previousRef = useRef<{ url: string | null; state: string | null } | null>(null)

  // The undo belongs to this page: leaving it drops the toast.
  useEffect(() => clearVerdictUndo, [])

  // A scope the commit list cannot serve (a sha no longer in range): back to the full diff.
  useEffect(() => {
    if (scopeParam === null || scope !== null) return
    navigate({ pathname: location.pathname, search: searchString(withScope(searchParams, null)) }, { replace: true })
  }, [scopeParam, scope, navigate, location.pathname, searchParams])

  // URL ↔ `review.ui.currentFile`: when the URL moves (a link, the back button, the first render)
  // the review follows; when only the review moves (advance, a hotkey) the URL follows. Decided
  // from the values of the previous commit, so StrictMode's double-invoked mount stays idempotent.
  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = { url: urlPath, state: statePath }
    if (urlPath === null || urlPath === statePath) return
    const urlMoved = previous === null || previous.url !== urlPath
    const stateMoved = previous !== null && previous.state !== statePath
    if (stateMoved && !urlMoved && statePath !== null) {
      navigate({ pathname: fileRoute(sessionId, statePath), search }, { replace: true })
    } else {
      dispatch({ type: 'GO_TO', path: urlPath })
    }
  }, [urlPath, statePath, dispatch, navigate, sessionId, search])

  // Viewed is tracked by path, for files the full diff knows.
  useEffect(() => {
    if (urlPath !== null && mode !== 'grid' && fullByPath.has(urlPath)) dispatch({ type: 'MARK_VIEWED', path: urlPath })
  }, [urlPath, mode, dispatch, fullByPath])

  useEffect(() => {
    if (state.review.ui.mode !== mode) dispatch({ type: 'SET_MODE', mode })
    // What the grid's tiles open, and what `G` returns to.
    if (isCardMode(mode)) rememberCardMode(mode)
  }, [mode, state.review.ui.mode, dispatch])

  // Nothing left to review: the view gives way to the end panel, only in the full-diff view (a
  // scope's end is not the review's) and only while that holds (a file the agent changed since
  // comes back as unreviewed). Any `GO_TO` (a step, the tree, "Back to files") leaves it.
  const ended = state.atEnd && scope === null && nextUnreviewedFile(state.review, fullFiles) === null

  function goTo(path: string) {
    dispatch({ type: 'GO_TO', path })
  }

  /** Switch the scope, keeping the mode and the current file (it is re-resolved once the scope has loaded). */
  function selectScope(next: Scope | null) {
    navigate({ pathname: location.pathname, search: searchString(withScope(searchParams, next)) })
  }

  // In a scope the reducer's own advance (over the full diff) is overridden by the scope's next
  // unreviewed file, judged against the full-diff fingerprints; files it does not know are skipped.
  const scopeReview: ScopeReview | undefined =
    scope === null
      ? undefined
      : {
          scope,
          fullFile: (path) => fullByPath.get(path) ?? null,
          advanceFrom: (path) => {
            const reviewable = files.map((file) => fullByPath.get(file.path)).filter((file): file is TreeFile => file !== undefined)
            const review = { ...state.review, ui: { ...state.review.ui, currentFile: path } }
            dispatch({ type: 'GO_TO', path: nextUnreviewedFile(review, reviewable) ?? path })
          },
        }

  /** A grid tile: back to the card mode the grid was opened from, on that file. */
  function openInCards(path: string) {
    const next = new URLSearchParams(searchParams)
    next.set(MODE_PARAM, readLastCardMode())
    navigate({ pathname: fileRoute(sessionId, path), search: `?${next.toString()}` })
  }

  /** A verdict is pinned to the full diff's fingerprint of the path, never to a scope file's. */
  function setVerdict(file: TreeFile, verdict: 'approved' | 'rejected') {
    const reviewFile = fullByPath.get(file.path)
    if (!reviewFile) return
    const withComment = sendVerdict(file.path, verdict, reviewFile.fingerprint)
    if (verdict === 'approved' || withComment) scopeReview?.advanceFrom(file.path)
  }

  // At the end a step with no neighbour still leaves the end panel, on the current file.
  function stepBy(delta: number) {
    if (!urlFile) return
    const next = files[files.indexOf(urlFile) + delta] ?? (ended ? urlFile : undefined)
    if (next) goTo(next.path)
  }

  // In the grid the card keys are left alone (a focused tile handles `A` and Enter itself).
  const stepHotkeys: HotkeyHandlers = {
    prev: () => stepBy(-1),
    next: () => stepBy(1),
  }
  // Behind the end panel the cards are out of reach: the verdict keys do nothing.
  const cardHotkeys: HotkeyHandlers = {
    ...stepHotkeys,
    approve: () => {
      if (urlFile) setVerdict(urlFile, 'approved')
    },
    reject: () => {
      if (!urlFile || !fullByPath.has(urlFile.path)) return
      setVerdict(urlFile, 'rejected')
      bumpCommentFocus()
    },
    comment: bumpCommentFocus,
  }

  useHotkeys({
    ...(isCardMode(mode) ? (ended ? stepHotkeys : cardHotkeys) : {}),
    prevScope: () => selectScope(stepScope(commitsState.commits, scope, -1, mergesHidden)),
    nextScope: () => selectScope(stepScope(commitsState.commits, scope, 1, mergesHidden)),
    undo: undoLastVerdict,
    cancel: () => dispatch({ type: 'CANCEL_REJECT' }),
    toggleMerges: () => toast.info(toggleMerges() ? 'Merge commits hidden' : 'Merge commits shown'),
  })

  const first = files[0]

  // Keep the current file in the URL: the review's own current file while it still needs a verdict
  // (after the last approval it stays on the last file, and a file the agent changed since comes
  // back as unreviewed elsewhere), else the next unreviewed file, else the current one, else the first.
  if (urlFile === null && first && scopeReady) {
    const current = statePath === null ? undefined : fullByPath.get(statePath)
    const settled = current !== undefined && effectiveVerdict(state.review.files[current.path], current) !== 'none'
    const unreviewed = settled ? nextUnreviewedFile(state.review, fullFiles) : null
    const opening = unreviewed !== null && files.some((file) => file.path === unreviewed) ? unreviewed : (statePath ?? first.path)
    return <Navigate to={{ pathname: fileRoute(sessionId, opening), search }} replace />
  }

  const timeline = (
    <CommitTimeline
      list={commitsState.commits}
      loading={commitsState.loading}
      error={commitsState.error}
      totals={detail.tree.stats}
      selected={scope}
      onSelect={selectScope}
      scopeLoad={scope === null ? undefined : scopeTree}
      hideMerges={mergesHidden}
    />
  )

  // While a scope loads with no earlier list to show, the current path may be missing: the views tolerate it.
  const currentPath = urlPath ?? splat
  const shared = { files, currentPath, sessionId, onNavigate: goTo, commentFocusToken, scope: scopeReview }

  let content: ReactNode
  if (!first) {
    content = (
      <div className="px-8 py-12">
        <EmptyState
          icon={FileCheck}
          title="No files changed"
          description={
            scope === null ? (
              <>
                Nothing differs in the working tree against <code className="font-mono text-ink">{detail.tree.baseRef}</code>.
              </>
            ) : (
              'This commit scope has no file changes.'
            )
          }
        />
      </div>
    )
  } else if (mode === 'scroll') {
    content = <ScrollList {...shared} />
  } else {
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {mode === 'swipe' && <CardDeck {...shared} />}
        {mode === 'grid' && (
          <FileGrid files={files} reviewFiles={fullFiles} currentPath={currentPath} onOpen={openInCards} onApprove={(file) => setVerdict(file, 'approved')} />
        )}
      </div>
    )
  }

  return (
    <main className="flex h-[calc(100dvh-var(--shell-h))] min-w-0 flex-1 flex-col" data-mode={mode} data-scope={scope ?? undefined}>
      <FilesRailSection files={files} reviewFiles={fullFiles} currentPath={urlPath} onSelect={goTo} />
      {timeline}
      {ended && first ? (
        <ReviewComplete sessionId={sessionId} detail={detail} onBack={() => goTo(currentPath)}>
          {content}
        </ReviewComplete>
      ) : (
        content
      )}
    </main>
  )
}
