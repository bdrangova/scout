import { describe, expect, it } from 'vitest'
import { PrSyncError, type GhRunner } from '../pr/gh.ts'
import { extractTicketKeys, fetchPrFacts } from './pr-facts.ts'

describe('extractTicketKeys', () => {
  it('returns unique keys in order of first appearance across the texts', () => {
    expect(extractTicketKeys('Fix QI-15472 and AB2-9', 'feature/QI-15472-bar', 'Relates to CORE-7, QI-15472.\nSee ab-1 and utf-8')).toEqual(['QI-15472', 'AB2-9', 'CORE-7'])
  })
  it('ignores lowercase, single-letter prefixes and embedded matches', () => {
    expect(extractTicketKeys('a-1 x-2 fooQI-3 QI-4bar ok-5')).toEqual([])
  })
})

describe('fetchPrFacts', () => {
  const payload = { title: 'QI-1 Add bar', body: null, author: { login: 'bo' }, labels: [{ name: 'ui' }], headRefName: 'feature/qi-2-bar', baseRefName: 'main', createdAt: '2026-10-01T10:00:00Z', isDraft: true, commits: [{}, {}], url: 'https://github.com/a/b/pull/3' }

  it('maps gh output to the overview facts', async () => {
    const calls: (readonly string[])[] = []
    const gh: GhRunner = async (args) => {
      calls.push(args)
      return JSON.stringify(payload)
    }
    const facts = await fetchPrFacts({ pr: '3', cwd: '/repo', gh })
    expect(calls[0]?.slice(0, 3)).toEqual(['pr', 'view', '3'])
    expect(facts).toEqual({
      title: 'QI-1 Add bar', description: '', author: 'bo', headRef: 'feature/qi-2-bar', baseRef: 'main', labels: ['ui'], draft: true, openedAt: '2026-10-01T10:00:00Z', commits: 2,
      tickets: [{ key: 'QI-1', title: null, url: null }, { key: 'QI-2', title: null, url: null }],
    })
  })

  it('maps a gh failure to a PrSyncError', async () => {
    const gh: GhRunner = async () => {
      throw new Error('boom')
    }
    await expect(fetchPrFacts({ pr: '3', cwd: '/repo', gh })).rejects.toBeInstanceOf(PrSyncError)
  })
})
