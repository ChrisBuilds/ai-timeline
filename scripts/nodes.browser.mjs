// Hidden events are nodes on the spine; zooming grows cards out of them and
// shrinks cards back into them.   npm run test:nodes
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generate } from '../bench/synthetic.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const port = 4352
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
let browser
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview did not start')), 10000)
    const fail = (error) => { clearTimeout(timeout); reject(error) }
    server.once('error', fail)
    server.once('exit', (code) => fail(new Error(`Preview exited: ${code}`)))
    let output = ''
    server.stdout.on('data', (data) => {
      output += String(data)
      if (output.replace(/\u001b\[[0-9;]*m/g, '').includes(`:${port}/`)) { clearTimeout(timeout); resolve() }
    })
  })
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const data = generate(1000, 7)
  const errors = []
  const total = async (page) => (await page.locator('.era-count').allTextContents()).reduce((n, text) => n + Number(text.match(/^[\d,]+/)[0].replaceAll(',', '')), 0)
  const nodeCount = (page) => page.evaluate(() => [...document.querySelectorAll('.nodes path')].reduce((n, p) => n + (p.getAttribute('d').match(/M/g)?.length ?? 0), 0))

  for (const colorScheme of ['light', 'dark']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const phone = viewport.width < 720
    const page = await browser.newPage({ viewport, colorScheme, isMobile: phone, hasTouch: phone })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.route('**/data/index.json', (route) => route.fulfill({ json: data }))
    await page.route('**/data/details/*.json', (route) => route.fulfill({ json: { description: 'Test details.', sources: [], artifacts: [] } }))
    await page.goto(`http://127.0.0.1:${port}/ai-timeline/`)
    await page.locator('.card').first().waitFor()
    await page.evaluate(() => scrollTo(0, 1200))
    await page.waitForTimeout(150)
    assert.equal(await total(page), data.events.length, 'era totals do not describe the entire collection')
    assert(await nodeCount(page) > 0, 'hidden events are not drawn as nodes')
    assert.equal(await page.locator('.event-group, .cluster-menu').count(), 0, 'hidden-count cards are still shown')

    // Zooming in: new cards start small at their node and grow; none appear at full size.
    const frames = await page.evaluate(async () => {
      const seen = new Set([...document.querySelectorAll('article.card')].map((c) => c.id))
      const out = { grown: 0, popped: [], shrunk: 0 }
      const watch = (frames) => new Promise((resolve) => {
        const step = () => {
          for (const c of document.querySelectorAll('article.card')) {
            const box = c.getBoundingClientRect()
            if (seen.has(c.id) || box.bottom < 0 || box.top > innerHeight) continue
            seen.add(c.id)
            if (c.closest('.leaving')) continue
            // A full-width box on the first frame it is on screen would be a pop.
            if (box.width >= c.offsetWidth - 1 && getComputedStyle(c).opacity === '1') out.popped.push(c.id)
            else out.grown++
          }
          out.shrunk += document.querySelectorAll('li.leaving').length > 0 ? 1 : 0
          if (--frames > 0) requestAnimationFrame(step); else resolve()
        }
        requestAnimationFrame(step)
      })
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
      await watch(40)
      return out
    })
    assert(frames.grown > 0, 'zooming in revealed no cards from their nodes')
    assert.deepEqual(frames.popped, [], 'cards popped in at full size')
    await page.waitForTimeout(600)
    assert.equal(await page.locator('li.leaving, li.reveal').count(), 0, 'reveal animations did not finish')

    // Zooming out: cards that lose their room shrink into their node, then go.
    const leaving = await page.evaluate(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }))
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }))
      let most = 0
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        for (const li of document.querySelectorAll('li.leaving')) {
          const card = li.querySelector('.card')
          // Leaving cards don't take clicks and are hidden from assistive tech.
          if (!li.inert || li.getAttribute('aria-hidden') !== 'true') throw new Error('leaving card is still interactive')
          if (card) most = Math.max(most, 1 - card.getBoundingClientRect().width / card.offsetWidth)
        }
      }
      return most
    })
    assert(leaving > 0.2, 'zooming out did not shrink cards into their nodes')
    await page.waitForTimeout(600)
    assert.equal(await page.locator('li.leaving').count(), 0, 'leaving cards were not removed')

    // Settled cards never overlap one another or an era heading.
    const collisions = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.card')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top)
      const headings = [...document.querySelectorAll('.era-label')].map((e) => e.getBoundingClientRect())
      return rows.some((a, i) => i && a.top < rows[i - 1].bottom - 0.5) ||
        rows.some((a) => headings.some((b) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5))
    })
    assert.equal(collisions, false, 'cards collide with each other or era headings')

    // Clicking a node opens that event.
    const target = await page.evaluate(() => {
      const path = document.querySelector('.nodes path').getAttribute('d')
      const svg = document.querySelector('.nodes').getBoundingClientRect()
      const box = document.querySelector('.timeline').getBoundingClientRect()
      const ys = [...path.matchAll(/M[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]) + box.top)
      const y = ys.find((y) => y > 200 && y < innerHeight - 300)
      return y === undefined ? null : { x: svg.left + svg.width / 2, y }
    })
    assert(target, 'no hidden node on screen to click')
    if (!phone) {
      await page.mouse.move(target.x, target.y)
      await page.locator('.node-tip').waitFor()
    }
    await page.mouse.click(target.x, target.y)
    await page.locator('.card.selected').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow')
    await page.close()
  }

  // With reduced motion, cards appear and go at once.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.route('**/data/index.json', (route) => route.fulfill({ json: data }))
    await page.goto(`http://127.0.0.1:${port}/ai-timeline/`)
    await page.locator('.card').first().waitFor()
    await page.keyboard.press('+')
    await page.keyboard.press('-')
    assert.equal(await page.locator('li.leaving, li.reveal').count(), 0, 'reduced motion still animates the reveal')
    await page.close()
  }

  // A valid event dated today must render even before its midday date anchor.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.clock.setFixedTime(new Date('2026-11-04T08:00:00Z'))
    const today = generate(2, 7)
    for (const event of today.events) { event.date = '2026-11-04'; delete event.end_date }
    await page.route('**/data/index.json', (route) => route.fulfill({ json: today }))
    await page.goto(`http://127.0.0.1:${port}/ai-timeline/`)
    await page.locator('.card').nth(1).waitFor()
    assert.equal(await page.locator('.era-count').first().innerText(), '2 events · 2 shown')
    assert.equal(await nodeCount(page), 0, 'nearby space should show both current-day events')
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log('Node reveal checks passed: era totals, hidden nodes, cards growing from and shrinking into nodes, collision-free settled cards, node hover and click, reduced motion, in both themes at desktop/phone/320px widths.')
} finally {
  await browser?.close()
  server.kill()
}
