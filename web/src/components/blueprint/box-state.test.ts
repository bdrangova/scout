import { describe, expect, it } from 'vitest'
import type { BoxInfo } from './box-info'
import { boxStateOf } from './box-state'

function info(counts: Partial<Pick<BoxInfo, 'approved' | 'rejected' | 'comments' | 'total'>>): BoxInfo {
  return { approved: 0, rejected: 0, comments: 0, total: 3, ...counts } as BoxInfo
}

describe('boxStateOf', () => {
  it('is rejected as soon as one file is, even beside approvals and comments', () => {
    expect(boxStateOf(info({ approved: 2, rejected: 1, comments: 4 }))).toBe('rejected')
  })

  it('is approved only once every file is', () => {
    expect(boxStateOf(info({ approved: 3 }))).toBe('approved')
    expect(boxStateOf(info({ approved: 2 }))).toBe('none')
  })

  it('is commented when files carry open comments and no verdict settles it', () => {
    expect(boxStateOf(info({ approved: 1, comments: 2 }))).toBe('commented')
    expect(boxStateOf(info({ approved: 3, comments: 2 }))).toBe('approved')
  })

  it('is nothing for an untouched or empty box', () => {
    expect(boxStateOf(info({}))).toBe('none')
    expect(boxStateOf(info({ total: 0 }))).toBe('none')
  })
})
