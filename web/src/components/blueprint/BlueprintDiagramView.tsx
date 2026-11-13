import {
  blueprintDiagramId,
  type BlueprintDiagram,
  type BlueprintDiagramLayout,
  type BlueprintLayout,
  type BlueprintMember,
  type BlueprintPackage,
  type BlueprintPoint,
} from '@scout/shared'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { isTypingTarget } from '@/lib/keyboard'
import type { Rect } from './arrow-path'
import { BlueprintArrows } from './BlueprintArrows'
import { BlueprintCanvas } from './BlueprintCanvas'
import { BlueprintToolbar } from './BlueprintToolbar'
import type { BoxInfo } from './box-info'
import { FILE_BOX_WIDTH, FileBox } from './FileBox'
import { fitView, type View } from './fit-view'
import { PACKAGE_BOX_WIDTH, PackageBox } from './PackageBox'
import { useBoxDrag } from './useBoxDrag'
import { useBoxSizes } from './useBoxSizes'
import { useDiagramLayout } from './useDiagramLayout'
import { savedDiagramLayout, useDiagramPersistence } from './useDiagramPersistence'

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
}

/** One diagram on the canvas: measures the boxes, lays them out, lets the user move them, and keeps the arrangement and view. Remount it per diagram. */
export function BlueprintDiagramView({ sessionId, diagram, chain, infos, layout, save, onNavigate, onOpenFile, onOpenMember, parentId }: BlueprintDiagramViewProps) {
  const [details, setDetails] = useState(true)
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
  const { sizes, measured } = useBoxSizes(contentRef, `${details}|${diagram.boxes.map((box) => box.key).join(',')}`)
  const arrangement = useDiagramLayout({ diagram, sizes, maxRowWidth: rowWidth, saved, persistence })
  const { positions } = arrangement

  const rects = useMemo(() => {
    const result: Record<string, Rect> = {}
    for (const box of diagram.boxes) {
      const at: BlueprintPoint = positions[box.key] ?? { x: 0, y: 0 }
      const size = sizes[box.key]
      result[box.key] = { x: at.x, y: at.y, w: size?.w ?? (box.ref.type === 'dir' ? PACKAGE_BOX_WIDTH : FILE_BOX_WIDTH), h: size?.h ?? FALLBACK_HEIGHT }
    }
    return result
  }, [diagram, positions, sizes])
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
  })

  function tidy() {
    arrangement.reset()
    setTidyCount((count) => count + 1)
  }

  // Esc goes up a level, F fits; typing and modified keys are left alone.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target, event.composedPath())) return
      if (event.key === 'Escape' && parentId !== null) onNavigate(parentId)
      else if (event.key === 'f' || event.key === 'F') fit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit, onNavigate, parentId])

  const near = useMemo(() => {
    if (active === null) return null
    const set = new Set([active])
    for (const arrow of diagram.arrows) {
      if (arrow.from === active) set.add(arrow.to)
      if (arrow.to === active) set.add(arrow.from)
    }
    return set
  }, [active, diagram])

  const all = [...infos.values()]
  const shell = (key: string) => ({
    x: positions[key]?.x ?? 0,
    y: positions[key]?.y ?? 0,
    dim: near !== null && !near.has(key),
    dragging: drag.draggingKey === key,
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
        details={details}
        onNavigate={onNavigate}
        onZoomIn={() => void transformRef.current?.zoomIn()}
        onZoomOut={() => void transformRef.current?.zoomOut()}
        onFit={fit}
        onTidy={tidy}
        onToggleDetails={() => setDetails((value) => !value)}
      />
      <BlueprintCanvas
        label={`Blueprint diagram: ${diagram.title}`}
        transformRef={transformRef}
        viewportRef={viewportRef}
        contentRef={contentRef}
        extent={extent}
        ready={ready}
        onInit={() => setLibraryReady(true)}
        onTransform={onTransform}
      >
        <BlueprintArrows diagram={diagram} rects={rects} active={active} />
        {diagram.boxes.map((box) => {
          const info = infos.get(box.key)
          if (!info) return null
          return box.ref.type === 'dir' ? (
            <PackageBox key={box.key} info={info} details={details} onOpen={(dir) => onNavigate(blueprintDiagramId({ type: 'package', dir }))} {...shell(box.key)} />
          ) : (
            <FileBox
              key={box.key}
              info={info}
              details={details}
              center={diagram.center === box.key}
              showOutside={diagram.center === null}
              onOpenFile={onOpenFile}
              onOpenMember={onOpenMember}
              onAround={(path) => onNavigate(blueprintDiagramId({ type: 'around', path }))}
              {...shell(box.key)}
            />
          )
        })}
      </BlueprintCanvas>
    </>
  )
}
