import { motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import type { PointerEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cardVariants, SWIPE_OFFSET, SWIPE_VELOCITY, type ExitDirection } from './deck-motion'

interface NavButtonProps {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

/** The round raised arrows beside the deck (hidden on narrow screens, where ←/→ and swiping remain). */
export function NavButton({ label, disabled, onClick, children }: NavButtonProps) {
  return (
    <Button
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="hidden size-[46px] shrink-0 self-center rounded-full hover:bg-yellow hover:text-on-yellow md:inline-flex [&_svg]:size-5"
    >
      {children}
    </Button>
  )
}

interface SwipeFrameProps {
  exitDirection: ExitDirection
  onCommit: (direction: 'left' | 'right') => void
  /** The card; `startDrag` goes on its header (a press on a button, link or field there is left alone). */
  children: (startDrag: (event: PointerEvent<HTMLDivElement>) => void) => ReactNode
}

/** Owns its own motion values so an exiting card never shares them with the next one. */
export function SwipeFrame({ exitDirection, onCommit, children }: SwipeFrameProps) {
  const controls = useDragControls()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-320, 0, 320], [-9, 0, 9])
  const opacity = useTransform(x, [-360, -140, 0, 140, 360], [0.35, 1, 1, 1, 0.35])

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Buttons in the header (the layout toggle) keep working as buttons.
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return
    controls.start(event)
  }

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) onCommit('right')
    else if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) onCommit('left')
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, rotate, opacity }}
      drag="x"
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      custom={exitDirection}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {children(startDrag)}
    </motion.div>
  )
}
