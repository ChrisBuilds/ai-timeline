import { describe, expect, it } from 'vitest'
import { facets, isActive, matches, toggle, NO_FILTERS } from './filters'
import type { TimelineEvent } from './types'

const base = {
  date: '2020',
  summary: 'A summary that is long enough to pass.',
  sources: [],
  importance: { rubric: { capability: 3, adoption: 3, impact: 3, culture: 3 } },
  score: 50,
  tier: 3 as const,
}
const a: TimelineEvent = { ...base, id: 'a', title: 'A', category: 'research', organizations: ['Google'], tags: ['nlp'] }
const b: TimelineEvent = { ...base, id: 'b', title: 'B', category: 'product', organizations: ['OpenAI'], tags: ['nlp', 'chat'] }
const c: TimelineEvent = { ...base, id: 'c', title: 'C', category: 'research' }

describe('matches', () => {
  it('passes everything with no filters', () => {
    expect([a, b, c].every((e) => matches(e, NO_FILTERS))).toBe(true)
    expect(isActive(NO_FILTERS)).toBe(false)
  })
  it('ORs values within a facet', () => {
    const f = { ...NO_FILTERS, organizations: ['Google', 'OpenAI'] }
    expect([a, b, c].filter((e) => matches(e, f)).map((e) => e.id)).toEqual(['a', 'b'])
  })
  it('ANDs across facets', () => {
    const f = { ...NO_FILTERS, categories: ['research'], tags: ['nlp'] }
    expect([a, b, c].filter((e) => matches(e, f)).map((e) => e.id)).toEqual(['a'])
  })
})

describe('facets', () => {
  it('counts values, most used first', () => {
    const f = facets([a, b, c])
    expect(f.categories).toEqual([
      { value: 'research', count: 2 },
      { value: 'product', count: 1 },
    ])
    expect(f.tags[0]).toEqual({ value: 'nlp', count: 2 })
  })
})

describe('toggle', () => {
  it('adds and removes', () => {
    expect(toggle(['x'], 'y')).toEqual(['x', 'y'])
    expect(toggle(['x', 'y'], 'x')).toEqual(['y'])
  })
})
