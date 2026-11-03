import { describe, expect, it } from 'vitest'
import { layout, type LayoutOptions } from './layout'

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
