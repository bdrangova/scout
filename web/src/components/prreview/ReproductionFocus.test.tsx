import { fireEvent, render, screen } from '@testing-library/react'
import { createElement, useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makePrReport } from '@review-dash/shared/testing/pr-review'
import { orderedEvidence } from './reproduction-evidence'
import { ReproductionFocus } from './ReproductionFocus'

// jsdom cannot build media-chrome's styles; the controller keeps its tag so the arrow-key guard can see it.
vi.mock('media-chrome/react', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    MediaController: ({ children }: { children?: ReactNode }) => createElement('media-controller', null, children),
    MediaControlBar: passthrough,
    MediaPlayButton: passthrough,
    MediaTimeRange: passthrough,
    MediaTimeDisplay: passthrough,
    MediaMuteButton: passthrough,
    MediaFullscreenButton: passthrough,
  }
})

const base = makePrReport().findings[0]!
const finding = {
  ...base,
  reproduction: {
    ...base.reproduction,
    steps: [{ id: 's1', instruction: 'Open the plan.' }, { id: 's2', instruction: 'Submit a declined payment.' }],
    evidence: [
      { path: 'after.png', kind: 'screenshot' as const, caption: 'Plan changed', stepId: 's2', capturedAt: '2026-10-23T10:02:00Z', revision: base.reproduction.revision },
      { path: 'flow.webm', kind: 'video' as const, caption: 'Declined payment flow', stepId: 's1', capturedAt: '2026-10-23T10:01:00Z', revision: base.reproduction.revision },
    ],
  },
}

function Harness() {
  const [index, setIndex] = useState<number | null>(0)
  return <ReproductionFocus finding={finding} items={orderedEvidence(finding.reproduction)} srcOf={(e) => `/media/${e.path}`} index={index} onIndexChange={setIndex} />
}

describe('ReproductionFocus', () => {
  it('plays a video item in step order, and the arrows move on only outside the player', () => {
    render(<Harness />)
    expect(screen.getByText('Step 1/2')).toBeTruthy()
    expect(screen.getByTestId('video-player').querySelector('video')?.getAttribute('src')).toBe('/media/flow.webm')

    fireEvent.keyDown(screen.getByTestId('video-player').querySelector('video')!, { key: 'ArrowRight' })
    expect(screen.getByTestId('video-player')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(screen.queryByTestId('video-player')).toBeNull()
    expect(screen.getByText('Step 2/2')).toBeTruthy()
  })
})
