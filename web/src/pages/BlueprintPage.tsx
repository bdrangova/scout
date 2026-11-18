import { blueprintDiagramFiles, findBlueprintPackage, liveEntries, parseBlueprintDiagramId, type BlueprintMember, type TreeFile } from '@scout/shared'
import { Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AsyncBoundary } from '@/components/common/AsyncBoundary'
import { EmptyState } from '@/components/common/EmptyState'
import { BlueprintGroupsEmpty } from '@/components/blueprint/BlueprintGroupsEmpty'
import { BlueprintStaleNotice } from '@/components/blueprint/BlueprintStaleNotice'
import { BlueprintDeck } from '@/components/blueprint/BlueprintDeck'
import { BlueprintViewSwitch } from '@/components/blueprint/BlueprintViewSwitch'
import { BlueprintDiagramView } from '@/components/blueprint/BlueprintDiagramView'
import { BlueprintRailSection } from '@/components/blueprint/BlueprintRailSection'
import { chainOfDiagram, parentDiagramId } from '@/components/blueprint/blueprint-nav'
import { describeBoxes } from '@/components/blueprint/box-info'
import { useApproveAll } from '@/components/blueprint/useApproveAll'
import { useSelection } from '@/components/blueprint/useSelection'
import { useOpenCommentRefs } from '@/components/layout/commented-only'
import { useFileCategories } from '@/components/files/useFileCategories'
import {
  BLUEPRINT_AT_PARAM,
  BLUEPRINT_FILE_PARAM,
  BLUEPRINT_SELECTION_PARAM,
  BLUEPRINT_VIEW_PARAM,
  blueprintDiagramOf,
  blueprintRoute,
  blueprintViewOf,
  blueprintViewRoot,
  groupingOfDiagram,
  loadBlueprintSelection,
  orderBlueprintSelection,
  saveBlueprintSelection,
  useBlueprint,
  useBlueprintLayout,
  type BlueprintView,
} from '@/lib/blueprint'
import { isTestRunDetail } from '@/lib/detail-kind'
import { indexByPath } from '@/lib/scope'
import { requestLineJump } from '@/lib/line-jump'
import { useSessionContext } from '@/lib/session-context'
import { useJournalState } from '@/state/journal-context'

const MAIN = 'flex h-[calc(100dvh-var(--shell-h))] min-w-0 flex-1 flex-col'

/** The change as a diagram of packages and files: a free-form canvas to walk through before reviewing on the Files page. */
export function BlueprintPage() {
  const { sessionId, detail } = useSessionContext()
  if (isTestRunDetail(detail)) {
    return (
      <main className={MAIN}>
        <div className="px-8 py-12">
          <EmptyState icon={Workflow} title="No blueprint for a test run" description="Blueprint maps the files of a code change; a test run has scenarios instead." />
        </div>
      </main>
    )
  }
  return <BlueprintContent sessionId={sessionId} treeFiles={detail.tree.files} />
}

