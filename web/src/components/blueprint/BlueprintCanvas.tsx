import { useCallback, useRef, type ReactNode, type Ref, type RefObject } from 'react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { MAX_SCALE, MIN_SCALE, type View } from './fit-view'

const GRID = 22

/** Zooming needs Ctrl or Cmd (a trackpad pinch arrives as Ctrl + wheel); plain scrolling pans. */
function zoomChord(keys: string[]): boolean {
  return keys.includes('Control') || keys.includes('Meta')
}

export interface BlueprintCanvasProps {
  label: string
  transformRef: Ref<ReactZoomPanPinchContentRef>
  /** The element whose size is the visible area. */
  viewportRef: RefObject<HTMLDivElement | null>
  /** The element the boxes are positioned in (measured for their sizes). */
  contentRef: RefObject<HTMLDivElement | null>
  extent: { w: number; h: number }
  /** False while the first layout is measured and the view is placed: the boxes stay invisible. */
  ready: boolean
  onInit: () => void
  onTransform: (view: View) => void
  children: ReactNode
}

/**
 * The pan and zoom surface: drag the background to pan, scroll or two-finger scroll to pan, pinch or Ctrl/Cmd + wheel to zoom,
 * with no bounds. A dotted grid sits behind the content and moves with it. Boxes carry the `bp-box` class, which the panning skips.
 */
export function BlueprintCanvas({ label, transformRef, viewportRef, contentRef, extent, ready, onInit, onTransform, children }: BlueprintCanvasProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const handleTransform = useCallback(
    (_ref: unknown, state: { scale: number; positionX: number; positionY: number }) => {
      const view: View = { x: state.positionX, y: state.positionY, scale: state.scale }
      const grid = gridRef.current
      if (grid) {
        grid.style.backgroundSize = `${GRID * view.scale}px ${GRID * view.scale}px`
        grid.style.backgroundPosition = `${view.x}px ${view.y}px`
      }
      onTransform(view)
    },
    [onTransform],
  )
  return (
    <div ref={viewportRef} role="region" aria-label={label} className="relative min-h-0 flex-1 overflow-hidden bg-paper" data-slot="blueprint-canvas">
      <div
        ref={gridRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1.2px)', backgroundSize: `${GRID}px ${GRID}px` }}
      />
      <TransformWrapper
        ref={transformRef}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        initialScale={1}
        limitToBounds={false}
        smooth
        wheel={{ step: 0.1, activationKeys: zoomChord }}
        trackPadPanning={{ disabled: false, velocityDisabled: true }}
        panning={{ excluded: ['bp-box'], velocityDisabled: true }}
        doubleClick={{ disabled: true }}
        onInit={onInit}
        onTransform={handleTransform}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ cursor: 'grab' }}>
          <div ref={contentRef} className="relative" style={{ width: extent.w, height: extent.h, visibility: ready ? 'visible' : 'hidden' }}>
            {children}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
