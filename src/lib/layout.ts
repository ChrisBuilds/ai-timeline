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

export interface LayoutOptions<T = unknown> {
  lanes: number
  cardHeight: number
  gap: number
  /** How far above its date marker a card starts. */
  anchorOffset: number
  /** Hidden events closer than this merge into one "+N" marker. */
  clusterPx: number
  /**
   * An item that must get a card, such as the selected event. Pinning never
   * changes the layout when the item already has a card; when it doesn't, only
   * the cards it overlaps in one lane are hidden to make room.
   */
  pin?: T
  /** Spans no card may overlap, such as an era's name, by lane. */
  reserved?: { lane: number; top: number; bottom: number }[]
}

/**
 * Places cards most important first. A card goes in the first lane where it
 * doesn't overlap a card already placed; otherwise it is hidden. Hidden events
 * are grouped into clusters by position. Ties in score go to the newer event,
 * which has the smaller y.
 */
export function layout<T>(items: Positioned<T>[], opts: LayoutOptions<T>) {
  const order = [...items].sort((a, b) => b.score - a.score || a.y - b.y)
  const scores = new Map(items.map((it) => [it.item, it.score]))
  const lanes: [number, number][][] = Array.from({ length: opts.lanes }, () => [])
  for (const r of opts.reserved ?? []) lanes[r.lane]?.push([r.top, r.bottom])
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

  const pinned = opts.pin === undefined ? -1 : hidden.findIndex((it) => it.item === opts.pin)
  if (pinned !== -1) {
    const it = hidden[pinned]
    hidden.splice(pinned, 1)
    const top = it.y - opts.anchorOffset
    const bottom = top + opts.cardHeight + opts.gap
    const overlaps = (c: PlacedCard<T>) => !(bottom <= c.top - opts.gap || top >= c.top + opts.cardHeight + opts.gap)
    // Use the lane where the fewest cards, and then the least important ones, have to go.
    let best = 0
    let bestCost = Infinity
    for (let lane = 0; lane < opts.lanes; lane++) {
      const blocking = placed.filter((c) => c.lane === lane && overlaps(c))
      // Covering an era's name is the last resort.
      const covers = (opts.reserved ?? []).some((r) => r.lane === lane && !(bottom <= r.top || top >= r.bottom))
      const cost = (covers ? 1e12 : 0) + blocking.length * 1e6 + blocking.reduce((n, c) => n + (scores.get(c.item) ?? 0), 0)
      if (cost < bestCost) {
        best = lane
        bestCost = cost
      }
    }
    for (let i = placed.length - 1; i >= 0; i--) {
      const c = placed[i]
      if (c.lane === best && overlaps(c)) {
        placed.splice(i, 1)
        hidden.push({ item: c.item, y: c.y, score: scores.get(c.item) ?? 0 })
      }
    }
    placed.push({ item: it.item, y: it.y, lane: best, top })
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
