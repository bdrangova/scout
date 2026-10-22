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

/** The shortcut list of a session kind: `sectionLabels` are its tabs in order (the `1-n` keys), `modes` adds the Files page's swipe/grid keys. */
export function hotkeyGroupsFor(sectionLabels: readonly string[], modes: boolean, scenarios = false): readonly HotkeyGroup[] {
  if (scenarios) return testRunGroups(sectionLabels)
  return BASE_GROUPS.flatMap((group): HotkeyGroup[] => {
    if (group.title === 'Sections') {
      return [{ title: 'Sections', entries: [{ keys: ['1', '…', String(sectionLabels.length)], description: `Jump to ${sectionLabels.join(', ')}` }] }]
    }
    return group.title === 'Mode' && !modes ? [] : [group]
  })
}

/** A test run's list: the Files page's keys with scenarios (arrows, J/K, A / X / C / Z, ⇧ arrows for the evidence), the card keys on Gaps, Logs and Data setup, S / G for swipe and grid, the section keys everywhere. */
function testRunGroups(sectionLabels: readonly string[]): readonly HotkeyGroup[] {
  return [
    {
      title: 'Navigation',
      entries: [
        { keys: ['J', 'K'], description: 'Next / previous scenario (Review), card (Gaps, Logs, Data setup)' },
        { keys: ['←', '→'], description: 'Previous / next scenario (Review), card (Gaps, Logs, Data setup)' },
        { keys: ['⇧', '←', '→'], description: 'Previous / next evidence in the scenario (Review)' },
        { keys: ['B'], description: 'Show / hide the sidebar' },
        { keys: ['?'], description: 'Show this help' },
      ],
    },
    {
      title: 'Verdicts',
      entries: [
        { keys: ['A'], description: 'Approve the current scenario; again to clear it (Review)' },
        { keys: ['X', 'R'], description: 'Reject the current scenario, with a comment; again to clear it (Review)' },
        { keys: ['C'], description: 'Write a comment on the current scenario (Review)' },
        { keys: ['Z'], description: 'Undo the last verdict (Review)' },
        { keys: ['⌘', 'Enter'], description: 'Send the comment' },
        { keys: ['Esc'], description: 'Cancel the pending reject (Review)' },
      ],
    },
    { title: 'Sections', entries: [{ keys: ['1', '…', String(sectionLabels.length)], description: `Jump to ${sectionLabels.join(', ')}` }] },
    {
      title: 'Mode',
      entries: [
        { keys: ['S'], description: 'Swipe: one scenario / card at a time' },
        { keys: ['G'], description: 'Grid of all scenarios / cards' },
      ],
    },
    { title: 'Video', entries: [{ keys: ['Space'], description: 'Play / pause' }] },
  ]
}

const BASE_GROUPS: readonly HotkeyGroup[] = [
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
    entries: [],
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

/** The single source of the shortcut list, as `ShortcutHelp` shows it: the code review's. */
export const HOTKEY_GROUPS: readonly HotkeyGroup[] = hotkeyGroupsFor(
  SECTIONS.map((name) => name[0]?.toUpperCase() + name.slice(1)),
  true,
)
