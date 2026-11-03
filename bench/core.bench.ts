// Micro-benchmarks for the work done on every zoom frame, filter change and keystroke.
//   npx vitest bench --run
import { bench, describe } from 'vitest'
import { generate } from './synthetic.mjs'
import { ERAS } from '../src/lib/eras'
import { buildScale } from '../src/lib/scale'
import { layout, priorityOrder } from '../src/lib/layout'
import { buildIndex, search } from '../src/lib/search'
import { facets, matches, NO_FILTERS } from '../src/lib/filters'
import { toYear } from '../src/lib/time'
import type { TimelineEvent } from '../src/lib/types'

const NOW = 2026.84
const OPTS = { lanes: 2, cardHeight: 84, gap: 10, anchorOffset: 18, clusterPx: 28 }
// CI runs a short sample: BENCH_SIZES=5000 BENCH_TIME=100.
const SIZES = (process.env.BENCH_SIZES ?? '1000,5000,20000').split(',').map(Number)
const TIME = Number(process.env.BENCH_TIME ?? 500)

for (const size of SIZES) {
  const events = generate(size, 7).events as TimelineEvent[]
  const years = events.map((e) => toYear(e.date))
  const index = buildIndex(events)

  describe(`${size} events`, () => {
    for (const zoom of [1, 10]) {
      bench(`buildScale, zoom ${zoom}`, () => {
        buildScale(ERAS, years, NOW, zoom)
      }, { time: TIME })
      const scale = buildScale(ERAS, years, NOW, zoom)
      const items = events.map((e, i) => ({ item: e, y: scale.y(years[i]), score: e.score }))
      bench(`layout, zoom ${zoom}`, () => {
        layout(items, OPTS)
      }, { time: TIME })
      const order = priorityOrder(events.map((e, i) => ({ item: e, y: -years[i], score: e.score })))
      bench(`one zoom frame (scale, y(), layout with cached order), zoom ${zoom}`, () => {
        const s = buildScale(ERAS, years, NOW, zoom)
        layout(
          events.map((e, i) => ({ item: e, y: s.y(years[i]), score: e.score })),
          { ...OPTS, order },
        )
      }, { time: TIME })
    }
    bench('buildIndex', () => {
      buildIndex(events)
    }, { time: TIME })
    bench('search "model reasoning"', () => {
      search(index, 'model reasoning')
    }, { time: TIME })
    bench('facets', () => {
      facets(events)
    }, { time: TIME })
    bench('matches (one organization)', () => {
      const f = { ...NO_FILTERS, organizations: ['Org 3'] }
      events.filter((e) => matches(e, f))
    }, { time: TIME })
  })
}
