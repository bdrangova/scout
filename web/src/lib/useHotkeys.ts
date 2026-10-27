import { useEffect, useRef } from 'react'
import { isTypingTarget } from './keyboard'

export type Hotkey =
  | 'prev'
  | 'next'
  | 'prevScope'
  | 'nextScope'
  | 'approve'
  | 'reject'
  | 'comment'
  | 'undo'
  | 'submitComment'
  | 'cancel'
  | 'toggleMode'
  | 'toggleGrid'
  | 'toggleSidebar'
  | 'toggleMerges'
  | 'toggleNotes'
  | 'section1'
  | 'section2'
  | 'section3'
  | 'section4'
  | 'section5'
  | 'section6'
  | 'toggleKind'
  | 'prevScenario'
  | 'nextScenario'
  | 'prevEvidence'
  | 'nextEvidence'
  | 'help'
  | 'altHelp'

export type HotkeyHandlers = Partial<Record<Hotkey, () => void>>

type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target' | 'defaultPrevented'> & {
  shiftKey?: boolean
  /** `event.composedPath`: lets a field inside a shadow root count as the typing target. */
  composedPath?: () => EventTarget[]
}

/**
 * The hotkey a key press maps to, or null. Ignored while typing in inputs, textareas and
 * contenteditable elements (also inside shadow roots), except ⌘/Ctrl+Enter. ⌘/Ctrl+Z is the undo
 * shortcut and, like the single keys, leaves a text field's own undo alone. `?` is `help` (Skills); Ctrl+? is `altHelp` (the shortcuts help).
 */
export function hotkeyFor(event: KeyLike): Hotkey | null {
  if (event.defaultPrevented) return null
  const command = event.metaKey || event.ctrlKey
  if (command && event.key === 'Enter') return 'submitComment'
  const typing = isTypingTarget(event.target, event.composedPath?.())
  if (command && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'z') return typing ? null : 'undo'
  // Ctrl+? (Ctrl+Shift+/); some layouts report '/' with Shift held. Not ⌘?, the browser's Help menu.
  if (event.ctrlKey && !event.metaKey && !event.altKey && (event.key === '?' || (event.shiftKey && event.key === '/'))) return typing ? null : 'altHelp'
  if (command || event.altKey) return null
  if (typing) return null
  switch (event.key) {
    case 'ArrowLeft':
      return event.shiftKey ? 'prevEvidence' : 'prev'
    case 'ArrowRight':
      return event.shiftKey ? 'nextEvidence' : 'next'
    case '[':
      return 'prevScope'
    case ']':
      return 'nextScope'
    case 'a':
    case 'A':
      return 'approve'
    case 'x':
    case 'X':
    case 'r':
    case 'R':
      return 'reject'
    case 'c':
    case 'C':
      return 'comment'
    case 'z':
    case 'Z':
      return 'undo'
    case 'Escape':
      return 'cancel'
    case 's':
    case 'S':
      return 'toggleMode'
    case 'g':
    case 'G':
      return 'toggleGrid'
    case 'b':
    case 'B':
      return 'toggleSidebar'
    case 'h':
    case 'H':
      return 'toggleMerges'
    case 'n':
    case 'N':
      return 'toggleNotes'
    case '1':
      return 'section1'
    case '2':
      return 'section2'
    case '3':
      return 'section3'
    case '4':
      return 'section4'
    case '5':
      return 'section5'
    case '6':
      return 'section6'
    case 'j':
    case 'J':
      return 'nextScenario'
    case 'k':
    case 'K':
      return 'prevScenario'
    case 't':
    case 'T':
      return 'toggleKind'
    case '?':
      return 'help'
    default:
      return null
  }
}

/** Binds page-level shortcuts on `window`; only the keys with a handler are consumed. */
export function useHotkeys(handlers: HotkeyHandlers, enabled = true): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      const hotkey = hotkeyFor(event)
      if (hotkey === null) return
      const handler = handlersRef.current[hotkey]
      if (!handler) return
      event.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
