import {
  blueprintDiagramId,
  type BlueprintBox,
  type BlueprintDiagram,
  type BlueprintDiagramLayout,
  type BlueprintLayout,
  type BlueprintMember,
  type BlueprintPackage,
  type BlueprintPoint,
} from '@scout/shared'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { arrowKindOf, type BoxHide, useArrowKinds, useBoxHides } from '@/lib/blueprint-arrow-prefs'
import { isTypingTarget } from '@/lib/keyboard'
import type { Rect } from './arrow-path'
import { BlueprintArrows } from './BlueprintArrows'
import { BlueprintCanvas } from './BlueprintCanvas'
import { BlueprintToolbar } from './BlueprintToolbar'
import type { BoxInfo } from './box-info'
import { boxStateOf } from './box-state'
import { FILE_BOX_WIDTH, FileBox } from './FileBox'
import { fitView, type View } from './fit-view'
import { PACKAGE_BOX_WIDTH, PackageBox } from './PackageBox'
import { SelectionBar } from './SelectionBar'
import type { ApproveAll } from './useApproveAll'
import { useBoxDrag } from './useBoxDrag'
import { useBoxSizes } from './useBoxSizes'
import { useDiagramLayout } from './useDiagramLayout'
import { savedDiagramLayout, useDiagramPersistence } from './useDiagramPersistence'
import { pickStateOf, type Selection } from './useSelection'

const MIN_ROW_WIDTH = 900
const ROW_WIDTH_MARGIN = 320
const FALLBACK_HEIGHT = 120

export interface BlueprintDiagramViewProps {
  sessionId: string
  diagram: BlueprintDiagram
  chain: readonly BlueprintPackage[]
  infos: ReadonlyMap<string, BoxInfo>
  layout: BlueprintLayout | null
  save: (diagram: string, layout: BlueprintDiagramLayout | null) => Promise<void>
  onNavigate: (diagramId: string) => void
  onOpenFile: (path: string) => void
  onOpenMember: (path: string, member: BlueprintMember) => void
  /** Esc: one level up (null at the top). */
  parentId: string | null
  /** The view switch for the toolbar. */
  viewSwitch?: ReactNode
  /** A slim line between the toolbar and the canvas (a grouping that is out of date). */
  notice?: ReactNode
  /** Select mode and the picked files; they outlive the diagram. */
  selection: Selection
  approveAll: ApproveAll
  /** "View all": opens the cards over the diagram for exactly these files. */
  onViewSelected: (paths: readonly string[]) => void
  /** The cards are open over the diagram: its keys (Esc, F, S) wait. */
  keysSuspended: boolean
}

