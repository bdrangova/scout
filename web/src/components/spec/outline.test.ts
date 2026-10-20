import { describe, expect, it } from 'vitest'
import { extractHeadings } from './outline'

describe('extractHeadings', () => {
  it('lists second- and third-level headings, not the title', () => {
    expect(extractHeadings('# Title\n\n## Approach\ntext\n### Steps\n#### Deep\n')).toEqual([
      { text: 'Approach', occurrence: 0 },
      { text: 'Steps', occurrence: 0 },
    ])
  })

  it('skips headings inside code fences, including a longer fence around a shorter one', () => {
    const source = ['## Real', '```md', '## Not a heading', '```', '````', '```', '## Still code', '```', '````', '## After'].join('\n')
    expect(extractHeadings(source).map((heading) => heading.text)).toEqual(['Real', 'After'])
  })

  it('strips inline markup and trailing hashes, and numbers repeated headings', () => {
    expect(extractHeadings('## The `api` **layer** ##\n## [Docs](http://x)\n## Docs')).toEqual([
      { text: 'The api layer', occurrence: 0 },
      { text: 'Docs', occurrence: 0 },
      { text: 'Docs', occurrence: 1 },
    ])
  })

  it('returns nothing for a file without headings', () => {
    expect(extractHeadings('just text\n\n- a list')).toEqual([])
  })
})
