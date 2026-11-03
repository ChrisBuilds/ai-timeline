import type { TimelineEvent } from './types'

/** Lowercases and strips accents so "Señor" matches "senor". */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface Indexed {
  event: TimelineEvent
  title: string
  names: string
  summary: string
}

export function buildIndex(events: TimelineEvent[]): Indexed[] {
  return events.map((event) => ({
    event,
    title: normalize(event.title),
    names: normalize([...(event.organizations ?? []), ...(event.tags ?? []), ...(event.aliases ?? [])].join(' \u0000 ')),
    summary: normalize(event.summary),
  }))
}

function startsWord(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escape(term)}`).test(text)
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every term must match somewhere. Title matches rank above organization and
 * tag matches, which rank above summary matches; ties go to the higher score.
 */
export function search(index: Indexed[], query: string, limit = 8): TimelineEvent[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const hits: { event: TimelineEvent; rank: number }[] = []
  for (const row of index) {
    let rank = 0
    let ok = true
    for (const term of terms) {
      if (row.title.includes(term)) rank += startsWord(row.title, term) ? 6 : 4
      else if (row.names.includes(term)) rank += startsWord(row.names, term) ? 3 : 2
      else if (row.summary.includes(term)) rank += 1
      else {
        ok = false
        break
      }
    }
    if (ok) hits.push({ event: row.event, rank })
  }
  hits.sort((a, b) => b.rank - a.rank || b.event.score - a.event.score)
  return hits.slice(0, limit).map((h) => h.event)
}
