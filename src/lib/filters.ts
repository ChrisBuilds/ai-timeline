import type { TimelineEvent } from './types'

export interface Filters {
  categories: string[]
  organizations: string[]
  tags: string[]
}

export const NO_FILTERS: Filters = { categories: [], organizations: [], tags: [] }

export function isActive(f: Filters): boolean {
  return f.categories.length + f.organizations.length + f.tags.length > 0
}

/** Any value within a facet may match; every facet in use must match. */
export function matches(e: TimelineEvent, f: Filters): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) return false
  if (f.organizations.length && !(e.organizations ?? []).some((o) => f.organizations.includes(o))) return false
  if (f.tags.length && !(e.tags ?? []).some((t) => f.tags.includes(t))) return false
  return true
}

export interface Facet {
  value: string
  count: number
}

/** Values that appear on events, most used first, then alphabetical. */
export function facets(events: TimelineEvent[]): { categories: Facet[]; organizations: Facet[]; tags: Facet[] } {
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
  }
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
