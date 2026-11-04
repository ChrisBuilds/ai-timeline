import type { TimeScale } from './scale'

export interface RibbonBin<T> {
  from: number
  to: number
  top: number
  height: number
  y: number
  items: T[]
}
export interface RibbonSpan<T> {
  top: number
  bottom: number
  path: string
  bins: RibbonBin<T>[]
}

/** Bounded, absolute mapping: the same hidden count always has the same width. */
export function ribbonWidth(count: number, max = 16): number {
  return 2 + (max - 2) * Math.min(1, Math.log1p(Math.max(0, count)) / Math.log1p(1000))
}

const STEPS = [1 / 12, 1 / 4, 1 / 2, 1, 2, 5, 10, 20, 50, 100]

/**
 * Density uses original event dates and layout visibility, never the DOM window.
 * Every bin in a band has the same calendar duration (end bins are clipped).
 * Headers and compressed gaps separate paths, so smoothing cannot bridge them.
 */
export function buildRibbon<T>(scale: TimeScale, hidden: { year: number; item: T }[], maxWidth = 16, project: (y: number, after?: boolean) => number = (y) => y): RibbonSpan<T>[] {
  const newest = scale.bands[0].end
  const sorted = hidden.map((entry) => entry.year > newest ? { ...entry, year: newest } : entry).sort((a, b) => b.year - a.year)
  const spans: RibbonSpan<T>[] = []
  let cursor = 0
  for (const band of scale.bands) {
    const timeHeight = band.segments.filter((s) => !s.gap).reduce((sum, s) => sum + s.height, 0)
    const duration = band.segments.filter((s) => !s.gap).reduce((sum, s) => sum + s.from - s.to, 0)
    const pxPerYear = timeHeight / Math.max(duration, 0.001)
    const step = STEPS.find((s) => s * pxPerYear >= 72) ?? 100
    for (const segment of band.segments) {
      if (segment.gap) continue
      const bins: RibbonBin<T>[] = []
      let from = segment.from
      while (from > segment.to + 1e-8) {
        const to = Math.max(segment.to, (Math.ceil(from / step - 1e-8) - 1) * step)
        const rawTop = segment.top + (segment.from - from) * pxPerYear
        const top = project(rawTop)
        const height = project(rawTop + (from - to) * pxPerYear, true) - top
        const items: T[] = []
        while (cursor < sorted.length && sorted[cursor].year > from + 1e-8) cursor++
        while (cursor < sorted.length && sorted[cursor].year >= to &&
          (sorted[cursor].year > to || to === segment.to)) {
          items.push(sorted[cursor++].item)
        }
        bins.push({ from, to, top, height, y: top + height / 2, items })
        from = to
      }
      const points = [
        { y: project(segment.top), w: 1 },
        ...bins.map((b) => ({ y: b.y, w: ribbonWidth(b.items.length, maxWidth) / 2 })),
        { y: project(segment.top + segment.height, true), w: 1 },
      ]
      // Cubic smoothstep has no width overshoot, unlike unconstrained splines.
      let path = `M${-points[0].w},${points[0].y}`
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], mid = (a.y + b.y) / 2
        path += ` C${-a.w},${mid} ${-b.w},${mid} ${-b.w},${b.y}`
      }
      const end = points.at(-1)!
      path += ` L${end.w},${end.y}`
      for (let i = points.length - 2; i >= 0; i--) {
        const a = points[i + 1], b = points[i], mid = (a.y + b.y) / 2
        path += ` C${a.w},${mid} ${b.w},${mid} ${b.w},${b.y}`
      }
      spans.push({ top: project(segment.top), bottom: project(segment.top + segment.height, true), path: path + ' Z', bins })
    }
  }
  return spans
}
