import { describe, expect, it } from 'vitest'
import { nowYear, toYear } from './time'

describe('toYear', () => {
  it('places a bare year at mid-year', () => {
    expect(toYear('1950')).toBe(1950.5)
  })
  it('places a month at the middle of that month', () => {
    const t = toYear('1956-06')
    expect(t).toBeGreaterThan(1956 + 151 / 365)
    expect(t).toBeLessThan(1956 + 181 / 365)
  })
  it('orders days correctly across a leap February', () => {
    expect(toYear('2024-02-29')).toBeGreaterThan(toYear('2024-02-28'))
    expect(toYear('2024-03-01')).toBeGreaterThan(toYear('2024-02-29'))
  })
  it('keeps every day inside its year', () => {
    expect(toYear('2023-01-01')).toBeGreaterThan(2023)
    expect(toYear('2023-12-31')).toBeLessThan(2024)
  })
})

describe('nowYear', () => {
  it('returns a fractional year in UTC', () => {
    expect(nowYear(new Date(Date.UTC(2026, 0, 1)))).toBe(2026)
    const mid = nowYear(new Date(Date.UTC(2026, 6, 2, 12)))
    expect(mid).toBeGreaterThan(2026.49)
    expect(mid).toBeLessThan(2026.51)
  })
})
