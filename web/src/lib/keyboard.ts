import { SECTIONS } from '@review-dash/shared'

function isEditable(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * True when a key press should be left to a text field instead of a page hotkey. A listener on
 * `window` sees an event from inside a shadow root (the diff viewer) retargeted to the shadow host,
 * so when the event's `composedPath` is given every element on it is checked, not just `target`.
 */
export function isTypingTarget(target: EventTarget | null, path: readonly EventTarget[] = []): boolean {
  return isEditable(target) || path.some(isEditable)
}

export interface HotkeyEntry {
  keys: string[]
  description: string
}

export interface HotkeyGroup {
  title: 'Navigation' | 'Verdicts' | 'Sections' | 'Mode' | 'Video'
  entries: HotkeyEntry[]
}

/** The single source of the shortcut list, as `ShortcutHelp` shows it. */
export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  {
    title: 'Navigation',
    entries: [
      { keys: ['←', '→'], description: 'Previous / next file' },
      { keys: ['[', ']'], description: 'Previous / next commit' },
      { keys: ['H'], description: 'Hide / show merge commits' },
      { keys: ['B'], description: 'Show / hide the file sidebar' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Verdicts',
    entries: [
      { keys: ['A'], description: 'Approve the file' },
      { keys: ['X', 'R'], description: 'Reject the file, with a comment' },
      { keys: ['C'], description: 'Write a comment' },
      { keys: ['Z'], description: 'Undo the last verdict' },
      { keys: ['⌘', 'Enter'], description: 'Send the comment' },
      { keys: ['Esc'], description: 'Cancel the pending reject' },
    ],
  },
  {
    title: 'Sections',
    entries: [{ keys: ['1', '…', '5'], description: `Jump to ${SECTIONS.map((name) => name[0]?.toUpperCase() + name.slice(1)).join(', ')}` }],
  },
  {
    title: 'Mode',
    entries: [
      { keys: ['S'], description: 'Swipe / scroll' },
      { keys: ['G'], description: 'Grid of all files' },
    ],
  },
  {
    title: 'Video',
    entries: [
      { keys: ['Space'], description: 'Play / pause' },
      { keys: ['M'], description: 'Comment at the current time' },
    ],
  },
]
