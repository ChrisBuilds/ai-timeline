// Synthetic timeline data for benchmarks. Deterministic for a given count and
// seed, shaped like real data: most events are recent, most are minor, and
// organizations, tags and people repeat with a long tail.
//
//   node bench/synthetic.mjs 5000 > /tmp/events.json

import { computeScore, tierOf } from '../scripts/importance.mjs'

const CATEGORIES = [
  'research',
  'model release',
  'product',
  'company and funding',
  'policy and regulation',
  'safety and security incident',
  'hardware and compute',
  'benchmark milestone',
  'open source',
  'culture and society',
  'misinformation',
]
const WORDS =
  'neural model language vision agent reasoning benchmark scaling transformer robot chip policy safety open dataset compute speech image video code search memory alignment training inference'.split(
    ' ',
  )

/** Small, fast, seedable PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * @param {number} count
 * @param {number} [seed]
 * @returns {import('../src/lib/types').TimelineData}
 */
export function generate(count, seed = 1) {
  const r = rng(seed)
  const pick = (list, skew = 1.6) => list[Math.floor(Math.pow(r(), skew) * list.length)]
  const orgs = Array.from({ length: Math.max(20, Math.round(count / 15)) }, (_, i) => `Org ${i}`)
  const people = Array.from({ length: Math.max(30, Math.round(count / 6)) }, (_, i) => `Person ${i}`)
  const tags = Array.from({ length: Math.max(30, Math.round(count / 10)) }, (_, i) => `${WORDS[i % WORDS.length]} ${i}`)
  const end = 2026.8
  const events = []
  for (let i = 0; i < count; i++) {
    // Density rises steeply towards the present.
    const year = end - Math.pow(r(), 3.2) * (end - 1942)
    const y = Math.floor(year)
    const month = 1 + Math.floor((year - y) * 12)
    const day = 1 + Math.floor(r() * 28)
    const precision = r()
    const date = precision < 0.1 ? `${y}` : precision < 0.25 ? `${y}-${pad(month)}` : `${y}-${pad(month)}-${pad(day)}`
    // Mostly low ratings; a few landmarks.
    const rate = () => Math.min(5, 1 + Math.floor(Math.pow(r(), 2.2) * 5))
    const importance = { rubric: { capability: rate(), adoption: rate(), impact: rate(), culture: rate() } }
    const score = computeScore(importance)
    const title = `${pick(WORDS, 1)} ${pick(WORDS, 1)} ${pick(WORDS, 1)} event ${i}`
    const id = `${date}-synthetic-${i}`
    events.push({
      id,
      title: title[0].toUpperCase() + title.slice(1),
      date,
      summary: `A synthetic event about ${pick(WORDS, 1)} and ${pick(WORDS, 1)}, used to measure how the timeline performs with ${count} events.`,
      category: pick(CATEGORIES, 1.2),
      organizations: [pick(orgs), ...(r() < 0.3 ? [pick(orgs)] : [])].filter((v, j, a) => a.indexOf(v) === j),
      people: r() < 0.4 ? [pick(people)] : undefined,
      tags: [pick(tags), pick(tags), pick(tags)].filter((v, j, a) => a.indexOf(v) === j),
      sources: [{ url: `https://example.com/${i}`, title: `Source ${i}`, publisher: 'Example', accessed: '2026-11-03' }],
      importance,
      score,
      tier: tierOf(score),
    })
  }
  // Same order as build-data.mjs writes: newest first.
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { generated: '2026-11-03T00:00:00Z', events, removed: [] }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? 1000)
  process.stdout.write(JSON.stringify(generate(count, Number(process.argv[3] ?? 1))))
}
