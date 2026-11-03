import { describe, expect, it } from 'vitest'
import type { Era } from './eras'
import { buildScale, effectiveCount, type ScaleOptions } from './scale'

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
    const s = buildScale(eras, [], 2026, 1, { ...opts, unitPx: 30 })
    const old = s.ticks().filter((t) => t.year < 2020)
    expect(old.length).toBeGreaterThan(1)
    for (let i = 1; i < old.length; i++) expect(Math.abs(old[i].y - old[i - 1].y)).toBeGreaterThanOrEqual(30 - 1e-9)
  })

  it('leaves a header strip at the top of each band before its time starts', () => {
    const s = buildScale(eras, [2021], 2026, 2, { ...opts, headerPx: 40 })
    const [a, b] = s.bands
    expect(a.height).toBe(40 + 150 * 2)
    expect(s.y(2026)).toBe(a.top + 40)
    expect(s.y(2019.999999)).toBeCloseTo(b.top + 40, 3)
    expect(s.year(b.top + 10)).toBe(2020)
    for (const year of [2025.3, 2020.5, 1999, 1951]) expect(s.year(s.y(year))).toBeCloseTo(year, 6)
  })

  describe('compressing empty stretches', () => {
    // Old era: 70 years, 1 event in 1990, so 150px and ~2.1px a year: 20-year units.
    const gapOpts = { ...opts, unitPx: 40, gapPx: 30, minGapUnits: 2 }

    it('squeezes runs of empty units into a gap', () => {
      const s = buildScale(eras, [2021, 1990], 2026, 1, gapOpts)
      const old = s.bands[1]
      expect(old.step).toBe(20)
      const gaps = old.segments.filter((g) => g.gap)
      // 1950 to 1980 is empty: units 1960-1980 and 1950-1960.
      expect(gaps).toEqual([expect.objectContaining({ from: 1980, to: 1950, height: 30 })])
      expect(old.height).toBeLessThan(150)
      expect(s.gaps).toContainEqual(gaps[0])
    })

    it('leaves a single empty unit alone', () => {
      const s = buildScale(eras, [2021, 1990, 1965], 2026, 1, gapOpts)
      expect(s.bands[1].segments.some((g) => g.gap)).toBe(false)
    })

    it('keeps y and year consistent across gaps', () => {
      const s = buildScale(eras, [2021, 1990], 2026, 1, gapOpts)
      for (const year of [2025, 2019, 1990, 1981, 1970, 1955, 1951]) expect(s.year(s.y(year))).toBeCloseTo(year, 6)
      expect(s.y(1980)).toBeLessThan(s.y(1970))
      expect(s.y(1950) - s.y(1980)).toBeCloseTo(30)
    })

    it('drops year marks inside a gap but keeps its edges', () => {
      const s = buildScale(eras, [2021, 1990], 2026, 1, gapOpts)
      const years = s.ticks().map((t) => t.year)
      expect(years).toContain(1980)
      expect(years).not.toContain(1960)
    })

    it('never compresses without gapPx', () => {
      const s = buildScale(eras, [2021, 1990], 2026, 1, { ...gapOpts, gapPx: undefined })
      expect(s.gaps).toEqual([])
    })
  })
})

describe('effectiveCount', () => {
  it('is linear up to the threshold, then grows more slowly', () => {
    expect(effectiveCount(5, 12, 0.4)).toBe(5)
    expect(effectiveCount(12, 12, 0.4)).toBe(12)
    expect(effectiveCount(1200, 12, 0.4)).toBeCloseTo(12 * Math.pow(100, 0.4))
    expect(effectiveCount(1200, 12, 0.4)).toBeLessThan(80)
    expect(effectiveCount(1200)).toBe(1200)
  })
})

describe('era footer space', () => {
  it('protects the next heading without stretching time or changing the inverse scale', () => {
    const a = buildScale(eras, [2020, 1950], 2026, 1, opts)
    const b = buildScale(eras, [2020, 1950], 2026, 1, { ...opts, footerPx: (era) => era.id === 'new' ? 240 : 100 })
    expect(b.bands[1].top - a.bands[1].top).toBe(240)
    expect(b.y(2020) + 240).toBeLessThanOrEqual(b.bands[1].top)
    expect(b.y(1950)).toBe(b.bands[1].top + b.bands[1].height - 100)
    for (const year of [2025.5, 2020, 2010, 1950]) expect(b.year(b.y(year))).toBeCloseTo(year)
  })
})
