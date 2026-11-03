export interface Positioned<T> {
  item: T
  y: number
  score: number
}

export interface PlacedCard<T> {
  item: T
  y: number
  lane: number
  /** Top edge of the card, in timeline pixels. */
  top: number
}

export interface Cluster<T> {
  y: number
  items: T[]
}

export interface LayoutOptions {
  lanes: number
  cardHeight: number
  gap: number
  /** How far above its date marker a card starts. */
  anchorOffset: number
  /** Hidden events closer than this merge into one "+N" marker. */
  clusterPx: number
}

/**
 * Places cards most important first. A card goes in the first lane where it
 * doesn't overlap a card already placed; otherwise it is hidden. Hidden events
 * are grouped into clusters by position. Ties in score go to the newer event,
 * which has the smaller y.
 */
export function layout<T>(items: Positioned<T>[], opts: LayoutOptions) {
  const order = [...items].sort((a, b) => b.score - a.score || a.y - b.y)
  const lanes: [number, number][][] = Array.from({ length: opts.lanes }, () => [])
  const placed: PlacedCard<T>[] = []
  const hidden: Positioned<T>[] = []

  for (const it of order) {
    const top = it.y - opts.anchorOffset
    const bottom = top + opts.cardHeight + opts.gap
    const lane = lanes.findIndex((spans) => spans.every(([a, b]) => bottom <= a || top >= b))
    if (lane === -1) {
      hidden.push(it)
      continue
    }
    lanes[lane].push([top - opts.gap, bottom])
    placed.push({ item: it.item, y: it.y, lane, top })
  }

  const clusters: Cluster<T>[] = []
  for (const it of [...hidden].sort((a, b) => a.y - b.y)) {
    const last = clusters.at(-1)
    if (last && it.y - last.y <= opts.clusterPx) {
      last.items.push(it.item)
    } else {
      clusters.push({ y: it.y, items: [it.item] })
    }
  }

  placed.sort((a, b) => a.y - b.y)
  return { placed, clusters }
}
