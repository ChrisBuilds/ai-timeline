import { NO_FILTERS, type Filters } from './filters'

export interface ViewState {
  event: string | null
  zoom: number
  filters: Filters
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 40

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

// Filter values are joined with "|" because organization names can contain commas.
const FILTER_KEYS = { c: 'categories', o: 'organizations', t: 'tags' } as const

function list(params: URLSearchParams, key: string): string[] {
  const v = params.get(key)
  return v ? v.split('|').filter(Boolean) : []
}

/**
 * Reads "#e=<id>&z=<zoom>&c=<categories>&o=<orgs>&t=<tags>".
 * A bare "#<id>" from older links is read as an event id.
 */
export function parseHash(hash: string): ViewState {
  const raw = hash.replace(/^#/, '')
  if (!raw) return { event: null, zoom: 1, filters: { ...NO_FILTERS } }
  if (!raw.includes('=')) return { event: decodeURIComponent(raw), zoom: 1, filters: { ...NO_FILTERS } }
  const params = new URLSearchParams(raw)
  const z = params.get('z')
  return {
    event: params.get('e') || null,
    zoom: z === null ? 1 : clampZoom(Number(z)),
    filters: {
      categories: list(params, 'c'),
      organizations: list(params, 'o'),
      tags: list(params, 't'),
    },
  }
}

export function formatHash(state: ViewState): string {
  const params = new URLSearchParams()
  if (state.event) params.set('e', state.event)
  if (Math.abs(state.zoom - 1) > 0.001) params.set('z', String(Math.round(state.zoom * 100) / 100))
  for (const [key, field] of Object.entries(FILTER_KEYS)) {
    const values = state.filters[field]
    if (values.length) params.set(key, values.join('|'))
  }
  const s = params.toString()
  return s ? `#${s}` : ''
}
