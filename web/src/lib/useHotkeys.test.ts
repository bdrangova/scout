import { describe, expect, it } from 'vitest'
import { hotkeyFor } from './useHotkeys'

function key(overrides: Partial<Parameters<typeof hotkeyFor>[0]>) {
  return hotkeyFor({ key: '', metaKey: false, ctrlKey: false, altKey: false, target: null, defaultPrevented: false, ...overrides })
}

describe('hotkeyFor', () => {
  it('maps the review keys', () => {
    expect(key({ key: 'ArrowLeft' })).toBe('prev')
    expect(key({ key: 'ArrowRight' })).toBe('next')
    expect(key({ key: '[' })).toBe('prevScope')
    expect(key({ key: ']' })).toBe('nextScope')
    expect(key({ key: 'a' })).toBe('approve')
    expect(key({ key: 'A' })).toBe('approve')
    expect(key({ key: 'x' })).toBe('reject')
    expect(key({ key: 'r' })).toBe('reject')
    expect(key({ key: 'c' })).toBe('comment')
    expect(key({ key: 'Escape' })).toBe('cancel')
    expect(key({ key: 's' })).toBe('toggleMode')
    expect(key({ key: 'g' })).toBe('toggleGrid')
    expect(key({ key: 'B' })).toBe('toggleSidebar')
    expect(key({ key: 'h' })).toBe('toggleMerges')
    expect(key({ key: '3' })).toBe('section3')
    expect(key({ key: '?' })).toBe('help')
    expect(key({ key: '?', ctrlKey: true, shiftKey: true })).toBe('altHelp')
    expect(key({ key: '/', ctrlKey: true, shiftKey: true })).toBe('altHelp')
    expect(key({ key: '?', ctrlKey: true })).toBe('altHelp')
    expect(key({ key: '/', ctrlKey: true })).toBeNull()
    expect(key({ key: '?', metaKey: true, shiftKey: true })).toBeNull()
    expect(key({ key: 'q' })).toBeNull()
  })

  it('maps Shift+arrows to the evidence keys and leaves the plain arrows alone', () => {
    expect(key({ key: 'ArrowLeft', shiftKey: true })).toBe('prevEvidence')
    expect(key({ key: 'ArrowRight', shiftKey: true })).toBe('nextEvidence')
    expect(key({ key: 'ArrowLeft', shiftKey: false })).toBe('prev')
  })

  it('ignores modifier combinations except ⌘/Ctrl+Enter', () => {
    expect(key({ key: 'a', metaKey: true })).toBeNull()
    expect(key({ key: 'a', ctrlKey: true })).toBeNull()
    expect(key({ key: 'a', altKey: true })).toBeNull()
    expect(key({ key: 'Enter', metaKey: true })).toBe('submitComment')
    expect(key({ key: 'Enter', ctrlKey: true })).toBe('submitComment')
    expect(key({ key: 'Enter' })).toBeNull()
  })

  it('ignores keys while typing, except ⌘/Ctrl+Enter', () => {
    const textarea = document.createElement('textarea')
    expect(key({ key: 'a', target: textarea })).toBeNull()
    expect(key({ key: 'Escape', target: textarea })).toBeNull()
    expect(key({ key: 'Enter', metaKey: true, target: textarea })).toBe('submitComment')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    expect(key({ key: 'x', target: editable })).toBeNull()
  })

  it('ignores keys typed inside a shadow root: the window sees the host, the path has the field', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const field = document.createElement('textarea')
    shadow.append(field)
    // What a window listener gets: `target` retargeted to the host, the field only on the composed path.
    expect(key({ key: 'h', target: host })).toBe('toggleMerges')
    expect(key({ key: 'h', target: host, composedPath: () => [field, shadow, host] })).toBeNull()
    expect(key({ key: 'r', target: host, composedPath: () => [field, shadow, host] })).toBeNull()
    expect(key({ key: 'Enter', metaKey: true, target: host, composedPath: () => [field, shadow, host] })).toBe('submitComment')
  })

  it('maps Z and ⌘/Ctrl+Z to undo, except in a field (its own undo) and with Shift (redo)', () => {
    expect(key({ key: 'z' })).toBe('undo')
    expect(key({ key: 'Z' })).toBe('undo')
    expect(key({ key: 'z', metaKey: true })).toBe('undo')
    expect(key({ key: 'z', ctrlKey: true })).toBe('undo')
    expect(key({ key: 'z', metaKey: true, shiftKey: true })).toBeNull()
    expect(key({ key: 'z', ctrlKey: true, target: document.createElement('textarea') })).toBeNull()
    expect(key({ key: 'z', target: document.createElement('input') })).toBeNull()
  })

  it('skips events something else already handled', () => {
    expect(key({ key: 'a', defaultPrevented: true })).toBeNull()
  })
})
