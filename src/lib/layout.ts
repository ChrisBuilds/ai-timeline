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
  /** Cached required indexes in chronological (ascending y) order. */
  requiredOrder?: ArrayLike<number>
  /** Overview milestones are placed first and shifted down when necessary. */
  mustShow?: (item: T) => boolean
  lanes: number
  cardHeight: number
  /** Optional height for each event state. */
  heightFor?: (item: T) => number
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
  /**
   * The order to place items in, from `priorityOrder(items)`. It only depends on
   * scores and on the order of dates, not on zoom, so callers can compute it
   * once and reuse it for every zoom frame.
   */
  order?: ArrayLike<number>
  /** Spans no card may overlap, such as an era's name, by lane. */
  reserved?: { lane: number; top: number; bottom: number }[]
}

/**
 * Places cards most important first. A card goes in the first lane where it
 * doesn't overlap a card already placed; otherwise it is hidden. Hidden events
 * are grouped into clusters by position. Ties in score go to the newer event,
 * which has the smaller y.
 */
/** Indexes into `items`, most important first; ties go to the newer event (smaller y). */
export function priorityOrder<T>(items: Positioned<T>[]): Int32Array {
  const order = new Int32Array(items.length)
  for (let i = 0; i < order.length; i++) order[i] = i
  return order.sort((a, b) => items[b].score - items[a].score || items[a].y - items[b].y)
}

type Span = [top: number, bottom: number]

/** Index of the first span that ends after `top`. Spans are sorted and don't overlap. */
function firstEndingAfter(spans: Span[], top: number): number {
  let lo = 0
  let hi = spans.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (spans[mid][1] > top) hi = mid
    else lo = mid + 1
  }
  return lo
}

function isFree(spans: Span[], top: number, bottom: number): boolean {
  const next = spans[firstEndingAfter(spans, top)]
  return !next || next[0] >= bottom
}

/** Adds a span, merging it with any it overlaps so the list stays sorted and disjoint. */
function occupy(spans: Span[], top: number, bottom: number) {
  let i = firstEndingAfter(spans, top)
  let j = i
  while (j < spans.length && spans[j][0] < bottom) {
    top = Math.min(top, spans[j][0])
    bottom = Math.max(bottom, spans[j][1])
    j++
  }
  spans.splice(i, j - i, [top, bottom])
}

export function layout<T>(items: Positioned<T>[], opts: LayoutOptions<T>) {
  const n = items.length
  const order = opts.order ?? priorityOrder(items)
  // Each lane keeps its occupied spans sorted and non-overlapping, so a free
  // spot is found with a binary search instead of a scan of every card.
  const lanes: Span[][] = Array.from({ length: opts.lanes }, () => [])
  for (const r of opts.reserved ?? []) if (lanes[r.lane]) occupy(lanes[r.lane], r.top, r.bottom)
  // Lane of each item, or -1 when it is hidden. Runs once per zoom frame for
  // every event, so it avoids allocating per item.
  const laneOf = new Int8Array(n).fill(-1)
  const tops = new Float64Array(n)
  const heights = Float64Array.from(items, (it) => opts.heightFor?.(it.item) ?? opts.cardHeight)

  // Preserve overview milestones even on the same date. Date anchors stay put;
  // leaders connect any shifted cards. Callers reserve footer space per band.
  const required = opts.requiredOrder ?? (opts.mustShow ? Array.from({ length: n }, (_, i) => i)
    .filter((i) => opts.mustShow?.(items[i].item))
    .sort((a, b) => items[a].y - items[b].y || a - b) : [])
  for (let k = 0; k < required.length; k++) {
    const i = required[k]
    let bestLane = 0
    let bestTop = Infinity
    for (let lane = 0; lane < lanes.length; lane++) {
      let top = items[i].y - opts.anchorOffset
      for (const [start, end] of lanes[lane]) {
        if (end <= top - opts.gap) continue
        if (start >= top + heights[i] + opts.gap) break
        top = end + opts.gap
      }
      if (top < bestTop) { bestTop = top; bestLane = lane }
    }
    occupy(lanes[bestLane], bestTop - opts.gap, bestTop + heights[i] + opts.gap)
    laneOf[i] = bestLane
    tops[i] = bestTop
  }

  for (let k = 0; k < order.length; k++) {
    const i = order[k]
    if (laneOf[i] !== -1) continue
    const top = items[i].y - opts.anchorOffset
    const bottom = top + heights[i] + opts.gap
    for (let lane = 0; lane < lanes.length; lane++) {
      if (isFree(lanes[lane], top, bottom)) {
        occupy(lanes[lane], top - opts.gap, bottom)
        laneOf[i] = lane
        tops[i] = top
        break
      }
    }
  }

  const pinned = opts.pin === undefined ? -1 : items.findIndex((it) => it.item === opts.pin)
  if (pinned !== -1 && laneOf[pinned] === -1) {
    const top = items[pinned].y - opts.anchorOffset
    const bottom = top + heights[pinned] + opts.gap
    const overlaps = (j: number) => !(bottom <= tops[j] - opts.gap || top >= tops[j] + heights[j] + opts.gap)
    const shown: number[] = []
    for (let j = 0; j < n; j++) if (laneOf[j] !== -1 && overlaps(j)) shown.push(j)
    // Use the lane where the fewest cards, and then the least important ones, have to go.
    let best = 0
    let bestCost = Infinity
    for (let lane = 0; lane < opts.lanes; lane++) {
      const blocking = shown.filter((j) => laneOf[j] === lane)
      // Covering an era's name is the last resort.
      const covers = (opts.reserved ?? []).some((r) => r.lane === lane && !(bottom <= r.top || top >= r.bottom))
      const cost = (covers ? 1e12 : 0) + blocking.length * 1e6 + blocking.reduce((sum, j) => sum + items[j].score, 0)
      if (cost < bestCost) {
        best = lane
        bestCost = cost
      }
    }
    for (const j of shown) if (laneOf[j] === best) laneOf[j] = -1
    laneOf[pinned] = best
    tops[pinned] = top
  }

  // Walk items by y: cards in order, and hidden ones merged into clusters.
  let byY: ArrayLike<number> | null = null
  for (let j = 1; j < n; j++) {
    if (items[j].y < items[j - 1].y) {
      const idx = new Int32Array(n)
      for (let k = 0; k < n; k++) idx[k] = k
      byY = idx.sort((a, b) => items[a].y - items[b].y)
      break
    }
  }
  const placed: PlacedCard<T>[] = []
  const clusters: Cluster<T>[] = []
  let last: Cluster<T> | undefined
  for (let k = 0; k < n; k++) {
    const i = byY ? byY[k] : k
    const it = items[i]
    if (laneOf[i] !== -1) {
      placed.push({ item: it.item, y: it.y, lane: laneOf[i], top: tops[i] })
    } else if (last && it.y - last.y <= opts.clusterPx) {
      last.items.push(it.item)
    } else {
      last = { y: it.y, items: [it.item] }
      clusters.push(last)
    }
  }
  return { placed, clusters }
}
