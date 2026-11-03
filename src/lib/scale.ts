import type { Era } from './eras'

/**
 * Density-adaptive time scale. Each era band gets height in proportion to the
 * number of events it holds (plus a floor so quiet eras stay visible), and
 * time is linear inside a band. Zoom multiplies every height. Newest is at the top.
 *
 * At each zoom a band is split into time units, the spacing of its year marks.
 * A run of empty units is squeezed into a short gap, so long stretches with no
 * events don't fill the screen.
 */

export interface ScaleOptions {
  /** Pixels for an era with no events, at zoom 1. */
  basePx: number
  /** Extra pixels per event in the era, at zoom 1. */
  perEventPx: number
  /** Space above the first era, for the "Now" marker. Not zoomed. */
  topPad: number
  /** Space below the last era. Not zoomed. */
  bottomPad: number
  /** Space at the top of each era for its name, before its time starts. Not zoomed. */
  headerPx?: number
  /** Smallest spacing between year marks; one time unit is at least this tall. */
  unitPx?: number
  /** Height of a compressed run of empty units. Leave out to never compress. */
  gapPx?: number
  /** How many empty units in a row get compressed. */
  minGapUnits?: number
}

export const DEFAULT_SCALE: ScaleOptions = {
  basePx: 140,
  perEventPx: 120,
  topPad: 24,
  bottomPad: 96,
  headerPx: 72,
  unitPx: 56,
  gapPx: 44,
  minGapUnits: 2,
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
    const inBand = (t: number) => t >= start && (i === 0 ? t <= end : t < end)
    const years = eventYears.filter(inBand)
    const timePx = (opts.basePx + opts.perEventPx * years.length) * zoom
    const pxPerYear = timePx / (end - start)
    const step = STEPS.find((s) => s * pxPerYear >= unitPx) ?? 100

    // Time units, newest first, clipped to the band.
    const units: { from: number; to: number; empty: boolean }[] = []
    for (let k = Math.ceil(end / step) - 1; k * step + step > start; k--) {
      const to = Math.max(start, k * step)
      const from = Math.min(end, (k + 1) * step)
      if (from <= to) continue
      const empty = !years.some((t) => t >= to && (t < from || (t === from && from === end && i === 0)))
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
    for (let u = 0; u < units.length; ) {
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

    const band = { era, start, end, top, height: y - top, count: years.length, step, segments }
    top = y
    return band
  })

  const height = top + opts.bottomPad
  const first = bands[0]
  const last = bands[bands.length - 1]

  function y(year: number): number {
    if (year >= first.end) return first.top + header
    if (year <= last.start) return last.top + last.height
    const band = bands.find((b) => year >= b.start && year < b.end) ?? last
    const seg = band.segments.find((s) => year > s.to || s === band.segments.at(-1))!
    return seg.top + ((seg.from - year) / (seg.from - seg.to)) * seg.height
  }

  function year(px: number): number {
    if (px <= first.top + header) return first.end
    const band = bands.find((b) => px < b.top + b.height) ?? last
    if (px <= band.top + header) return band.end
    const seg = band.segments.find((s) => px < s.top + s.height) ?? band.segments.at(-1)!
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
