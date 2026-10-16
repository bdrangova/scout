import { Maximize2, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'
import { Button } from '@/components/ui/button'

export interface ImageViewerProps {
  src: string
  alt: string
}

function Controls({ scale }: { scale: number }) {
  const { zoomIn, zoomOut, fitToView } = useControls()
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border bg-card/95 p-1 shadow-sm backdrop-blur">
      <span className="min-w-11 px-1 text-center font-mono text-[11px] text-muted-foreground" aria-label="Zoom level">
        {Math.round(scale * 100)}%
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => void zoomOut()}>
        <Minus />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => void zoomIn()}>
        <Plus />
      </Button>
      <Button variant="ghost" size="xs" aria-label="Fit to view" onClick={() => void fitToView({ mode: 'contain' })}>
        <Maximize2 data-icon="inline-start" />
        Fit
      </Button>
    </div>
  )
}

/** Screenshot viewer: fits the image initially, wheel zooms, drag pans, double-click resets to 100%, Fit refits. */
export function ImageViewer({ src, alt }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  return (
    <div
      className="relative h-[min(60vh,560px)] w-full overflow-hidden rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
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
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="block max-w-none select-none"
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
