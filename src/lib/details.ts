import type { EventDetails } from './types'

export type DetailsLoader = (id: string) => Promise<EventDetails>

/**
 * Loads an event's details from data/details/<id>.json. Each event is fetched
 * at most once; a failed fetch is forgotten so it can be tried again.
 */
export function createDetailsLoader(base: string, fetcher: typeof fetch = fetch): DetailsLoader {
  const cache = new Map<string, Promise<EventDetails>>()
  return (id) => {
    let pending = cache.get(id)
    if (!pending) {
      pending = fetcher(`${base}data/details/${encodeURIComponent(id)}.json`).then((r) =>
        r.ok ? (r.json() as Promise<EventDetails>) : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      cache.set(id, pending)
      pending.catch(() => cache.delete(id))
    }
    return pending
  }
}
