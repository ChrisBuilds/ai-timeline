import { describe, expect, it } from 'vitest'
import { layout, priorityOrder, type LayoutOptions } from './layout'

const opts: LayoutOptions<string> = { lanes: 1, cardHeight: 80, gap: 10, anchorOffset: 10, clusterPx: 30 }

describe('layout', () => {
  it('keeps the most important of two colliding events', () => {
    const { placed, clusters } = layout(
      [
        { item: 'minor', y: 100, score: 40 },
        { item: 'major', y: 120, score: 90 },
      ],
      opts,
    )
    expect(placed.map((p) => p.item)).toEqual(['major'])
    expect(clusters).toEqual([{ y: 100, items: ['minor'] }])
  })

  it('places events that are far enough apart', () => {
    const { placed, clusters } = layout(
      [
        { item: 'a', y: 100, score: 40 },
        { item: 'b', y: 300, score: 90 },
      ],
      opts,
    )
    expect(placed.map((p) => p.item)).toEqual(['a', 'b'])
    expect(clusters).toEqual([])
  })

  it('uses a second lane before hiding anything', () => {
    const { placed, clusters } = layout(
      [
        { item: 'a', y: 100, score: 40 },
        { item: 'b', y: 110, score: 90 },
      ],
      { ...opts, lanes: 2 },
    )
    expect(placed.map((p) => [p.item, p.lane])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
    expect(clusters).toEqual([])
  })

  it('merges nearby hidden events into one cluster', () => {
    const { clusters } = layout(
      [
        { item: 'top', y: 100, score: 99 },
        { item: 'x', y: 105, score: 10 },
        { item: 'y', y: 120, score: 10 },
        { item: 'z', y: 170, score: 10 },
      ],
      opts,
    )
    expect(clusters).toEqual([
      { y: 105, items: ['x', 'y'] },
      { y: 170, items: ['z'] },
    ])
  })

  it('breaks score ties in favour of the newer (higher) event', () => {
    const { placed } = layout(
      [
        { item: 'older', y: 120, score: 50 },
        { item: 'newer', y: 100, score: 50 },
      ],
      opts,
    )
    expect(placed.map((p) => p.item)).toEqual(['newer'])
  })
})

describe('pinned items', () => {
  const two = { ...opts, lanes: 2 }
  const items = [
    { item: 'a', y: 100, score: 50 },
    { item: 'b', y: 120, score: 90 },
    { item: 'c', y: 140, score: 70 },
    { item: 'd', y: 400, score: 30 },
  ]

  it('changes nothing when the pinned item already has a card', () => {
    const base = layout(items, two)
    for (const pin of ['b', 'c', 'd']) expect(layout(items, { ...two, pin })).toEqual(base)
  })

  it('shows a hidden pinned item, hiding only what it overlaps in one lane', () => {
    const base = layout(items, two)
    expect(base.clusters.flatMap((c) => c.items)).toEqual(['a'])
    const { placed, clusters } = layout(items, { ...two, pin: 'a' })
    expect(placed.map((p) => p.item).sort()).toEqual(['a', 'b', 'd'])
    // c is the less important of the two cards a could replace.
    expect(clusters.flatMap((c) => c.items)).toEqual(['c'])
    const kept = (id: string) => placed.find((p) => p.item === id)
    const was = (id: string) => base.placed.find((p) => p.item === id)
    expect(kept('b')).toEqual(was('b'))
    expect(kept('d')).toEqual(was('d'))
    expect(kept('a')!.lane).toBe(was('c')!.lane)
  })

  it('keeps cards and pinned items off reserved spans when another lane is free', () => {
    const reserved = [{ lane: 0, top: 90, bottom: 130 }]
    const { placed } = layout([{ item: 'x', y: 120, score: 10 }], { ...two, reserved })
    expect(placed[0].lane).toBe(1)
    const one = layout([{ item: 'x', y: 120, score: 10 }], { ...opts, lanes: 1, reserved })
    expect(one.placed).toEqual([])
  })
})

describe('at scale', () => {
  // Deterministic pseudo-random items.
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const items = Array.from({ length: 3000 }, (_, i) => ({ item: `e${i}`, y: rand() * 40000, score: Math.floor(rand() * 100) }))
  const two = { ...opts, lanes: 2, reserved: [{ lane: 1, top: 5000, bottom: 5060 }] }

  it('never overlaps two cards in a lane, or a card and a reserved span', () => {
    const { placed, clusters } = layout(items, two)
    for (const lane of [0, 1]) {
      const cards = placed.filter((c) => c.lane === lane).sort((a, b) => a.top - b.top)
      for (let i = 1; i < cards.length; i++) expect(cards[i].top).toBeGreaterThanOrEqual(cards[i - 1].top + opts.cardHeight + opts.gap)
    }
    for (const c of placed.filter((c) => c.lane === 1)) expect(c.top + opts.cardHeight + opts.gap <= 5000 || c.top >= 5060).toBe(true)
    expect(placed.length + clusters.reduce((n, c) => n + c.items.length, 0)).toBe(items.length)
  })

  it('gives the same result with a precomputed order', () => {
    expect(layout(items, { ...two, order: priorityOrder(items) })).toEqual(layout(items, two))
  })
})

describe('variable event heights', () => {
  const heightFor = (id: string) => id === 'selected' ? 240 : 80
  const items = [
    { item: 'above', y: 100, score: 90 },
    { item: 'selected', y: 210, score: 10 },
    { item: 'overlapped', y: 340, score: 80 },
    { item: 'below', y: 600, score: 70 },
  ]
  it('reserves the full height of a pinned selection and keeps other entries collision-free', () => {
    const { placed, clusters } = layout(items, { ...opts, heightFor, pin: 'selected' })
    expect(placed.map((c) => c.item)).toEqual(['above', 'selected', 'below'])
    expect(clusters.flatMap((c) => c.items)).toEqual(['overlapped'])
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].top).toBeGreaterThanOrEqual(placed[i - 1].top + heightFor(placed[i - 1].item) + opts.gap)
    }
  })
})

