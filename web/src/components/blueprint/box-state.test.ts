import { describe, expect, it } from 'vitest'
import type { BoxInfo } from './box-info'
import { boxStateOf } from './box-state'

function info(counts: Partial<Pick<BoxInfo, 'approved' | 'rejected' | 'comments' | 'total'>>): BoxInfo {
  return { approved: 0, rejected: 0, comments: 0, total: 3, ...counts } as BoxInfo
}

describe('boxStateOf', () => {
  it('a file: its verdict, else commented when it has open comments', () => {
    expect(boxStateOf(info({ total: 1, rejected: 1, comments: 2 }))).toBe('rejected')
    expect(boxStateOf(info({ total: 1, approved: 1, comments: 2 }))).toBe('approved')
    expect(boxStateOf(info({ total: 1, comments: 2 }))).toBe('commented')
    expect(boxStateOf(info({ total: 1 }))).toBe('none')
  })

  it('a package: nothing until every file has a verdict', () => {
    expect(boxStateOf(info({ approved: 2 }), true)).toBe('none')
    expect(boxStateOf(info({ approved: 1, rejected: 1, comments: 4 }), true)).toBe('none')
    expect(boxStateOf(info({ comments: 4 }), true)).toBe('none')
    expect(boxStateOf(info({ total: 0 }), true)).toBe('none')
  })

  it('a fully reviewed package: rejected when any file is, else approved', () => {
    expect(boxStateOf(info({ approved: 3, comments: 2 }), true)).toBe('approved')
    expect(boxStateOf(info({ approved: 2, rejected: 1 }), true)).toBe('rejected')
  })
})
