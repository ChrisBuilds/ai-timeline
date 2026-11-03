// In-text notes in event descriptions.
//
//   {citation needed}   marks the claim before it as low confidence
//   {note: some text}   a note about the text, shown as a numbered footnote
//
// Notes keep research caveats out of the sentence itself, so the description
// reads cleanly and the caveats still show in the detail panel.

const MARKER = /\{([^{}]*)\}/g
// Wording the markup replaces; the validator rejects it outside a marker.
const OLD_WORDING = /\((?:[^()]*;\s*)?(?:low confidence|additional citation needed|citation needed)[^()]*\)/i

/** @typedef {{ kind: 'text', text: string } | { kind: 'cn' } | { kind: 'note', n: number, text: string }} Part */

/**
 * Splits text into plain text, citation-needed markers and notes.
 * @param {string} text
 * @returns {{ parts: Part[], notes: string[], errors: string[] }}
 */
export function parseNotes(text) {
  /** @type {Part[]} */
  const parts = []
  /** @type {string[]} */
  const notes = []
  /** @type {string[]} */
  const errors = []
  let last = 0
  for (const m of text.matchAll(MARKER)) {
    const index = m.index ?? 0
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) })
    last = index + m[0].length
    const body = m[1].trim()
    if (body === 'citation needed') {
      parts.push({ kind: 'cn' })
    } else if (/^note:/.test(body) && body.slice(5).trim()) {
      const note = body.slice(5).trim()
      notes.push(note)
      parts.push({ kind: 'note', n: notes.length, text: note })
    } else {
      errors.push(`unknown marker "${m[0]}"; use {citation needed} or {note: …}`)
      parts.push({ kind: 'text', text: m[0] })
    }
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  // A marker sits right after the claim; drop the space a writer may leave before it.
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1]
    if (parts[i].kind !== 'text' && prev.kind === 'text') prev.text = prev.text.replace(/[ \t]+$/, '')
  }
  const rest = parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')
  if (/[{}]/.test(rest)) errors.push('unmatched { or }')
  return { parts: parts.filter((p) => p.kind !== 'text' || p.text), notes, errors }
}

/**
 * Splits a description into paragraphs at blank lines and parses each one,
 * numbering notes across the whole description.
 * @param {string} text
 */
export function parseDescription(text) {
  /** @type {string[]} */
  const notes = []
  /** @type {string[]} */
  const errors = []
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const parsed = parseNotes(p)
      errors.push(...parsed.errors)
      return parsed.parts.map((part) => {
        if (part.kind !== 'note') return part
        notes.push(part.text)
        return { ...part, n: notes.length }
      })
    })
  return { paragraphs, notes, errors }
}

/**
 * Problems with the notes in one event, for the validator.
 * @param {{ title: string, summary: string, description?: string }} ev
 */
export function checkNotes(ev) {
  /** @type {string[]} */
  const errors = []
  for (const field of /** @type {const} */ (['title', 'summary'])) {
    if (/[{}]/.test(ev[field])) errors.push(`${field} cannot hold {…} markers; put notes in the description`)
  }
  if (ev.description) {
    for (const e of parseDescription(ev.description).errors) errors.push(`description: ${e}`)
    const old = ev.description.match(OLD_WORDING)
    if (old) errors.push(`description: write "${old[0]}" as {citation needed} or {note: …}`)
  }
  return errors
}