describe('overview milestones', () => {
  it('represents nearby and same-date milestones without inflating their scores', () => {
    const items = [
      { item: 'overview-a', y: 100, score: 70 },
      { item: 'overview-b', y: 100, score: 60 },
      { item: 'higher-score', y: 110, score: 99 },
    ]
    const result = layout(items, { ...opts, mustShow: (item) => item.startsWith('overview') })
    expect(result.placed.map((p) => p.item)).toEqual(['overview-a', 'overview-b'])
    expect(result.placed[1].top).toBeGreaterThanOrEqual(result.placed[0].top + opts.cardHeight + 2 * opts.gap)
    expect(result.placed.map((p) => p.y)).toEqual([100, 100]) // truthful date anchors
    expect(result.clusters.flatMap((c) => c.items)).toEqual(['higher-score'])
  })
  it('keeps overview cards clear of headings and is deterministic at repeated zoom positions', () => {
    const items = [{ item: 'overview', y: 110, score: 50 }]
    const options = { ...opts, mustShow: () => true, reserved: [{ lane: 0, top: 80, bottom: 140 }] }
    const first = layout(items, options)
    expect(first.placed[0].top).toBeGreaterThanOrEqual(140 + opts.gap)
    expect(layout(items, options)).toEqual(first)
  })
  it('allows matching events to win when a milestone does not match active filters', () => {
    const items = [{ item: 'faded-overview', y: 100, score: 95 }, { item: 'matching', y: 110, score: 1050 }]
    expect(layout(items, { ...opts, mustShow: () => false }).placed.map((p) => p.item)).toEqual(['matching'])
  })
})

it('reuses cached overview indexes across zoom frames', () => {
  const order = new Int32Array([0, 1])
  const items = [{ item: 'a', y: 100, score: 10 }, { item: 'b', y: 110, score: 20 }]
  const first = layout(items, { ...opts, requiredOrder: order })
  expect(first.placed).toHaveLength(2)
  items[1].y = 400
  const expanded = layout(items, { ...opts, requiredOrder: order })
  expect(expanded.placed).toHaveLength(2)
  expect(expanded.placed[1].top).toBe(400 - opts.anchorOffset)
  expect(Array.from(order)).toEqual([0, 1])
})
