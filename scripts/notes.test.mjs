import { describe, expect, it } from 'vitest'
import { checkNotes, parseDescription, parseNotes } from './notes.mjs'

describe('parseNotes', () => {
  it('leaves plain text alone', () => {
    expect(parseNotes('Just text.')).toEqual({ parts: [{ kind: 'text', text: 'Just text.' }], notes: [], errors: [] })
  })

  it('finds citation-needed markers and numbered notes', () => {
    const { parts, notes, errors } = parseNotes('A claim {citation needed}. A date {note: from the archive} and {note: second}.')
    expect(errors).toEqual([])
    expect(notes).toEqual(['from the archive', 'second'])
    expect(parts).toEqual([
      { kind: 'text', text: 'A claim' },
      { kind: 'cn' },
      { kind: 'text', text: '. A date' },
      { kind: 'note', n: 1, text: 'from the archive' },
      { kind: 'text', text: ' and' },
      { kind: 'note', n: 2, text: 'second' },
      { kind: 'text', text: '.' },
    ])
  })

  it('reports unknown and unmatched markers', () => {
    expect(parseNotes('x {cn}').errors[0]).toMatch(/unknown marker/)
    expect(parseNotes('x {note:}').errors[0]).toMatch(/unknown marker/)
    expect(parseNotes('x {note: open').errors).toEqual(['unmatched { or }'])
  })
})

describe('checkNotes', () => {
  const ev = { title: 'T', summary: 'S' }
  it('rejects markers outside the description', () => {
    expect(checkNotes({ ...ev, summary: 'S {citation needed}' })).toHaveLength(1)
  })
  it('rejects the old parenthetical wording', () => {
    expect(checkNotes({ ...ev, description: 'A claim (low confidence; additional citation needed).' })).toHaveLength(1)
    expect(checkNotes({ ...ev, description: 'A claim {citation needed}.' })).toEqual([])
  })
})

describe('parseDescription', () => {
  it('numbers notes across paragraphs', () => {
    const { paragraphs, notes } = parseDescription('One {note: a}.\n\nTwo {note: b}.')
    expect(notes).toEqual(['a', 'b'])
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[1][1]).toEqual({ kind: 'note', n: 2, text: 'b' })
  })

  it('reports a marker split by a blank line', () => {
    expect(parseDescription('One {note: a\n\nb}.').errors).not.toEqual([])
  })
})
