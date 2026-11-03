import { describe, expect, it } from 'vitest'
import { buildIndex, normalize, search } from './search'
import type { TimelineEvent } from './types'

function ev(id: string, title: string, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id,
    title,
    date: '2020',
    summary: 'A summary that is long enough to pass.',
    category: 'research',
    score: 50,
    tier: 3,
    ...extra,
  }
}

const events = [
  ev('a', 'Transformer architecture introduced', { organizations: ['Google Brain'], tags: ['attention'] }),
  ev('b', 'GPT-4 released', { organizations: ['OpenAI'], summary: 'A multimodal model built on the transformer.' }),
  ev('c', 'AlphaGo beats Lee Sedol', { organizations: ['DeepMind'], tags: ['games'], score: 90 }),
  ev('d', 'Deep Blue defeats Kasparov', { organizations: ['IBM'], tags: ['games'], score: 80 }),
]
const index = buildIndex(events)

describe('search', () => {
  it('ranks title matches above summary matches', () => {
    expect(search(index, 'transformer').map((e) => e.id)).toEqual(['a', 'b'])
  })
  it('matches organizations and tags', () => {
    expect(search(index, 'openai').map((e) => e.id)).toEqual(['b'])
    expect(search(index, 'games').map((e) => e.id)).toEqual(['c', 'd'])
  })
  it('needs every term to match', () => {
    expect(search(index, 'games ibm').map((e) => e.id)).toEqual(['d'])
    expect(search(index, 'games openai')).toEqual([])
  })
  it('ignores case and accents', () => {
    expect(normalize('Señor GPT')).toBe('senor gpt')
    expect(search(index, 'ALPHAGO').map((e) => e.id)).toEqual(['c'])
  })
  it('returns nothing for a blank query', () => {
    expect(search(index, '   ')).toEqual([])
  })
})
