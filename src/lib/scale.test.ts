import { describe, expect, it } from 'vitest'
import type { Era } from './eras'
import { buildScale, type ScaleOptions } from './scale'

const eras: Era[] = [
  { id: 'new', name: 'New', start: 2020 },
  { id: 'old', name: 'Old', start: 1950, end: 2020 },
]
const opts: ScaleOptions = { basePx: 100, perEventPx: 50, topPad: 10, bottomPad: 20 }

describe('buildScale', () => {
  it('gives each band height in proportion to its events', () => {
    const s = buildScale(eras, [2021, 2022, 2023, 1960], 2026, 1, opts)
    expect(s.bands[0].count).toBe(3)
    expect(s.bands[0].height).toBe(250)
    expect(s.bands[1].count).toBe(1)
    expect(s.bands[1].height).toBe(150)
    expect(s.height).toBe(10 + 250 + 150 + 20)
  })

  it('scales band heights with zoom', () => {
    const a = buildScale(eras, [2021], 2026, 1, opts)
    const b = buildScale(eras, [2021], 2026, 3, opts)
    expect(b.bands[0].height).toBe(a.bands[0].height * 3)
  })

  it('puts now at the top and newer events higher', () => {
    const s = buildScale(eras, [2021], 2026, 1, opts)
    expect(s.y(2026)).toBe(10)
    expect(s.y(2024)).toBeLessThan(s.y(2021))
    expect(s.y(2021)).toBeLessThan(s.y(1990))
  })

  it('is linear inside a band', () => {
    const s = buildScale(eras, [], 2026, 1, opts)
    const band = s.bands[1]
    expect(s.y(1985)).toBeCloseTo(band.top + band.height / 2)
  })

  it('inverts y back to the year', () => {
    const s = buildScale(eras, [2021, 1960], 2026, 2, opts)
    for (const year of [2025.3, 2020.5, 1999, 1951]) {
      expect(s.year(s.y(year))).toBeCloseTo(year, 6)
    }
  })

  it('clamps years outside the range', () => {
    const s = buildScale(eras, [], 2026, 1, opts)
    expect(s.y(2030)).toBe(10)
    expect(s.y(1900)).toBe(s.bands[1].top + s.bands[1].height)
  })

  it('spaces ticks at least the minimum gap apart within a band', () => {
    const s = buildScale(eras, [], 2026, 1, opts)
    const old = s.ticks(30).filter((t) => t.year < 2020)
    expect(old.length).toBeGreaterThan(1)
    for (let i = 1; i < old.length; i++) expect(Math.abs(old[i].y - old[i - 1].y)).toBeGreaterThanOrEqual(30 - 1e-9)
  })
})
