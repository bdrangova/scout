import { describe, expect, it } from 'vitest'
import { arrowGeometry, type Rect } from './arrow-path'

const box = (x: number, y: number): Rect => ({ x, y, w: 200, h: 100 })

describe('arrowGeometry', () => {
  it('leaves the top of a box that sits below its target and arrives at the target bottom', () => {
    const { d } = arrowGeometry(box(0, 300), box(0, 0), 0, 100)
    expect(d.startsWith('M100 300 ')).toBe(true)
    expect(d.endsWith(' 100 109')).toBe(true)
  })

  it('leaves the bottom of a box that sits above its target and arrives at the target top', () => {
    const { d } = arrowGeometry(box(0, 0), box(0, 300), 0, 100)
    expect(d.startsWith('M100 100 ')).toBe(true)
    expect(d.endsWith(' 100 291')).toBe(true)
  })

  it('goes through the sides when the boxes sit level', () => {
    const right = arrowGeometry(box(0, 0), box(400, 0), 0, 300)
    expect(right.d.startsWith('M200 30 ')).toBe(true)
    expect(right.d.endsWith(' 391 30')).toBe(true)
    const left = arrowGeometry(box(400, 0), box(0, 0), 0, 300)
    expect(left.d.startsWith('M400 30 ')).toBe(true)
    expect(left.d.endsWith(' 209 30')).toBe(true)
  })

  it('slides the arrival point along the target edge with the fan offset', () => {
    const left = arrowGeometry(box(0, 300), box(0, 0), -0.5, 100)
    const right = arrowGeometry(box(0, 300), box(0, 0), 0.5, 100)
    expect(left.d.endsWith(' 40 109')).toBe(true)
    expect(right.d.endsWith(' 160 109')).toBe(true)
  })

  it('puts the label between the two ends', () => {
    const { label } = arrowGeometry(box(0, 0), box(0, 300), 0, 100)
    expect(label.x).toBe(100)
    expect(label.y).toBe((100 + 291) / 2)
  })

  it('bows long upward arrows away from the middle of the diagram', () => {
    const near = arrowGeometry(box(0, 600), box(0, 0), 0, 1000)
    const far = arrowGeometry(box(1800, 600), box(1800, 0), 0, 1000)
    const bowOf = (d: string) => Number(d.split(' ')[2]?.replace('C', '')) - Number(d.split(' ')[0]?.replace('M', ''))
    expect(bowOf(near.d)).toBeLessThan(0)
    expect(bowOf(far.d)).toBeGreaterThan(0)
  })
})
