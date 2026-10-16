/** True when a key press should be left to a text field instead of a page hotkey. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
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
      { keys: ['⌘', 'Enter'], description: 'Send the comment' },
      { keys: ['Esc'], description: 'Cancel the pending reject' },
    ],
  },
  {
    title: 'Sections',
    entries: [{ keys: ['1', '…', '5'], description: 'Jump to Files, Evidence, Spec, Extras, Submit' }],
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
