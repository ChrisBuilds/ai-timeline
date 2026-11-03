// Serves synthetic data to a Playwright page in place of the site's own:
// data/index.json and data/details/<id>.json.
import { generate } from './synthetic.mjs'
import { splitEvent } from '../scripts/split-event.mjs'

export async function serveSynthetic(page, size, seed = 7) {
  const full = generate(size, seed)
  const details = new Map()
  const index = []
  for (const ev of full.events) {
    const split = splitEvent(ev)
    index.push(split.entry)
    details.set(ev.id, JSON.stringify(split.details))
  }
  const indexBody = JSON.stringify({ ...full, events: index })
  const json = (body) => ({ body, contentType: 'application/json' })
  await page.route('**/data/index.json', (route) => route.fulfill(json(indexBody)))
  await page.route('**/data/details/*.json', (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop().replace(/\.json$/, ''))
    const body = details.get(id)
    return body ? route.fulfill(json(body)) : route.fulfill({ status: 404 })
  })
  return { indexBytes: indexBody.length }
}
