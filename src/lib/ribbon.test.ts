import { describe, it, expect } from 'vitest'
import { buildRibbon, ribbonWidth } from './ribbon'
import { buildScale, DEFAULT_SCALE } from './scale'
import { layout } from './layout'

const eras = [
  { id: 'recent', name: 'Recent', start: 2022 },
  { id: 'older', name: 'Older', start: 2017, end: 2022 },
]

describe('density ribbon', () => {
  it('counts every hidden event exactly once at bin and era boundaries, including same-date events', () => {
    const dates = [2025, 2024, 2024, 2023.5, 2022, 2021, 2017]
    const hidden = dates.map((year, item) => ({ year, item }))
    for (const zoom of [0.5, 1, 5, 40]) {
      const scale = buildScale(eras, dates, 2025, zoom)
      const spans = buildRibbon(scale, hidden)
      expect(spans.flatMap((s) => s.bins.flatMap((b) => b.items)).sort()).toEqual(hidden.map((h) => h.item).sort())
      const boundary = spans.flatMap((s) => s.bins).find((b) => b.items.includes(4))!
      expect(boundary.to).toBeGreaterThanOrEqual(2022)
    }
  })

  it('never spans compressed gaps or era headers', () => {
    const dates = [2024, 2017]
    const scale = buildScale(eras, dates, 2025, 2)
    const spans = buildRibbon(scale, dates.map((year) => ({ year, item: year })))
    expect(scale.gaps.length).toBeGreaterThan(0)
    for (const span of spans) {
      for (const gap of scale.gaps) expect(span.bottom <= gap.top || span.top >= gap.top + gap.height).toBe(true)
      expect(span.path).not.toMatch(/NaN|Infinity/)
    }
  })

  it('uses an absolute bounded width independent of other periods', () => {
    expect(ribbonWidth(0)).toBe(2)
    expect(ribbonWidth(20)).toBeGreaterThan(ribbonWidth(2))
    expect(ribbonWidth(20000)).toBeLessThanOrEqual(16)
    expect(ribbonWidth(20000, 12)).toBeLessThanOrEqual(12)
  })

  it('narrows as zoom reveals events', () => {
    const dates = Array.from({ length: 30 }, (_, i) => 2024 - i / 30)
    const items = dates.map((year, item) => ({ year, item }))
    const hiddenAt = (zoom: number) => {
      const scale = buildScale(eras, dates, 2025, zoom, { ...DEFAULT_SCALE, gapPx: undefined })
      const arranged = layout(items.map((e) => ({ item: e, y: scale.y(e.year), score: 50 })), {
        lanes: 1, cardHeight: 100, gap: 10, anchorOffset: 18, clusterPx: 28,
      })
      const hidden = arranged.clusters.flatMap((c) => c.items)
      const ribbon = buildRibbon(scale, hidden)
      return ribbon.flatMap((s) => s.bins).reduce((n, b) => n + b.items.length, 0)
    }
    expect(hiddenAt(20)).toBeLessThan(hiddenAt(0.5))
  })
})