/** One diagram on the canvas: measures the boxes, lays them out, lets the user move them, and keeps the arrangement and view. Remount it per diagram. */
export function BlueprintDiagramView({ sessionId, diagram, chain, infos, layout, save, onNavigate, onOpenFile, onOpenMember, parentId, viewSwitch, notice, selection, approveAll, onViewSelected, keysSuspended }: BlueprintDiagramViewProps) {
  const [active, setActive] = useState<string | null>(null)
  const [libraryReady, setLibraryReady] = useState(false)
  const [tidyCount, setTidyCount] = useState(0)
  // Rows wrap at about the width the canvas has at 100% (the window less the rail), fixed for this diagram so resizing never reshuffles it.
  const [rowWidth] = useState(() => Math.max(MIN_ROW_WIDTH, window.innerWidth - ROW_WIDTH_MARGIN))
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)
  const scaleRef = useRef(1)
  const placing = useRef(false)
  const placedFor = useRef<number | null>(null)

  const saved = savedDiagramLayout(sessionId, layout, diagram.id)
  const persistence = useDiagramPersistence({ sessionId, diagramId: diagram.id, layout, save })
  const { sizes, measured } = useBoxSizes(contentRef, diagram.boxes.map((box) => box.key).join(','))
  const arrangement = useDiagramLayout({ diagram, sizes, maxRowWidth: rowWidth, saved, persistence })
  const { positions } = arrangement

  // The box switches: approved and files hide those boxes; "only unlinked" hides every box an arrow touches. A hidden box stays laid out and measured, so nothing else moves; it just is not drawn, and neither are its arrows.
  const [hides, toggleHide] = useBoxHides(sessionId)
  const hideOptions = useMemo(() => {
    const dirs = diagram.boxes.some((box) => box.ref.type === 'dir')
    const options: BoxHide[] = ['approved']
    if (diagram.center === null && dirs && diagram.boxes.some((box) => box.ref.type !== 'dir')) options.push('files')
    if (diagram.center === null && diagram.arrows.length > 0 && diagram.boxes.some((box) => box.layer === -1)) options.push('unlinked')
    return options
  }, [diagram])
  const hiddenKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const box of diagram.boxes) {
      if (box.key === diagram.center) continue
      const dir = box.ref.type === 'dir'
      const info = infos.get(box.key)
      const gone =
        (hides.approved && info !== undefined && boxStateOf(info, dir) === 'approved') ||
        (hides.files && hideOptions.includes('files') && !dir) ||
        (hides.unlinked && hideOptions.includes('unlinked') && box.layer !== -1)
      if (gone) keys.add(box.key)
    }
    return keys
  }, [diagram, infos, hides, hideOptions])

  const rects = useMemo(() => {
    const result: Record<string, Rect> = {}
    for (const box of diagram.boxes) {
      if (hiddenKeys.has(box.key)) continue
      const at: BlueprintPoint = positions[box.key] ?? { x: 0, y: 0 }
      const size = sizes[box.key]
      result[box.key] = { x: at.x, y: at.y, w: size?.w ?? (box.ref.type === 'dir' ? PACKAGE_BOX_WIDTH : FILE_BOX_WIDTH), h: size?.h ?? FALLBACK_HEIGHT }
    }
    return result
  }, [diagram, positions, sizes, hiddenKeys])
  const extent = useMemo(() => {
    const all = Object.values(rects)
    return { w: Math.max(1, ...all.map((rect) => rect.x + rect.w)), h: Math.max(1, ...all.map((rect) => rect.y + rect.h)) }
  }, [rects])

  const fit = useCallback(() => {
    const element = viewportRef.current
    if (!element) return
    const view = fitView(Object.values(rects), { w: element.clientWidth, h: element.clientHeight })
    if (view) void transformRef.current?.setTransform(view.x, view.y, view.scale, 0)
  }, [rects])

  // The view is placed before the first paint: the saved one, else everything in sight (and again after "Tidy up").
  const ready = measured && libraryReady
  useLayoutEffect(() => {
    if (!ready || placedFor.current === tidyCount) return
    const first = placedFor.current === null
    placedFor.current = tidyCount
    placing.current = true
    if (first && saved?.viewport) void transformRef.current?.setTransform(saved.viewport.x, saved.viewport.y, saved.viewport.scale, 0)
    else fit()
    // Transforms caused by placing the view are not the user's: they are not saved.
    window.setTimeout(() => {
      placing.current = false
    }, 100)
  }, [ready, tidyCount, saved, fit])

  const onTransform = useCallback(
    (view: View) => {
      scaleRef.current = view.scale
      if (!placing.current) persistence.saveViewport(view)
    },
    [persistence],
  )

  const drag = useBoxDrag({
    getScale: () => scaleRef.current,
    positionOf: (key) => positions[key] ?? { x: 0, y: 0 },
    onMove: arrangement.move,
    onEnd: arrangement.commit,
    enabled: !selection.active,
  })

  function tidy() {
    arrangement.reset()
    setTidyCount((count) => count + 1)
  }

  const { active: selecting, leave, enter } = selection
  // Esc leaves select mode, else goes up a level; F fits; S toggles select mode. Typing and modified keys are left alone, and the open cards own the keyboard.
  useEffect(() => {
    if (keysSuspended) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target, event.composedPath())) return
      if (event.key === 'Escape') {
        if (selecting) leave()
        else if (parentId !== null) onNavigate(parentId)
      } else if (event.key === 'f' || event.key === 'F') fit()
      else if (event.key === 's' || event.key === 'S') {
        if (selecting) leave()
        else enter()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit, onNavigate, parentId, keysSuspended, selecting, leave, enter])

  // Switching a kind of arrow off only hides it: the layout still comes from every link, so the boxes stay put.
  const [arrowKinds, toggleArrowKind] = useArrowKinds(sessionId)
  const arrows = useMemo(() => diagram.arrows.filter((arrow) => arrowKinds[arrowKindOf(arrow)]), [diagram, arrowKinds])

  const near = useMemo(() => {
    if (active === null) return null
    const set = new Set([active])
    for (const arrow of arrows) {
      if (arrow.from === active) set.add(arrow.to)
      if (arrow.to === active) set.add(arrow.from)
    }
    return set
  }, [active, arrows])

  const all = [...infos.values()]
  const diagramFiles = useMemo(() => diagram.boxes.filter((box) => !hiddenKeys.has(box.key)).flatMap((box) => box.files), [diagram, hiddenKeys])
  const shell = (box: BlueprintBox) => ({
    x: positions[box.key]?.x ?? 0,
    y: positions[box.key]?.y ?? 0,
    // Nothing is "unrelated" in select mode: every box is a candidate.
    dim: !selecting && near !== null && !near.has(box.key),
    dragging: drag.draggingKey === box.key,
    hidden: hiddenKeys.has(box.key),
    pick: selecting ? { state: pickStateOf(box.files, selection.selected), onToggle: () => selection.toggle(box.files) } : null,
    onShiftPick: () => enter(box.files),
    onActive: setActive,
    onPointerDown: drag.onPointerDown,
    onClickCapture: drag.onClickCapture,
  })

  return (
    <>
      <BlueprintToolbar
        diagram={diagram}
        chain={chain}
        boxes={diagram.boxes.length}
        files={all.reduce((sum, info) => sum + info.total, 0)}
        reviewed={all.reduce((sum, info) => sum + info.reviewed, 0)}
        selecting={selecting}
        viewSwitch={viewSwitch}
        arrows={arrowKinds}
        onToggleArrow={toggleArrowKind}
        hideOptions={hideOptions}
        hides={hides}
        hidden={hiddenKeys.size}
        onToggleHide={toggleHide}
        onNavigate={onNavigate}
        onZoomIn={() => void transformRef.current?.zoomIn()}
        onZoomOut={() => void transformRef.current?.zoomOut()}
        onFit={fit}
        onTidy={tidy}
        onToggleSelect={() => (selecting ? leave() : enter())}
      />
      {notice}
      <BlueprintCanvas
        label={`Blueprint diagram: ${diagram.title}`}
        transformRef={transformRef}
        viewportRef={viewportRef}
        contentRef={contentRef}
        extent={extent}
        ready={ready}
        onInit={() => setLibraryReady(true)}
        onTransform={onTransform}
        overlay={
          selecting && (
            <SelectionBar
              count={selection.selected.size}
              approved={approveAll.done ? { count: approveAll.done.count, onUndo: approveAll.undo } : null}
              onViewAll={() => onViewSelected([...selection.selected])}
              onApproveAll={() => {
                approveAll.approve([...selection.selected])
                selection.clear()
              }}
              onSelectAll={() => selection.add(diagramFiles)}
              onDeselectAll={selection.clear}
              onDone={leave}
            />
          )
        }
      >
        <BlueprintArrows arrows={arrows} rects={rects} active={active} />
        {diagram.boxes.map((box) => {
          const info = infos.get(box.key)
          if (!info) return null
          return box.ref.type === 'dir' ? (
            <PackageBox key={box.key} info={info} onOpen={(dir) => onNavigate(blueprintDiagramId({ type: 'package', dir }))} {...shell(box)} />
          ) : (
            <FileBox
              key={box.key}
              info={info}
              center={diagram.center === box.key}
              showOutside={diagram.center === null}
              onOpenFile={onOpenFile}
              onOpenMember={onOpenMember}
              onAround={(path) => onNavigate(blueprintDiagramId({ type: 'around', path }))}
              {...shell(box)}
            />
          )
        })}
      </BlueprintCanvas>
    </>
  )
}
