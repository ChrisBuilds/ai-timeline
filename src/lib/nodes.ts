/** Events without a card are drawn as small nodes on the spine. */
export interface Node<T> {
  item: T
  y: number
}

/**
 * Nodes whose `y` lies in [from, to), from a list sorted by y. A node closer
 * than `minGap` to the previous one is drawn under it, so it is skipped: dense
 * stretches stay a bounded number of circles however many events they hold.
 */
export function visibleNodes<T>(list: Node<T>[], from: number, to: number, minGap = 2): Node<T>[] {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].y < from) lo = mid + 1
    else hi = mid
  }
  const out: Node<T>[] = []
  let last = -Infinity
  for (let i = lo; i < list.length && list[i].y < to; i++) {
    if (list[i].y - last < minGap) continue
    out.push(list[i])
    last = list[i].y
  }
  return out
}

/** One SVG path for every node, centred on x = 0, so a window of nodes is one DOM element. */
export function nodePath(nodes: { y: number }[], r: number): string {
  let d = ''
  for (const { y } of nodes) d += `M${-r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
  return d
}

/** The node nearest to `y`, within `reach` pixels; `nodes` is sorted by y. */
export function nearestNode<T>(nodes: Node<T>[], y: number, reach: number): Node<T> | null {
  let lo = 0
  let hi = nodes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (nodes[mid].y < y) lo = mid + 1
    else hi = mid
  }
  let best: Node<T> | null = null
  for (const node of [nodes[lo - 1], nodes[lo]]) {
    if (node && Math.abs(node.y - y) <= reach && (!best || Math.abs(node.y - y) < Math.abs(best.y - y))) best = node
  }
  return best
}

export interface Leaving<T> {
  item: T
  /** Card top minus date marker when the card was last placed, so it shrinks back from where it was. */
  offset: number
  until: number
}

/**
 * Tracks which cards just appeared and which just went, between layouts, so a
 * card can grow out of its node or shrink back into it. The first layout, and
 * any layout `settle()` is called for, animates nothing.
 */
export class RevealTracker<T extends { id: string }> {
  private previous: Map<string, { item: T; offset: number }> | null = null
  /** Cards that appeared, by id, until when they count as new. */
  readonly entering = new Map<string, number>()
  readonly leaving = new Map<string, Leaving<T>>()

  constructor(readonly duration: number) {}

  update(placed: { item: T; y: number; top: number }[], now: number, animate = true): void {
    const next = new Map<string, { item: T; offset: number }>()
    for (const card of placed) next.set(card.item.id, { item: card.item, offset: card.top - card.y })
    this.prune(now)
    if (this.previous && animate) {
      for (const id of next.keys()) {
        if (this.previous.has(id)) continue
        this.leaving.delete(id)
        this.entering.set(id, now + this.duration)
      }
      for (const [id, card] of this.previous) {
        if (next.has(id)) continue
        this.entering.delete(id)
        this.leaving.set(id, { item: card.item, offset: card.offset, until: now + this.duration })
      }
    } else {
      this.entering.clear()
      this.leaving.clear()
    }
    this.previous = next
  }

  /** Drops finished animations; true when something was dropped. */
  prune(now: number): boolean {
    let changed = false
    for (const [id, until] of this.entering) if (until <= now) { this.entering.delete(id); changed = true }
    for (const [id, card] of this.leaving) if (card.until <= now) { this.leaving.delete(id); changed = true }
    return changed
  }

  /** Time of the next animation to finish, or null when none are running. */
  nextExpiry(): number | null {
    let next: number | null = null
    for (const until of this.entering.values()) if (next === null || until < next) next = until
    for (const card of this.leaving.values()) if (next === null || card.until < next) next = card.until
    return next
  }
}
