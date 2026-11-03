// A small, safe markdown renderer for event descriptions.
//
// It parses into nodes that Svelte renders as elements, so no HTML from an
// event file ever reaches the page. Supported:
//
//   blocks   paragraphs, "- " or "* " lists, "1. " lists, "> " quotes
//   inline   **bold**, *italic* or _italic_, `code`, [text](https://…)
//   notes    {citation needed} and {note: …} (see scripts/notes.mjs)
//
// Anything else stays as plain text.

import { parseNotes } from '../../scripts/notes.mjs'

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'cn'; i: number }
  | { kind: 'note'; n: number }

export type Block =
  | { kind: 'p' | 'quote'; content: Inline[] }
  | { kind: 'ul' | 'ol'; items: Inline[][] }

export interface Description {
  blocks: Block[]
  /** Note texts in order; note n is notes[n - 1]. */
  notes: Inline[][]
  /** How many {citation needed} markers there are. */
  citationsNeeded: number
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/i

// Order matters: ** before *, and code first so its contents stay literal.
const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|\*(?=\S)([\s\S]+?)(?<=\S)\*|(?<![\p{L}\p{N}])_(?=\S)([\s\S]+?)(?<=\S)_(?![\p{L}\p{N}])|\[([^\]\n]+)\]\(([^)\s]+)\)/gu

/** Parses inline markdown with no note markers in it. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const [whole, code, strong, em1, em2, linkText, href] = m
    const at = m.index ?? 0
    let node: Inline | null = null
    if (code !== undefined) node = { kind: 'code', text: code }
    else if (strong !== undefined) node = { kind: 'strong', children: parseInline(strong) }
    else if (em1 !== undefined || em2 !== undefined) node = { kind: 'em', children: parseInline(em1 ?? em2) }
    else if (linkText !== undefined && SAFE_HREF.test(href)) node = { kind: 'link', href, children: parseInline(linkText) }
    if (!node) continue
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    out.push(node)
    last = at + whole.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** Collapses the line breaks YAML keeps inside a paragraph. */
const flow = (s: string) => s.replace(/\s*\n\s*/g, ' ')

const LIST_ITEM = /^\s*(?:([-*])|(\d+)[.)])\s+/

export function parseDescription(text: string): Description {
  const notes: Inline[][] = []
  let citationsNeeded = 0

  // Inline content with note markers, numbering notes across the description.
  const content = (raw: string): Inline[] =>
    parseNotes(flow(raw)).parts.flatMap((part): Inline[] => {
      if (part.kind === 'cn') return [{ kind: 'cn', i: citationsNeeded++ }]
      if (part.kind === 'note') {
        notes.push(parseInline(part.text))
        return [{ kind: 'note', n: notes.length }]
      }
      return parseInline(part.text)
    })

  const blocks: Block[] = []
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim())
    if (!lines.length) continue

    if (lines.every((l) => /^\s*>/.test(l))) {
      blocks.push({ kind: 'quote', content: content(lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n')) })
      continue
    }

    const first = lines[0].match(LIST_ITEM)
    if (first) {
      // Lines that don't start a new item continue the one before.
      const items: string[] = []
      for (const l of lines) {
        const m = l.match(LIST_ITEM)
        if (m) items.push(l.slice(m[0].length))
        else if (items.length) items[items.length - 1] += '\n' + l
      }
      blocks.push({ kind: first[1] ? 'ul' : 'ol', items: items.map(content) })
      continue
    }

    blocks.push({ kind: 'p', content: content(chunk.trim()) })
  }
  return { blocks, notes, citationsNeeded }
}
