import { describe, expect, it } from 'vitest'
import { buildGroups, GROUP_HEIGHT } from './groups'
import { buildScale, DEFAULT_SCALE } from './scale'
import { layout } from './layout'
import { toYear, nowYear } from './time'

interface Event { id: string; date: string; score: number }
const eras = [
  { id: 'new', name: 'New', start: 2022 },
  { id: 'old', name: 'Old', start: 2010, end: 2022 },
]
const height = (e: Event) => e.id === 'selected' ? 260 : 100
function arrange(events: Event[], zoom = 1, pin?: Event) {
  const years = new Map(events.map((e) => [e.id, toYear(e.date)]))
  const base = buildScale(eras, [...years.values()], 2026.84, zoom, { ...DEFAULT_SCALE, headerPx: 110, footerPx: 300 })
  const arranged = layout(events.map((item) => ({ item, y: base.y(years.get(item.id)!), score: item.score })), {
    lanes: 1, cardHeight: 100, heightFor: height, gap: 10, anchorOffset: 18, clusterPx: 28, pin,
    reserved: base.bands.map((b) => ({ lane: 0, top: b.top, bottom: b.top + 80 })),
  })
  return { ...buildGroups(base, arranged.placed, arranged.clusters, years, height), years, base }
}
const dense = Array.from({ length: 240 }, (_, i) => ({
  id: `e${i}`, date: `${i < 160 ? 2024 : 2021}-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 27 + 1).padStart(2, '0')}`,
  score: i % 100,
}))

describe('collapsed groups', () => {
  it('conserves every event and keeps registered/shown era totals consistent at each zoom', () => {
    for (const zoom of [0.5, 1, 4, 40]) {
      const out = arrange(dense, zoom)
      const ids = [...out.placed.map((c) => c.item.id), ...out.groups.flatMap((g) => g.items.map((e) => e.id))]
      expect(ids.length).toBe(dense.length)
      expect(new Set(ids).size).toBe(dense.length)
      for (const [id, stats] of out.stats) {
        expect(stats.shown).toBe(out.placed.filter((c) => (out.years.get(c.item.id)! >= 2022 ? 'new' : 'old') === id).length)
        expect(stats.total).toBe(stats.shown + out.groups.filter((g) => g.eraId === id).reduce((n, g) => n + g.items.length, 0))
      }
    }
  })
  it('reserves collision-free rows even around an expanded pinned event', () => {
    const events = [...dense, { id: 'selected', date: '2024-05-12', score: 0 }]
    const out = arrange(events, 1, events.at(-1))
    const rows = [...out.placed.map((c) => ({ top: c.top, height: height(c.item) })), ...out.groups].sort((a, b) => a.top - b.top)
    for (let i = 1; i < rows.length; i++) expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].top + rows[i - 1].height)
    for (const row of rows) for (const band of out.scale.bands) {
      expect(row.top + row.height <= band.top || row.top >= band.top + 80).toBe(true)
    }
    expect(out.placed.some((c) => c.item.id === 'selected')).toBe(true)
    expect(out.groups.every((g) => g.height === GROUP_HEIGHT)).toBe(true)
  })
  it('never combines hidden events across a visible milestone or era boundary', () => {
    const out = arrange(dense)
    for (const group of out.groups) {
      const ys = group.items.map((e) => out.years.get(e.id)!)
      expect(new Set(ys.map((y) => y >= 2022 ? 'new' : 'old')).size).toBe(1)
      for (const c of out.placed) expect(out.years.get(c.item.id)! > Math.min(...ys) && out.years.get(c.item.id)! < Math.max(...ys)).toBe(false)
    }
  })
  it('keeps same-date hidden events together after their milestone', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({ id: String(i), date: '2022-01-01', score: i }))
    const out = arrange(events)
    expect(out.stats.get('new')).toEqual({ total: 50, shown: 1 })
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0].items).toHaveLength(49)
    expect(out.groups[0].label).toBe('Jan 2022')
    expect(out.groups[0].top).toBeGreaterThan(out.placed[0].top + height(out.placed[0].item))
    expect(out.scale.y(out.years.get('0')!)).toBe(out.placed[0].y)
  })
  it('keeps date navigation and its inverse aligned with every individual marker', () => {
    const out = arrange(dense)
    for (const c of out.placed) expect(out.scale.y(out.years.get(c.item.id)!)).toBeCloseTo(c.y)
    for (const year of [2026.5, 2024.75, 2024, 2022, 2021.3, 2011]) {
      expect(out.scale.year(out.scale.y(year))).toBeCloseTo(year, 7)
    }
    for (const group of out.groups) expect(Number.isFinite(out.scale.year(group.y))).toBe(true)
  })
  it('splits hidden runs at compressed empty spans and leaves the gap clear', () => {
    const events = [2024, 2024, 2016, 2016].map((year, i) => ({ id: String(i), date: String(year), score: 0 }))
    const years = new Map(events.map((e) => [e.id, toYear(e.date)]))
    const base = buildScale([{ id: 'all', name: 'All', start: 2010 }], [...years.values()], 2026.84, 4, { ...DEFAULT_SCALE, headerPx: 110, footerPx: 300 })
    const out = buildGroups(base, [], [{ y: base.y(2024), items: events }], years, height)
    expect(base.gaps.length).toBeGreaterThan(0)
    expect(out.groups).toHaveLength(2)
    for (const g of out.groups) for (const gap of out.scale.gaps) {
      expect(g.top + g.height <= gap.top || g.top >= gap.top + gap.height).toBe(true)
    }
  })
  it('keeps current-day events in the newest era before their midday anchor', () => {
    const events = [1, 2].map((score) => ({ id: String(score), date: '2026-11-04', score }))
    const now = nowYear(new Date('2026-11-04T08:00:00Z'))
    const years = new Map(events.map((e) => [e.id, toYear(e.date)]))
    expect(years.get('1')!).toBeGreaterThan(now)
    const base = buildScale(eras, [...years.values()], now, 1, { ...DEFAULT_SCALE, headerPx: 110, footerPx: 300 })
    const arranged = layout(events.map((item) => ({ item, y: base.y(years.get(item.id)!), score: item.score })), {
      lanes: 1, cardHeight: 100, gap: 10, anchorOffset: 18, clusterPx: 28,
    })
    const out = buildGroups(base, arranged.placed, arranged.clusters, years, height)
    expect(out.stats.get('new')).toEqual({ total: 2, shown: 1 })
    expect(out.groups[0].items).toHaveLength(1)
    expect(out.scale.y(years.get('1')!)).toBe(out.placed[0].y)
    expect(out.scale.bands[0].count).toBe(2)
  })
  it('leaves the original scale unchanged when all events already have milestones', () => {
    const out = arrange([{ id: 'only', date: '2024', score: 100 }])
    expect(out.groups).toEqual([])
    expect(out.scale.height).toBe(out.base.height)
    expect(out.scale.y(2024)).toBe(out.base.y(2024))
  })
})

