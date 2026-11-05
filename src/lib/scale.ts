import type { Era } from './eras'

/**
 * Density-adaptive time scale. Each era band gets height in proportion to the
 * number of events it holds (plus a floor so quiet eras stay visible), and
 * time is linear between compressed gaps. Zoom expands occupied time. Newest is at the top.
 *
 * Long intervals between actual event dates are squeezed into short gaps,
 * including partial years and the empty stretch between now and the newest event.
 */

/** Date projection before any footer display space is added. */
export interface BandTime {
  top: number
  end: number
  y(year: number): number
}

export interface ScaleOptions {
  /** Pixels for an era with no events, at zoom 1. */
  basePx: number
  /** Extra pixels per event in the era, at zoom 1. */
  perEventPx: number
  /**
   * Past this many events, an era grows more slowly: by its event count raised
   * to `densityExponent`. This keeps a timeline of thousands of events a few
   * dozen screens tall at zoom 1, with zoom revealing the rest.
   */
  linearUpTo?: number
  densityExponent?: number
  /** Space above the first era, for the "Now" marker. Not zoomed. */
  topPad: number
  /** Space below the last era. Not zoomed. */
  bottomPad: number
  /** Space at the top of each era for its name, before its time starts. Not zoomed. */
  headerPx?: number
  /** Non-time space for entries extending past the last date in each era. */
  footerPx?: number | ((era: Era, time: BandTime) => number)
  /** Smallest spacing between year marks; one time unit is at least this tall. */
  unitPx?: number
  /** Height of a compressed run of empty units. Leave out to never compress. */
  gapPx?: number
  /** How many empty units in a row get compressed. */
  minGapUnits?: number
  /** Compress event-free intervals longer than this, even within a single year. */
  maxEmptyPx?: number
}

export const DEFAULT_SCALE: ScaleOptions = {
  basePx: 140,
  perEventPx: 120,
  // Small eras get a full card budget before large collections are densified.
  linearUpTo: 24,
  densityExponent: 0.4,
  topPad: 24,
  bottomPad: 96,
  headerPx: 72,
  unitPx: 56,
  gapPx: 44,
  minGapUnits: 2,
  maxEmptyPx: 280,
}

/** A stretch of a band, from its newer year `from` down to its older year `to`. */
export interface Segment {
  from: number
  to: number
  top: number
  height: number
  /** A compressed run of time with no events. */
  gap: boolean
}

export interface Band {
  era: Era
  start: number
  end: number
  top: number
  height: number
  count: number
  /** Years between year marks at this zoom. */
  step: number
  segments: Segment[]
}

export interface Tick {
  year: number
  y: number
}

export interface TimeScale {
  bands: Band[]
  height: number
  /** Year to pixel offset from the top of the timeline. */
  y(year: number): number
  /** Pixel offset to year (inverse of y). */
  year(y: number): number
  ticks(): Tick[]
  /** Every compressed stretch, newest first. */
  gaps: Segment[]
}

const STEPS = [1, 2, 5, 10, 20, 50]

// Splitting years into eras doesn't depend on zoom, so it is done once per list
// of years and reused for every zoom frame.
const yearsCache = new WeakMap<number[], { eras: Era[]; now: number; perBand: Float64Array[] }>()

/** Each era's event years, ascending, so a time unit is checked with a binary search. */
function bandYears(eventYears: number[], eras: Era[], now: number): Float64Array[] {
  const hit = yearsCache.get(eventYears)
  if (hit && hit.eras === eras && hit.now === now) return hit.perBand
  const perBand = eras.map((era, i) => {
    const end = era.end ?? now
    // The newest era includes events up to and including now.
    return Float64Array.from(eventYears.filter((t) => t >= era.start && (i === 0 ? t <= end : t < end))).sort()
  })
  yearsCache.set(eventYears, { eras, now, perBand })
  return perBand
}

/** Index of the first value at or above `x` in an ascending array. */
function lowerBound(sorted: Float64Array, x: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The segment holding `year`; segments run newest first. */
function segmentForYear(segments: Segment[], year: number): Segment {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (year > segments[mid].to) hi = mid
    else lo = mid + 1
  }
  return segments[lo]
}

/** The segment holding pixel offset `px`; the last one if `px` is past the end. */
function segmentForPx(segments: Segment[], px: number): Segment {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (px < segments[mid].top + segments[mid].height) hi = mid
    else lo = mid + 1
  }
  return segments[lo]
}

/** How many events' worth of height an era with `count` events gets. */
export function effectiveCount(count: number, linearUpTo = Infinity, exponent = 1): number {
  if (count <= linearUpTo) return count
  return linearUpTo * Math.pow(count / linearUpTo, exponent)
}

