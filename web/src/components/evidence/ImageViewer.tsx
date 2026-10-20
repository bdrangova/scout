import { Maximize, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'
import { Button } from '@/components/ui/button'

export interface ImageViewerProps {
  src: string
  alt: string
}

const ZOOM_BUTTON = 'size-8 rounded-md shadow-icon hover:bg-yellow hover:text-on-yellow'

function Controls({ scale }: { scale: number }) {
  const { zoomIn, zoomOut, fitToView } = useControls()
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 rounded-xl border-fine border-line bg-surface py-[5px] pr-1.5 pl-3 shadow-raised"
    >
      <span className="min-w-[34px] font-mono text-xs font-medium text-ink-muted tabular-nums" aria-label="Zoom level" title="Zoom level">
        {Math.round(scale * 100)}%
      </span>
      <Button size="icon-sm" className={ZOOM_BUTTON} aria-label="Zoom out" title="Zoom out" onClick={() => void zoomOut()}>
        <Minus aria-hidden className="size-3.5" />
      </Button>
      <Button size="icon-sm" className={ZOOM_BUTTON} aria-label="Zoom in" title="Zoom in" onClick={() => void zoomIn()}>
        <Plus aria-hidden className="size-3.5" />
      </Button>
      <Button size="icon-sm" className={ZOOM_BUTTON} aria-label="Fit to view" title="Fit to view" onClick={() => void fitToView({ mode: 'contain' })}>
        <Maximize aria-hidden className="size-3.5" />
      </Button>
    </div>
  )
}

/** Screenshot viewer on checkered paper, filling the height the card gives it so it fits the viewport (U10): fits the image initially, wheel zooms, drag pans, double-click resets to 100%, Fit refits. */
export function ImageViewer({ src, alt }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  return (
    <div
      className="relative min-h-[clamp(240px,50svh,480px)] w-full flex-1 overflow-hidden min-[900px]:min-h-0 rounded-xl border-fine border-line bg-[repeating-conic-gradient(var(--sunken)_0_25%,var(--paper)_0_50%)] bg-[length:16px_16px]"
      data-testid="image-viewer"
    >
      <TransformWrapper
        fitOnInit
        centerOnInit
        minScale={0.05}
        maxScale={8}
        wheel={{ step: 0.15 }}
        doubleClick={{ mode: 'reset' }}
        onTransform={(ref) => setScale(ref.state.scale)}
      >
        <Controls scale={scale} />
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ cursor: 'grab' }}>
          <img src={src} alt={alt} draggable={false} className="block max-w-none select-none" />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