function BlueprintContent({ sessionId, treeFiles }: { sessionId: string; treeFiles: readonly TreeFile[] }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const blueprint = useBlueprint(sessionId, true, true)
  const layoutState = useBlueprintLayout(sessionId)
  const { journal } = useJournalState()
  const { verdictOf } = useFileCategories(treeFiles)
  const openComments = useOpenCommentRefs('file')
  // Select mode lives here, above the diagram, so the picks survive moving between diagrams.
  const selection = useSelection()
  const approveAll = useApproveAll(treeFiles)
  const at = searchParams.get(BLUEPRINT_AT_PARAM)
  const atRef = parseBlueprintDiagramId(at)
  const atGrouping = groupingOfDiagram(at)
  // The view the page is in: `?at=` wins over `?view=` when it names a grouping or a folder (an around-a-file diagram keeps the view).
  const view: BlueprintView = atGrouping ?? (atRef?.type === 'package' ? 'folders' : blueprintViewOf(searchParams.get(BLUEPRINT_VIEW_PARAM)))
  const { blueprint: analysis, root, groupTrees } = blueprint
  const diagramId = at ?? blueprintViewRoot(view)
  const diagram = useMemo(() => blueprintDiagramOf({ blueprint: analysis, root, groupTrees }, diagramId), [analysis, root, groupTrees, diagramId])
  const tree = view === 'folders' ? undefined : groupTrees[view]
  // The packages the outline and the breadcrumb follow: the grouping's, or the folders'.
  const navRoot = tree?.root ?? root
  const loading = blueprint.loading || (view !== 'folders' && blueprint.groupsLoading)
  const error = blueprint.error ?? (view !== 'folders' ? blueprint.groupsError : null)

  const summaries = useMemo(() => {
    const byPath = new Map<string, string>()
    for (const entry of liveEntries(journal)) if (entry.kind === 'summary' && entry.file !== null && !byPath.has(entry.file)) byPath.set(entry.file, entry.title)
    return byPath
  }, [journal])

  const infos =
    diagram && analysis
      ? describeBoxes({
          diagram,
          blueprint: analysis,
          treeFiles,
          verdictOf,
          summaryOf: (path) => summaries.get(path) ?? null,
          commentsOf: (path) => openComments.get(path) ?? 0,
          purposeOf: (dir) => (tree ? (findBlueprintPackage(tree.root, dir)?.purpose ?? null) : null),
        })
      : null

  const go = useCallback((id: string) => navigate(blueprintRoute(sessionId, id, view)), [sessionId, navigate, view])
  // Switching the view starts at that view's root: `?at=` is dropped.
  const switchView = useCallback((next: BlueprintView) => navigate(blueprintRoute(sessionId, blueprintViewRoot(next))), [sessionId, navigate])
  // The cards over the diagram: `?file=` is the open card, `?sel=` says the deck is the picked files. Opening pushes an entry, moving between cards replaces it.
  const fileParam = searchParams.get(BLUEPRINT_FILE_PARAM)
  const selKey = searchParams.get(BLUEPRINT_SELECTION_PARAM)
  const treeByPath = useMemo(() => indexByPath(treeFiles), [treeFiles])
  const deckFiles = useMemo(() => {
    if (!diagram) return null
    const paths = selKey === null ? blueprintDiagramFiles(diagram) : loadBlueprintSelection(sessionId, selKey)
    const listed = (paths ?? []).flatMap((path) => treeByPath.get(path) ?? [])
    return listed.length > 0 ? listed : null
  }, [diagram, selKey, sessionId, treeByPath])
  const deckOpen = fileParam !== null && deckFiles !== null && deckFiles.some((file) => file.path === fileParam)
  const deckInvalid = fileParam !== null && !loading && !error && diagram !== null && !deckOpen
  const deckSearch = useCallback(
    (file: string | null, sel: string | null) => {
      const params = new URLSearchParams(searchParams)
      for (const [name, value] of [[BLUEPRINT_FILE_PARAM, file], [BLUEPRINT_SELECTION_PARAM, sel]] as const) {
        if (value === null) params.delete(name)
        else params.set(name, value)
      }
      const query = params.toString()
      return query === '' ? '' : `?${query}`
    },
    [searchParams],
  )
  // An unknown file or unreadable picks: the diagram alone.
  useEffect(() => {
    if (deckInvalid) navigate({ search: deckSearch(null, null) }, { replace: true })
  }, [deckInvalid, deckSearch, navigate])
  const openDeck = useCallback((path: string, sel: string | null) => navigate({ search: deckSearch(path, sel) }, { state: { bpDeck: true } }), [deckSearch, navigate])
  const stepDeck = useCallback((path: string) => navigate({ search: deckSearch(path, selKey) }, { replace: true, state: location.state }), [deckSearch, selKey, navigate, location.state])
  // Closing returns to the entry the cards were opened from (the diagram as it was); after a reload or a pasted link the params are simply dropped.
  const closeDeck = useCallback(() => {
    if ((location.state as { bpDeck?: boolean } | null)?.bpDeck === true) navigate(-1)
    else navigate({ search: deckSearch(null, null) }, { replace: true })
  }, [location.state, deckSearch, navigate])

  const openFile = useCallback((path: string) => openDeck(path, null), [openDeck])
  // "View all": the cards of exactly the picked files; the list rides in sessionStorage, the URL only carries its key.
  const viewSelected = useCallback(
    (paths: readonly string[]) => {
      if (!diagram) return
      const ordered = orderBlueprintSelection(new Set(paths), blueprintDiagramFiles(diagram))
      if (ordered.length === 0) return
      openDeck(ordered[0] ?? '', saveBlueprintSelection(sessionId, ordered))
    },
    [sessionId, diagram, openDeck],
  )
  const openMember = useCallback(
    (path: string, member: BlueprintMember) => {
      requestLineJump(path, member.side, member.line)
      openFile(path)
    },
    [openFile],
  )

  const empty = analysis === null || analysis.files.length === 0
  const viewSwitch = <BlueprintViewSwitch view={view} onChange={switchView} />
  // An id that names no diagram (a stale link, a regrouped-away group) falls back to the root of its view, or the whole change.
  if (!loading && !error && !empty && diagram === null && at !== null) {
    return <Navigate to={blueprintRoute(sessionId, atGrouping === null ? null : blueprintViewRoot(atGrouping))} replace />
  }
  // The agent has not grouped this way yet: how to ask for it, instead of the canvas.
  if (!loading && !error && !empty && view !== 'folders' && tree === undefined && at === null) {
    return (
      <main className={MAIN}>
        <div role="toolbar" aria-label="Blueprint" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b-fine border-line px-4 py-2 md:px-6">
          {viewSwitch}
        </div>
        <BlueprintGroupsEmpty sessionId={sessionId} type={view} />
      </main>
    )
  }
  const chain = diagram && navRoot ? chainOfDiagram(navRoot, diagram.ref) : []
  return (
    <main className={MAIN}>
      {navRoot && diagram && <BlueprintRailSection key={tree ? view : 'folders'} root={navRoot} groups={tree !== undefined} currentDir={chain.at(-1)?.dir ?? ''} onSelect={go} />}
      <AsyncBoundary
        loading={loading || layoutState.loading}
        error={error}
        onRetry={blueprint.reload}
        errorLabel="Couldn't load the blueprint"
        className="px-6 py-6"
        empty={empty || diagram === null || infos === null}
        emptyState={
          <div className="px-8 py-12">
            <EmptyState icon={Workflow} title="No files changed" description="There is nothing to draw until the session has changed files." />
          </div>
        }
      >
        {navRoot && diagram && infos && (
          <BlueprintDiagramView
            key={diagram.id}
            sessionId={sessionId}
            diagram={diagram}
            chain={chain}
            infos={infos}
            layout={layoutState.layout}
            save={layoutState.save}
            onNavigate={go}
            onOpenFile={openFile}
            onOpenMember={openMember}
            selection={selection}
            approveAll={approveAll}
            onViewSelected={viewSelected}
            keysSuspended={deckOpen}
            parentId={parentDiagramId(navRoot, diagram.ref)}
            viewSwitch={viewSwitch}
            notice={tree?.stale && view !== 'folders' ? <BlueprintStaleNotice sessionId={sessionId} type={view} ungrouped={tree.ungrouped.length} gone={tree.gone.length} /> : undefined}
          />
        )}
      </AsyncBoundary>
      {deckOpen && deckFiles !== null && fileParam !== null && (
        <BlueprintDeck
          sessionId={sessionId}
          files={deckFiles}
          title={selKey === null ? (diagram?.title ?? '') : `${deckFiles.length} selected ${deckFiles.length === 1 ? 'file' : 'files'}`}
          currentPath={fileParam}
          onNavigate={stepDeck}
          stacked={selKey !== null}
          onClose={closeDeck}
        />
      )}
    </main>
  )
}