it('keeps displaced same-date overview cards clear of hidden groups with truthful date markers', () => {
  const events = [
    { id: 'first', date: '2024-01-01', score: 60, overview: true },
    { id: 'second', date: '2024-01-01', score: 50, overview: true },
    { id: 'hidden', date: '2024-01-01', score: 99, overview: false },
    { id: 'later-hidden', date: '2023-12-01', score: 10, overview: false },
  ]
  const years = new Map(events.map((e) => [e.id, toYear(e.date)]))
  const base = buildScale(eras, [...years.values()], 2026.84, 1, { ...DEFAULT_SCALE, headerPx: 110, footerPx: 500 })
  const arranged = layout(events.map((item) => ({ item, y: base.y(years.get(item.id)!), score: item.score })), {
    lanes: 1, cardHeight: 100, gap: 10, anchorOffset: 18, clusterPx: 28, mustShow: (e) => e.overview,
  })
  const out = buildGroups(base, arranged.placed, arranged.clusters, years, () => 100)
  expect(out.placed.filter((c) => c.item.overview)).toHaveLength(2)
  const rows = [...out.placed.map((c) => ({ top: c.top, height: 100 })), ...out.groups].sort((a, b) => a.top - b.top)
  for (let i = 1; i < rows.length; i++) expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].top + rows[i - 1].height)
  for (const c of out.placed) expect(c.y).toBeCloseTo(out.scale.y(years.get(c.item.id)!))
})

it('splits hidden runs at the true date of a displaced milestone', () => {
  const events = [
    { id: 'a', date: '2024-01-05' }, { id: 'b', date: '2024-01-03' },
    { id: 'before', date: '2024-01-04' }, { id: 'after', date: '2024-01-02' },
  ]
  const years = new Map(events.map((e) => [e.id, toYear(e.date)]))
  const base = buildScale(eras, [...years.values()], 2026.84, 1, { ...DEFAULT_SCALE, headerPx: 110, footerPx: 500 })
  const arranged = layout(events.map((item) => ({ item, y: base.y(years.get(item.id)!), score: 50 })), {
    lanes: 1, cardHeight: 100, gap: 10, anchorOffset: 18, clusterPx: 28, mustShow: (e) => e.id === 'a' || e.id === 'b',
  })
  const out = buildGroups(base, arranged.placed, arranged.clusters, years, () => 100)
  expect(out.groups).toHaveLength(2)
  expect(out.groups.map((g) => g.items.map((e) => e.id))).toEqual([['before'], ['after']])
})
