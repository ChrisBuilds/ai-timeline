import type { TimelineEvent } from './types'

export interface Filters {
  categories: string[]
  organizations: string[]
  tags: string[]
  people: string[]
}

export const NO_FILTERS: Filters = { categories: [], organizations: [], tags: [], people: [] }

export function filterCount(f: Filters): number {
  return f.categories.length + f.organizations.length + f.tags.length + f.people.length
}

export function isActive(f: Filters): boolean {
  return filterCount(f) > 0
}

/** Filters showing only events that share `value` in `field`, or none if that is already the only filter. */
export function only(f: Filters, field: keyof Filters, value: string): Filters {
  const already = filterCount(f) === 1 && f[field][0] === value
  return already ? { ...NO_FILTERS } : { ...NO_FILTERS, [field]: [value] }
}

/** Any value within a facet may match; every facet in use must match. */
export function matches(e: TimelineEvent, f: Filters): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) return false
  if (f.organizations.length && !(e.organizations ?? []).some((o) => f.organizations.includes(o))) return false
  if (f.tags.length && !(e.tags ?? []).some((t) => f.tags.includes(t))) return false
  if (f.people.length && !(e.people ?? []).some((p) => f.people.includes(p))) return false
  return true
}

export interface Facet {
  value: string
  count: number
}

/** Values that appear on events, most used first, then alphabetical. */
export function facets(events: TimelineEvent[]): Record<keyof Filters, Facet[]> {
  const tally = (values: string[]) => {
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  return {
    categories: tally(events.map((e) => e.category)),
    organizations: tally(events.flatMap((e) => e.organizations ?? [])),
    tags: tally(events.flatMap((e) => e.tags ?? [])),
    people: tally(events.flatMap((e) => e.people ?? [])),
  }
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
