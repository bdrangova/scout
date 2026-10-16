import { describe, expect, it } from 'vitest'
import { EvidenceItemSchema, ExtraItemSchema, SpecItemSchema } from '../schemas/artifacts.ts'
import { deriveEvidence } from './evidence.ts'
import { deriveExtras } from './extras.ts'
import { mergeIndex } from './merge-index.ts'
import { deriveSpec } from './spec.ts'
import { deriveTitle, firstHeading, htmlTitle } from './titles.ts'
import { evidenceTypeFromPath, extraTypeFromPath, mimeFromPath, specTypeFromPath } from './types.ts'

describe('mergeIndex', () => {
  it('puts indexed files first by order then index position, then the rest sorted by name', () => {
    const merged = mergeIndex(['z.png', 'b.png', 'a.png', 'c.png'], [{ file: 'c.png' }, { file: 'z.png', order: 0 }, { file: 'b.png', order: 5 }])
    expect(merged.map((m) => [m.file, m.entry !== null, m.order])).toEqual([
      ['z.png', true, 0],
      ['b.png', true, 1],
      ['c.png', true, 2],
      ['a.png', false, 3],
    ])
  })

  it('drops index entries whose file is missing and duplicates', () => {
    const merged = mergeIndex(['a.png'], [{ file: 'gone.png' }, { file: 'a.png' }, { file: 'a.png', order: 0 }])
    expect(merged.map((m) => m.file)).toEqual(['a.png'])
    expect(merged[0]?.entry?.order).toBe(0)
  })

  it('works without an index', () => {
    expect(mergeIndex(['b', 'a'], null).map((m) => m.file)).toEqual(['a', 'b'])
  })
})

describe('types by extension', () => {
  it('classifies evidence, extras and spec files', () => {
    expect(evidenceTypeFromPath('shots/Trial.PNG')).toBe('image')
    expect(evidenceTypeFromPath('flow.webm')).toBe('video')
    expect(evidenceTypeFromPath('index.json')).toBeNull()
    expect(extraTypeFromPath('arch.md')).toBe('markdown')
    expect(extraTypeFromPath('report.html')).toBe('html')
    expect(extraTypeFromPath('graph.mermaid')).toBe('mermaid')
    expect(extraTypeFromPath('data.json')).toBeNull()
    expect(specTypeFromPath('design.html')).toBe('artifact')
    expect(specTypeFromPath('jira-QI-1.md')).toBe('jira')
    expect(specTypeFromPath('JIRA.md')).toBe('jira')
    expect(specTypeFromPath('plan.md')).toBe('markdown')
    expect(specTypeFromPath('index.json')).toBeNull()
    expect(specTypeFromPath('.md')).toBeNull()
  })

  it('maps mime types', () => {
    expect(mimeFromPath('a/b.PNG')).toBe('image/png')
    expect(mimeFromPath('flow.webm')).toBe('video/webm')
    expect(mimeFromPath('x.md')).toBe('text/markdown; charset=utf-8')
    expect(mimeFromPath('notes.xyz')).toBeNull()
  })
})

describe('titles', () => {
  it('finds headings and html titles', () => {
    expect(firstHeading('intro\n# Architecture  \ntext')).toBe('Architecture')
    expect(firstHeading('## not top level')).toBeNull()
    expect(htmlTitle('<html><head><title> Report </title></head></html>')).toBe('Report')
    expect(htmlTitle('<title></title>')).toBeNull()
  })

  it('falls back from explicit to content to filename', () => {
    expect(deriveTitle('a/arch.md', ' Given ', '# Heading')).toBe('Given')
    expect(deriveTitle('a/arch.md', '', '# Heading')).toBe('Heading')
    expect(deriveTitle('a/arch.md', null, 'no heading')).toBe('arch.md')
    expect(deriveTitle('a/r.html', undefined, '<title>R</title>')).toBe('R')
    expect(deriveTitle('a/g.mmd', undefined, 'graph TD')).toBe('g.mmd')
    expect(deriveTitle('a/arch.md', undefined, null)).toBe('arch.md')
  })
})

describe('deriveEvidence', () => {
  it('merges the index, ignores non-media files and defaults the caption to the filename', () => {
    const items = deriveEvidence(['b.png', 'a.webm', 'index.json', 'notes.txt'], {
      items: [{ file: 'a.webm', caption: 'Checkout flow', description: 'Full run' }, { file: 'gone.png', caption: 'x' }],
    })
    expect(items).toEqual([
      { path: 'a.webm', type: 'video', caption: 'Checkout flow', description: 'Full run', order: 0 },
      { path: 'b.png', type: 'image', caption: 'b.png', description: null, order: 1 },
    ])
    for (const item of items) expect(EvidenceItemSchema.parse(item)).toEqual(item)
  })

  it('handles nested paths without an index', () => {
    expect(deriveEvidence(['shots/2.png', 'shots/1.png'], null).map((i) => i.path)).toEqual(['shots/1.png', 'shots/2.png'])
  })
})

describe('deriveExtras', () => {
  it('reads content only when the index gives no title', () => {
    const reads: string[] = []
    const items = deriveExtras(['report.html', 'arch.md', 'graph.mmd', 'skip.json'], { items: [{ file: 'arch.md', title: 'Architecture' }] }, (file) => {
      reads.push(file)
      return file === 'report.html' ? '<title>Report</title>' : 'x'
    })
    expect(items).toEqual([
      { path: 'arch.md', type: 'markdown', title: 'Architecture' },
      { path: 'graph.mmd', type: 'mermaid', title: 'graph.mmd' },
      { path: 'report.html', type: 'html', title: 'Report' },
    ])
    expect(reads).toEqual(['graph.mmd', 'report.html'])
    for (const item of items) expect(ExtraItemSchema.parse(item)).toEqual(item)
  })
})

describe('deriveSpec', () => {
  it('defaults the type from the filename and takes index metadata', () => {
    const items = deriveSpec(
      ['jira.md', 'design.html', 'plan.md'],
      { items: [{ file: 'plan.md', type: 'artifact', title: 'Plan', url: 'https://x/y', sourcePath: '/tmp/plan.md', capturedAt: '2026-09-26T18:30:00.000Z' }] },
      (file) => (file === 'jira.md' ? '# QI-1 Trial bar' : null),
    )
    expect(items).toEqual([
      { path: 'plan.md', type: 'artifact', title: 'Plan', url: 'https://x/y', sourcePath: '/tmp/plan.md', capturedAt: '2026-09-26T18:30:00.000Z' },
      { path: 'design.html', type: 'artifact', title: 'design.html', url: null, sourcePath: null, capturedAt: null },
      { path: 'jira.md', type: 'jira', title: 'QI-1 Trial bar', url: null, sourcePath: null, capturedAt: null },
    ])
    for (const item of items) expect(SpecItemSchema.parse(item)).toEqual(item)
  })
})
