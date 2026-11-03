import type { Era } from './eras'

/**
 * Density-adaptive time scale. Each era band gets height in proportion to the
 * number of events it holds (plus a floor so quiet eras stay visible), and
 * time is linear inside a band. Zoom multiplies every height. Newest is at the top.
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
}

export const DEFAULT_SCALE: ScaleOptions = { basePx: 140, perEventPx: 120, topPad: 72, bottomPad: 96 }

export interface Band {
  era: Era
  start: number
  end: number
  top: number
  height: number
  count: number
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
  ticks(minGapPx: number): Tick[]
}

export function buildScale(
  eras: Era[],
  eventYears: number[],
  now: number,
  zoom: number,
  opts: ScaleOptions = DEFAULT_SCALE,
): TimeScale {
  let top = opts.topPad
  const bands: Band[] = eras.map((era, i) => {
    const end = era.end ?? now
    // The newest era includes events up to and including now.
    const count = eventYears.filter((t) => t >= era.start && (i === 0 ? t <= end : t < end)).length
    const height = (opts.basePx + opts.perEventPx * count) * zoom
    const band = { era, start: era.start, end, top, height, count }
    top += height
    return band
  })
  const height = top + opts.bottomPad
  const first = bands[0]
  const last = bands[bands.length - 1]

  function y(year: number): number {
    if (year >= first.end) return first.top
    if (year <= last.start) return last.top + last.height
    const band = bands.find((b) => year >= b.start && year < b.end) ?? last
    return band.top + ((band.end - year) / (band.end - band.start)) * band.height
  }

  function year(px: number): number {
    if (px <= first.top) return first.end
    const band = bands.find((b) => px < b.top + b.height) ?? last
    const frac = Math.min(1, (px - band.top) / band.height)
    return band.end - frac * (band.end - band.start)
  }

  /** Year ticks inside each band, using the smallest step that keeps ticks apart. */
  function ticks(minGapPx: number): Tick[] {
    const steps = [1, 2, 5, 10, 20, 50]
    const out: Tick[] = []
    for (const b of bands) {
      const pxPerYear = b.height / (b.end - b.start)
      const step = steps.find((s) => s * pxPerYear >= minGapPx) ?? 100
      const firstTick = Math.ceil(b.start / step) * step
      for (let t = firstTick; t < b.end; t += step) out.push({ year: t, y: y(t) })
    }
    return out
  }

  return { bands, height, y, year, ticks }
}
