import { describe, expect, it } from 'vitest'
import { parseDescription, parseInline } from './markdown'

describe('parseInline', () => {
  it('parses emphasis, bold, code and links', () => {
    expect(parseInline('In *Nature*, **big** `x` [doc](https://a.b/c).')).toEqual([
      { kind: 'text', text: 'In ' },
      { kind: 'em', children: [{ kind: 'text', text: 'Nature' }] },
      { kind: 'text', text: ', ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'big' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://a.b/c', children: [{ kind: 'text', text: 'doc' }] },
      { kind: 'text', text: '.' },
    ])
  })

  it('keeps unsafe links and stray markers as text', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }])
    expect(parseInline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }])
    expect(parseInline('snake_case_name')).toEqual([{ kind: 'text', text: 'snake_case_name' }])
  })

  it('treats HTML as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  })
})

describe('parseDescription', () => {
  it('splits paragraphs and joins wrapped lines', () => {
    const { blocks } = parseDescription('One\ntwo.\n\nThree.\n')
    expect(blocks).toEqual([
      { kind: 'p', content: [{ kind: 'text', text: 'One two.' }] },
      { kind: 'p', content: [{ kind: 'text', text: 'Three.' }] },
    ])
  })

  it('parses lists and quotes', () => {
    const { blocks } = parseDescription('- a\n- b\n  more\n\n1. c\n\n> said')
    expect(blocks.map((b) => b.kind)).toEqual(['ul', 'ol', 'quote'])
    expect(blocks[0]).toEqual({
      kind: 'ul',
      items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b more' }]],
    })
  })

  it('numbers notes and counts citations across blocks', () => {
    const d = parseDescription('A.{citation needed} B.{note: In *Nature*.}\n\n- C.{note: two}{citation needed}')
    expect(d.citationsNeeded).toBe(2)
    expect(d.notes).toEqual([
      [{ kind: 'text', text: 'In ' }, { kind: 'em', children: [{ kind: 'text', text: 'Nature' }] }, { kind: 'text', text: '.' }],
      [{ kind: 'text', text: 'two' }],
    ])
    expect(d.blocks[1]).toEqual({
      kind: 'ul',
      items: [[{ kind: 'text', text: 'C.' }, { kind: 'note', n: 2 }, { kind: 'cn', i: 1 }]],
    })
  })
})
