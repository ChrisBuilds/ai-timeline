import { describe, expect, it } from 'vitest'
import { nearestNode, nodePath, RevealTracker, visibleNodes } from './nodes'

const node = (id: string, y: number) => ({ item: { id }, y })

describe('hidden event nodes', () => {
  const list = [node('a', 10), node('b', 11), node('c', 20), node('d', 40), node('e', 90)]

  it('keeps the window and draws nodes closer than the minimum gap once', () => {
    expect(visibleNodes(list, 10, 50, 2).map((n) => n.item.id)).toEqual(['a', 'c', 'd'])
    expect(visibleNodes(list, 15, 90).map((n) => n.item.id)).toEqual(['c', 'd'])
    expect(visibleNodes([], 0, 100)).toEqual([])
  })

  it('draws every node into one path', () => {
    expect(nodePath([], 3)).toBe('')
    const d = nodePath([{ y: 5 }, { y: 30 }], 3)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.startsWith('M-3,5a3,3')).toBe(true)
  })

  it('finds the nearest node within reach', () => {
    expect(nearestNode(list, 37, 8)?.item.id).toBe('d')
    expect(nearestNode(list, 14, 8)?.item.id).toBe('b')
    expect(nearestNode(list, 65, 8)).toBeNull()
    expect(nearestNode(list, 200, 200)?.item.id).toBe('e')
  })
})

describe('reveal tracking', () => {
  const card = (id: string, y: number, top = y - 18) => ({ item: { id }, y, top })

  it('animates nothing on the first layout', () => {
    const t = new RevealTracker<{ id: string }>(300)
    t.update([card('a', 100)], 0)
    expect(t.entering.size).toBe(0)
    expect(t.leaving.size).toBe(0)
  })

  it('marks cards that appear and keeps the offset of cards that go', () => {
    const t = new RevealTracker<{ id: string }>(300)
    t.update([card('a', 100), card('b', 200, 250)], 0)
    t.update([card('a', 110), card('c', 300)], 10)
    expect([...t.entering.keys()]).toEqual(['c'])
    expect(t.leaving.get('b')).toMatchObject({ offset: 50, until: 310 })
  })

  it('turns a returning card around and expires finished animations', () => {
    const t = new RevealTracker<{ id: string }>(300)
    t.update([card('a', 100), card('b', 200)], 0)
    t.update([card('a', 100)], 10)
    expect(t.leaving.has('b')).toBe(true)
    t.update([card('a', 100), card('b', 200)], 20)
    expect(t.leaving.has('b')).toBe(false)
    expect(t.entering.get('b')).toBe(320)
    expect(t.nextExpiry()).toBe(320)
    expect(t.prune(400)).toBe(true)
    expect(t.entering.size).toBe(0)
    expect(t.nextExpiry()).toBeNull()
  })

  it('animates nothing when motion is off', () => {
    const t = new RevealTracker<{ id: string }>(300)
    t.update([card('a', 100)], 0)
    t.update([card('b', 100)], 10, false)
    expect(t.entering.size + t.leaving.size).toBe(0)
  })
})
