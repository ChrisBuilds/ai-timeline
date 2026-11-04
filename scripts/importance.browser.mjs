import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const index = JSON.parse(readFileSync(new URL('../dist/data/index.json', import.meta.url), 'utf8'))
const milestones = index.events.filter((e) => e.overview).map((e) => e.id)
const required = ['2022-11-30-chatgpt-launch', '2025-02-24-claude-code-research-preview']
const port = 4353
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
let browser
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Preview did not start')), 10000)
    server.once('error', reject)
    server.once('exit', (code) => { clearTimeout(timeout); reject(Error(`Preview exited: ${code}`)) })
    let output = ''
    server.stdout.on('data', (data) => {
      output += String(data)
      if (output.replace(/\u001b\[[0-9;]*m/g, '').includes(`:${port}/`)) { clearTimeout(timeout); resolve() }
    })
  })
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const errors = []
  const base = `http://127.0.0.1:${port}/ai-timeline/`
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce', colorScheme: 'light' })
    page.on('pageerror', (e) => errors.push(String(e)))
    const counts = []
    for (const zoom of [0.5, 1, 2, 4]) {
      // No event parameter: nothing is pinned to make this assertion pass.
      await page.goto(base + `#z=${zoom}`)
      await page.locator('.card').first().waitFor()
      if (zoom === 1 && process.env.IMPORTANCE_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.IMPORTANCE_SCREENSHOT_DIR}/importance-${viewport.width}.png` })
      const result = await page.evaluate(async () => {
        const ids = new Set()
        const collisions = []
        const pause = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const step = Math.max(200, innerHeight / 2)
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          scrollTo(0, y)
          await pause()
          const rows = [...document.querySelectorAll('.card, .event-group')].map((el) => ({ id: el.id, box: el.getBoundingClientRect() })).sort((a, b) => a.box.top - b.box.top)
          for (const card of document.querySelectorAll('.card')) ids.add(card.id)
          const headings = [...document.querySelectorAll('.era-label')].map((e) => e.getBoundingClientRect())
          for (let i = 1; i < rows.length; i++) if (rows[i].box.top < rows[i - 1].box.bottom - 0.5) collisions.push([rows[i - 1].id, rows[i].id])
          for (const r of rows) if (headings.some((h) => r.box.top < h.bottom - 0.5 && r.box.bottom > h.top + 0.5)) collisions.push(['heading', r.id])
        }
        return { ids: [...ids], collisions, overflow: document.documentElement.scrollWidth > innerWidth, selected: document.querySelector('.card.selected') !== null }
      })
      assert.equal(result.selected, false, 'baseline must have no selection')
      assert.deepEqual(result.collisions, [], `row collisions at ${viewport.width}px / ${zoom}×`)
      assert.equal(result.overflow, false, 'horizontal overflow')
      for (const id of milestones) assert(result.ids.includes(id), `overview milestone ${id} missing at ${zoom}× / ${viewport.width}px`)
      for (const id of required) assert(result.ids.includes(id), `required launch ${id} missing`)
      counts.push(result.ids.length)
    }
    assert(counts[3] > counts[1], 'zoom did not reveal additional supporting events')
    console.log(`${viewport.width}px: ${counts.join(', ')} individual cards at 0.5×, 1×, 2×, 4×; ${milestones.length} overview milestones preserved`)

    await page.goto(base + '#e=2022-11-30-chatgpt-launch&z=1')
    await page.locator('.importance').waitFor()
    assert((await page.locator('.importance').innerText()).includes('90/100'))
    await page.getByText('Assessment evidence and history', { exact: true }).click()
    await page.locator('.importance dt').first().waitFor()
    assert((await page.locator('.importance').innerText()).includes('Downstream influence · 35%'))
    await page.locator('.importance summary').filter({ hasText: 'Original assessment · v1' }).click()
    assert((await page.locator('.importance').innerText()).includes('Original assessment date unknown.'))
    assert((await page.locator('.importance').innerText()).includes('94/100'))

    await page.goto(base + '#e=2024-09-12-openai-o1&z=0.5')
    await page.locator('.card.selected').waitFor()
    assert.equal(await page.locator('.card.selected').getAttribute('id'), '2024-09-12-openai-o1', 'hidden event could not be selected')
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    await page.goto(base + '#z=1&o=Anthropic')
    await page.locator('.card.match').first().waitFor()
    assert.equal(await page.locator('.card.match').first().getAttribute('id'), '2025-02-24-claude-code-research-preview')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.close()
  }
  // A new provisional event has no original score to fall back to. The numeric
  // placement key must never be presented as an accepted point assessment.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    page.on('pageerror', (e) => errors.push(String(e)))
    const data = structuredClone(index)
    const e = data.events.find((e) => e.id === required[0])
    Object.assign(e, { score: 55, tier: 3, score_status: 'provisional', score_basis: 'v2-lower-bound', score_range: [55, 90] })
    const detail = JSON.parse(readFileSync(new URL(`../dist/data/details/${e.id}.json`, import.meta.url), 'utf8'))
    delete detail.importance.rubric
    delete detail.importance.legacy
    detail.importance.assessments[0].status = 'provisional'
    detail.importance.assessments[0].dimensions.influence.rating = null
    const comparison = data.events.find((item) => item.id === detail.importance.assessments[0].comparisons[0].id)
    comparison.aliases = [...(comparison.aliases ?? []), '1900-prior-comparison']
    detail.importance.assessments[0].comparisons[0].id = '1900-prior-comparison'
    detail.importance.assessments[0].comparisons[1].id = '1900-removed-comparison'
    await page.route('**/data/index.json', (route) => route.fulfill({ json: data }))
    await page.route(`**/data/details/${e.id}.json`, (route) => route.fulfill({ json: detail }))
    await page.goto(base + `#e=${e.id}`)
    await page.locator('.importance').waitFor()
    await page.getByText('Assessment evidence and history', { exact: true }).click()
    await page.locator('.importance dt').first().waitFor()
    const text = await page.locator('.importance').innerText()
    assert(text.includes('No accepted point score.'))
    assert(text.includes('55–90'))
    assert(text.includes('Unknown'))
    assert(!text.includes('Original assessment'))
    const comparisons = page.locator('.importance .comparison')
    assert.equal(await comparisons.first().innerText(), comparison.title, 'comparison alias was not resolved')
    assert.equal(await comparisons.last().isDisabled(), true, 'removed comparison should remain readable without broken navigation')
    await comparisons.first().click()
    await page.waitForFunction((id) => document.querySelector('.card.selected')?.id === id, comparison.id)
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log('Importance browser checks passed: baseline overview, zoom progression, collision-free groups, score history, hidden selection and filters.')
} finally {
  await browser?.close()
  server.kill()
}
