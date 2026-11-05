import type { Cluster, PlacedCard } from './layout'
import type { TimeScale } from './scale'
import { formatDate } from './dates'

export const GROUP_HEIGHT = 64
const GAP = 12
const ANCHOR = 18
interface GroupItem { id: string; date: string }
export interface EventGroup<T> {
  id: string
  eraId: string
  y: number
  top: number
  height: number
  label: string
  items: T[]
}
export interface EraStats { total: number; shown: number }
interface Cut { at: number; extra: number; before: number }

const numbers = new Intl.NumberFormat('en')
export const formatCount = (count: number) => numbers.format(count)

function period<T extends GroupItem>(items: T[]): string {
  const newest = formatDate(items[0].date.slice(0, 7))
  const oldest = formatDate(items.at(-1)!.date.slice(0, 7))
  return oldest === newest ? oldest : `${oldest} – ${newest}`
}

/**
 * Collect hidden runs in a one-column timeline, splitting at era and compressed-gap
 * boundaries. Reserve display space for their rows without changing which
 * milestones the underlying zoom selected. The reversible projection keeps
 * date-anchored zoom and navigation working across the inserted row space.
 */
export function buildGroups<T extends GroupItem>(base: TimeScale, placed: PlacedCard<T>[], clusters: Cluster<T>[], years: Map<string, number>, heightFor: (item: T) => number) {
  const hidden = clusters.flatMap((c) => c.items.map((item) => ({ item, year: years.get(item.id)! })))
  // Milestones precede hidden items at equal dates, keeping inserted space below their marker.
  const entries = [
    ...placed.map((card) => ({ item: card.item, raw: card.top + ANCHOR, card })),
    ...hidden.map(({ item, year }) => ({ item, raw: base.y(year), card: null })),
  ].sort((a, b) => a.raw - b.raw || Number(!a.card) - Number(!b.card))
  // A displaced card can be displayed after hidden events on both sides of its
  // true date. Keep those hidden runs separate even before reaching the card.
  const dateBoundaries = placed.some((c) => Math.abs(c.top + ANCHOR - c.y) > 1e-6)
    ? placed.map((c) => c.y).sort((a, b) => a - b) : []
  function dateInterval(raw: number): number {
    let lo = 0, hi = dateBoundaries.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (dateBoundaries[mid] <= raw) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const stats = new Map<string, EraStats>(base.bands.map((b) => [b.era.id, { total: 0, shown: 0 }]))
  const cuts: Cut[] = []
  const groups: EventGroup<T>[] = []
  const cards: PlacedCard<T>[] = []
  let extra = 0
  let previousBottom = -Infinity
  let pending: { raw: number; band: number; segment: number; interval: number; items: T[] } | null = null

  function flush(nextCardTop = Infinity) {
    if (!pending) return
    const { raw, band, items } = pending
    const eraId = base.bands[band].era.id
    const top = Math.max(raw + extra, previousBottom + GAP)
    const era = base.bands[band]
    const segment = era.segments[pending.segment]
    const limit = segment && segment !== era.segments.at(-1)
      ? segment.top + segment.height : era.top + era.height
    // A group uses existing whitespace first. Insert only the shortfall before
    // the next card or boundary, rather than always adding a whole row of time.
    const added = Math.max(0, top + GROUP_HEIGHT + GAP - (Math.min(nextCardTop, limit) + extra))
    if (added) {
      cuts.push({ at: raw, extra: added, before: extra })
      extra += added
    }
    groups.push({ id: `${eraId}:${items[0].id}:${items.at(-1)!.id}`, eraId, top, y: top + GROUP_HEIGHT / 2, height: GROUP_HEIGHT, label: period(items), items })
    previousBottom = top + GROUP_HEIGHT
    pending = null
  }

  for (const entry of entries) {
    const year = years.get(entry.item.id)!
    const band = base.bands.findIndex((b, i) => year >= b.start && (i === 0 || year < b.end))
    if (band < 0) throw new Error(`Event outside timeline bands: ${entry.item.id}`)
    stats.get(base.bands[band].era.id)!.total++
    const segment = base.bands[band].segments.findIndex((s) => !s.gap && entry.raw >= s.top - 1e-6 && entry.raw <= s.top + s.height + 1e-6)
    if (entry.card) {
      flush(entry.card.top)
      const card = { ...entry.card, y: entry.card.y + extra, top: entry.card.top + extra }
      cards.push(card)
      previousBottom = card.top + heightFor(card.item)
      stats.get(base.bands[band].era.id)!.shown++
    } else if (pending && pending.band === band && pending.segment === segment && pending.interval === dateInterval(entry.raw)) {
      pending.items.push(entry.item)
    } else {
      flush()
      pending = { raw: entry.raw, band, segment, interval: dateInterval(entry.raw), items: [entry.item] }
    }
  }
  flush()

  /** `after` includes insertion space at the exact date; markers use the leading edge. */
  function project(y: number, after = false): number {
    let lo = 0, hi = cuts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cuts[mid].at < y || (after && cuts[mid].at === y)) lo = mid + 1
      else hi = mid
    }
    const last = cuts[lo - 1]
    return y + (last ? last.before + last.extra : 0)
  }
  function unproject(y: number): number {
    let lo = 0, hi = cuts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cuts[mid].at + cuts[mid].before <= y) lo = mid + 1
      else hi = mid
    }
    const last = cuts[lo - 1]
    return !last ? y : y <= last.at + last.before + last.extra ? last.at : y - last.before - last.extra
  }
  const bands = base.bands.map((b) => ({
    ...b, count: stats.get(b.era.id)!.total, top: project(b.top), height: project(b.top + b.height) - project(b.top),
    segments: b.segments.map((s) => ({ ...s,
      top: project(s.top, true), height: project(s.top + s.height) - project(s.top, true),
    })),
  }))
  const scale: TimeScale = {
    bands, height: project(base.height), gaps: bands.flatMap((b) => b.segments.filter((s) => s.gap)),
    y: (year) => project(base.y(year)), year: (y) => base.year(unproject(y)),
    ticks: () => base.ticks().map((t) => ({ ...t, y: project(t.y) })),
  }
  // Displaced overview cards can straddle a group insertion. Project their true
  // date marker separately from their displayed top so leaders remain truthful.
  for (const card of cards) card.y = project(base.y(years.get(card.item.id)!))
  return { scale, placed: cards, groups, stats, hidden, project }
}
