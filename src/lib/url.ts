export interface ViewState {
  event: string | null
  zoom: number
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 40

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/**
 * Reads "#e=<id>&z=<zoom>". A bare "#<id>" from older links is read as an event id.
 */
export function parseHash(hash: string): ViewState {
  const raw = hash.replace(/^#/, '')
  if (!raw) return { event: null, zoom: 1 }
  if (!raw.includes('=')) return { event: decodeURIComponent(raw), zoom: 1 }
  const params = new URLSearchParams(raw)
  const z = params.get('z')
  return {
    event: params.get('e') || null,
    zoom: z === null ? 1 : clampZoom(Number(z)),
  }
}

export function formatHash(state: ViewState): string {
  const params = new URLSearchParams()
  if (state.event) params.set('e', state.event)
  if (Math.abs(state.zoom - 1) > 0.001) params.set('z', String(Math.round(state.zoom * 100) / 100))
  const s = params.toString()
  return s ? `#${s}` : ''
}
