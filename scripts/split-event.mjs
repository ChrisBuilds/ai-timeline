// Splits a full event record into the slim entry the timeline loads up front
// (data/index.json) and the details fetched when the event is opened
// (data/details/<id>.json). Used by build-data.mjs and the benchmarks.
//
// Keep in sync with TimelineEvent and EventDetails in src/lib/types.ts.

/** Fields only the detail panel shows. */
export const DETAIL_FIELDS = ['description', 'sources', 'artifacts', 'importance', 'submitted_by', 'issue']

/** @returns {{ entry: object, details: object }} */
export function splitEvent(event) {
  const entry = {}
  const details = {}
  for (const [key, value] of Object.entries(event)) {
    if (DETAIL_FIELDS.includes(key)) details[key] = value
    else entry[key] = value
  }
  // The timeline draws connections from ids and relation types; a link's source isn't shown.
  if (entry.related) entry.related = entry.related.map(({ id, relation }) => ({ id, relation }))
  return { entry, details }
}
