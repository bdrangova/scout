import { liveEntries, type BlueprintMember, type TreeFile } from '@scout/shared'
import { Workflow } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { AsyncBoundary } from '@/components/common/AsyncBoundary'
import { EmptyState } from '@/components/common/EmptyState'
import { BlueprintDiagramView } from '@/components/blueprint/BlueprintDiagramView'
import { BlueprintRailSection } from '@/components/blueprint/BlueprintRailSection'
import { chainOfDiagram, parentDiagramId } from '@/components/blueprint/blueprint-nav'
import { describeBoxes } from '@/components/blueprint/box-info'
import { useFileCategories } from '@/components/files/useFileCategories'
import { BLUEPRINT_AT_PARAM, blueprintDiagramOf, blueprintRoute, useBlueprint, useBlueprintLayout, withBlueprint } from '@/lib/blueprint'
import { isTestRunDetail } from '@/lib/detail-kind'
import { MODE_PARAM, readLastCardMode } from '@/lib/mode'
import { fileRoute } from '@/lib/paths'
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
  const [searchParams] = useSearchParams()
  const blueprint = useBlueprint(sessionId)
  const layoutState = useBlueprintLayout(sessionId)
  const { journal } = useJournalState()
  const { verdictOf } = useFileCategories(treeFiles)
  const at = searchParams.get(BLUEPRINT_AT_PARAM)
  const { blueprint: analysis, root } = blueprint
  const diagram = useMemo(() => blueprintDiagramOf({ blueprint: analysis, root }, at), [analysis, root, at])

  const summaries = useMemo(() => {
    const byPath = new Map<string, string>()
    for (const entry of liveEntries(journal)) if (entry.kind === 'summary' && entry.file !== null && !byPath.has(entry.file)) byPath.set(entry.file, entry.title)
    return byPath
  }, [journal])

  const infos =
    diagram && analysis ? describeBoxes({ diagram, blueprint: analysis, treeFiles, verdictOf, summaryOf: (path) => summaries.get(path) ?? null }) : null

  const go = useCallback((id: string) => navigate(blueprintRoute(sessionId, id)), [sessionId, navigate])
  const openFile = useCallback(
    (path: string) => {
      const params = withBlueprint(new URLSearchParams(), diagram?.id ?? null)
      params.set(MODE_PARAM, readLastCardMode())
      navigate({ pathname: fileRoute(sessionId, path), search: `?${params.toString()}` })
    },
    [sessionId, diagram, navigate],
  )
  const openMember = useCallback(
    (path: string, member: BlueprintMember) => {
      requestLineJump(path, member.side, member.line)
      openFile(path)
    },
    [openFile],
  )

  const empty = analysis === null || analysis.files.length === 0
  // An id that names no diagram (a stale link) falls back to the whole change.
  if (!blueprint.loading && !blueprint.error && !empty && diagram === null && at !== null) {
    return <Navigate to={blueprintRoute(sessionId)} replace />
  }
  const chain = diagram && root ? chainOfDiagram(root, diagram.ref) : []
  return (
    <main className={MAIN}>
      {root && diagram && <BlueprintRailSection root={root} currentDir={chain.at(-1)?.dir ?? ''} onSelect={go} />}
      <AsyncBoundary
        loading={blueprint.loading || layoutState.loading}
        error={blueprint.error}
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
        {root && diagram && infos && (
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
            parentId={parentDiagramId(root, diagram.ref)}
          />
        )}
      </AsyncBoundary>
    </main>
  )
}