export function buildScale(
  eras: Era[],
  eventYears: number[],
  now: number,
  zoom: number,
  opts: ScaleOptions = DEFAULT_SCALE,
): TimeScale {
  const header = opts.headerPx ?? 0
  const unitPx = opts.unitPx ?? 56
  const minUnits = opts.minGapUnits ?? 2
  let top = opts.topPad

  const bands: Band[] = eras.map((era, i) => {
    const end = era.end ?? now
    const start = era.start
    // The newest era includes events up to and including now.
    const years = bandYears(eventYears, eras, now)[i]
    const weight = effectiveCount(years.length, opts.linearUpTo, opts.densityExponent)
    const timePx = (opts.basePx + opts.perEventPx * weight) * zoom
    // Spend the era's event budget on the period containing its events. Empty
    // leading/trailing years get compressed separately rather than consuming
    // space that cards in the active period need.
    const activeYears = opts.maxEmptyPx !== undefined && opts.gapPx !== undefined && years.length > 1
      ? years[years.length - 1] - years[0] : 0
    const pxPerYear = timePx / (activeYears > 0 ? activeYears : end - start)
    const step = STEPS.find((s) => s * pxPerYear >= unitPx) ?? 100

    // Time units, newest first, clipped to the band.
    const units: { from: number; to: number; empty: boolean }[] = []
    for (let k = Math.ceil(end / step) - 1; k * step + step > start; k--) {
      const to = Math.max(start, k * step)
      const from = Math.min(end, (k + 1) * step)
      if (from <= to) continue
      const first = lowerBound(years, to)
      const empty = !(first < years.length && (years[first] < from || (years[first] === from && from === end && i === 0)))
      units.push({ from, to, empty })
    }

    // Join units into segments: runs of enough empty units become gaps.
    const segments: Segment[] = []
    let y = top + header
    const push = (from: number, to: number, gap: boolean) => {
      const height = gap ? opts.gapPx! : (from - to) * pxPerYear
      const last = segments.at(-1)
      if (!gap && last && !last.gap) last.to = to
      else segments.push({ from, to, top: y, height: 0, gap })
      segments.at(-1)!.height += height
      y += height
    }
    if (opts.maxEmptyPx !== undefined && opts.gapPx !== undefined) {
      // Use actual dates, not calendar buckets: a year containing one event
      // can still have many screens of empty time on either side of it.
      const dates = [...new Set([end, ...Array.from(years).reverse(), start])]
      const padding = Math.max(0, (opts.maxEmptyPx - opts.gapPx) / 2)
      for (let j = 1; j < dates.length; j++) {
        const from = dates[j - 1], to = dates[j]
        if (from <= to) continue
        if ((from - to) * pxPerYear <= opts.maxEmptyPx) {
          push(from, to, false)
          continue
        }
        const fromEvent = j > 1 || years.at(-1) === end
        const toEvent = j < dates.length - 1 || years[0] === start
        const gapFrom = from - (fromEvent ? padding / pxPerYear : 0)
        const gapTo = to + (toEvent ? padding / pxPerYear : 0)
        if (from > gapFrom) push(from, gapFrom, false)
        push(gapFrom, gapTo, true)
        if (gapTo > to) push(gapTo, to, false)
      }
    } else for (let u = 0; u < units.length; ) {
      let run = 0
      while (units[u + run]?.empty) run++
      const from = units[u].from
      const to = run ? units[u + run - 1].to : units[u].to
      if (opts.gapPx !== undefined && run >= minUnits && (from - to) * pxPerYear > opts.gapPx * 1.5) {
        push(from, to, true)
        u += run
      } else {
        push(from, run ? to : units[u].to, false)
        u += Math.max(run, 1)
      }
    }

    const timeEnd = y
    const bandTop = top
    const time: BandTime = {
      top: bandTop, end: timeEnd,
      y(year) {
        if (year >= end) return bandTop + header
        if (year <= start) return timeEnd
        const segment = segmentForYear(segments, year)
        return segment.top + ((segment.from - year) / (segment.from - segment.to)) * segment.height
      },
    }
    y += typeof opts.footerPx === 'function' ? opts.footerPx(era, time) : opts.footerPx ?? 0
    const band = { era, start, end, top, height: y - top, count: years.length, step, segments }
    top = y
    return band
  })

  const height = top + opts.bottomPad
  const first = bands[0]
  const last = bands[bands.length - 1]

  function y(year: number): number {
    if (year >= first.end) return first.top + header
    if (year <= last.start) return last.segments.at(-1)!.top + last.segments.at(-1)!.height
    const band = bands.find((b) => year >= b.start && year < b.end) ?? last
    const seg = segmentForYear(band.segments, year)
    return seg.top + ((seg.from - year) / (seg.from - seg.to)) * seg.height
  }

  function year(px: number): number {
    if (px <= first.top + header) return first.end
    const band = bands.find((b) => px < b.top + b.height) ?? last
    if (px <= band.top + header) return band.end
    const seg = segmentForPx(band.segments, px)
    const frac = Math.min(1, Math.max(0, (px - seg.top) / seg.height))
    return seg.from - frac * (seg.from - seg.to)
  }

  /** Year marks at each band's step, leaving out those inside a gap. */
  function ticks(): Tick[] {
    const out: Tick[] = []
    for (const b of bands) {
      for (let t = Math.ceil(b.start / b.step) * b.step; t < b.end; t += b.step) {
        if (b.segments.some((s) => s.gap && t > s.to && t < s.from)) continue
        out.push({ year: t, y: y(t) })
      }
    }
    return out
  }

  const gaps = bands.flatMap((b) => b.segments.filter((s) => s.gap))
  return { bands, height, y, year, ticks, gaps }
}
