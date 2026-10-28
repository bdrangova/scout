import type { Verdict } from '@scout/shared'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useExitDirection } from './deck-motion'

type Sig = { verdict: Verdict; openComments: number }

function setup(signatures: Record<string, Sig>) {
  return renderHook(({ key }: { key: string }) => useExitDirection(key, (id) => signatures[id] ?? { verdict: 'none', openComments: 0 }), { initialProps: { key: 'a' } })
}

describe('useExitDirection', () => {
  it('starts with a fade', () => {
    expect(setup({}).result.current).toBe('none')
  })

  it('flies right when the card that left was approved, left when it was rejected', () => {
    const signatures: Record<string, Sig> = { a: { verdict: 'none', openComments: 0 }, b: { verdict: 'none', openComments: 0 } }
    const { result, rerender } = setup(signatures)
    // The verdict and the move to the next card land in the same render, like the reducer's advance.
    signatures.a = { verdict: 'approved', openComments: 0 }
    rerender({ key: 'b' })
    expect(result.current).toBe('right')

    signatures.b = { verdict: 'rejected', openComments: 0 }
    rerender({ key: 'a' })
    expect(result.current).toBe('left')
  })

  it('lifts off after a comment-only advance and fades otherwise', () => {
    const signatures: Record<string, Sig> = { a: { verdict: 'none', openComments: 0 } }
    const { result, rerender } = setup(signatures)
    signatures.a = { verdict: 'none', openComments: 1 }
    rerender({ key: 'b' })
    expect(result.current).toBe('up')

    // Moving on without having touched the card fades it.
    rerender({ key: 'c' })
    expect(result.current).toBe('none')
  })
})
