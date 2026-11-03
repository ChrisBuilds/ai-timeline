import { describe, expect, it } from 'vitest'
import { layout, type LayoutOptions } from './layout'

const opts: LayoutOptions = { lanes: 1, cardHeight: 80, gap: 10, anchorOffset: 10, clusterPx: 30 }

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
