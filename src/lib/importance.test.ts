import { describe, expect, it } from 'vitest'
import { computeScore, tierOf } from '../../scripts/importance.mjs'

describe('computeScore', () => {
  it('maps the rubric onto 0 to 100', () => {
    expect(computeScore({ rubric: { a: 1, b: 1, c: 1, d: 1 } })).toBe(0)
    expect(computeScore({ rubric: { a: 5, b: 5, c: 5, d: 5 } })).toBe(100)
  })
  it('lifts events that are extreme on one axis', () => {
    const spiky = computeScore({ rubric: { a: 2, b: 2, c: 5, d: 5 } })
    const flat = computeScore({ rubric: { a: 3.5, b: 3.5, c: 3.5, d: 3.5 } })
    expect(spiky).toBeGreaterThan(flat)
  })
  it('lets an override win', () => {
    expect(computeScore({ rubric: { a: 1, b: 1, c: 1, d: 1 }, override: 90 })).toBe(90)
  })
})

describe('tierOf', () => {
  it('maps scores onto tiers', () => {
    expect(tierOf(100)).toBe(1)
    expect(tierOf(85)).toBe(1)
    expect(tierOf(84)).toBe(2)
    expect(tierOf(40)).toBe(3)
    expect(tierOf(0)).toBe(4)
  })
})
