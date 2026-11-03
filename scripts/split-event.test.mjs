import { describe, expect, it } from 'vitest'
import { splitEvent } from './split-event.mjs'

describe('splitEvent', () => {
  it('moves panel-only fields into details and keeps the rest in the index entry', () => {
    const { entry, details } = splitEvent({
      id: '2024-x',
      title: 'X',
      date: '2024',
      summary: 'S',
      category: 'research',
      tags: ['t'],
      description: 'D',
      sources: [{ url: 'u' }],
      artifacts: [],
      importance: { rubric: {} },
      issue: 4,
      related: [{ id: '2023-y', relation: 'builds_on', source: 'https://example.com' }],
      score: 50,
      tier: 3,
    })
    expect(entry).toEqual({
      id: '2024-x',
      title: 'X',
      date: '2024',
      summary: 'S',
      category: 'research',
      tags: ['t'],
      related: [{ id: '2023-y', relation: 'builds_on' }],
      score: 50,
      tier: 3,
    })
    expect(details).toEqual({ description: 'D', sources: [{ url: 'u' }], artifacts: [], importance: { rubric: {} }, issue: 4 })
  })
})
