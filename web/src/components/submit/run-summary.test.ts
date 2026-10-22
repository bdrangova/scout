import { describe, expect, it } from 'vitest'
import { testRunIndexFixture } from '@/test/fixtures'
import { runSummaryMarkdown } from './run-summary'

describe('runSummaryMarkdown', () => {
  it('takes the markdown panel titled like a summary, else the first markdown panel, else nothing', () => {
    expect(runSummaryMarkdown(testRunIndexFixture)).toEqual({ title: 'Summary', markdown: 'One scenario passed, one failed (bug x) and one could not be tested.' })
    const panels = [
      { type: 'markdown' as const, title: 'Notes', markdown: 'first' },
      { type: 'markdown' as const, markdown: 'second' },
    ]
    expect(runSummaryMarkdown({ ...testRunIndexFixture, overview: panels })).toEqual({ title: 'Notes', markdown: 'first' })
    expect(runSummaryMarkdown({ ...testRunIndexFixture, overview: [{ type: 'markdown', title: 'Run summary', markdown: 'wins' }, ...panels] })?.markdown).toBe('wins')
    expect(runSummaryMarkdown({ ...testRunIndexFixture, overview: [] })).toBeNull()
  })
})
