import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generate } from '../bench/synthetic.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const port = 4351
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
  // A same-day collection guarantees a large first group at any calendar date.
  const recent = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  for (const event of data.events) { event.date = recent; delete event.end_date }
  const errors = []
  for (const colorScheme of ['light', 'dark']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport, colorScheme, isMobile: viewport.width < 720, hasTouch: viewport.width < 720, reducedMotion: 'reduce' })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.route('**/data/index.json', (route) => route.fulfill({ json: data }))
    await page.route('**/data/details/*.json', (route) => route.fulfill({ json: { description: 'Test details.', sources: [], artifacts: [] } }))
    await page.goto(`http://127.0.0.1:${port}/ai-timeline/`)
    await page.locator('.event-group').first().waitFor()
    const beforeZoom = await page.locator('.zoom-level').innerText()
    const total = (await page.locator('.era-count').allTextContents()).reduce((n, text) => n + Number(text.match(/^[\d,]+/)[0].replaceAll(',', '')), 0)
    assert.equal(total, data.events.length, 'era totals do not describe the entire collection')
    const group = page.locator('.event-group').first()
    await group.scrollIntoViewIfNeeded()
    const groupId = await group.getAttribute('id')
    const label = await group.innerText()
    assert(label.includes('more event'), 'hidden count is not persistent')
    const collisions = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.card, .event-group')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top)
      const headings = [...document.querySelectorAll('.era-label')].map((e) => e.getBoundingClientRect())
      return rows.some((a, i) => rows.slice(i + 1).some((b) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5)) ||
        rows.some((a) => headings.some((b) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5))
    })
    assert.equal(collisions, false, 'group rows collide with events or era headings')
    await group.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: 'Events in this group' }).waitFor()
    assert.equal(await page.locator('.zoom-level').innerText(), beforeZoom, 'browsing changed zoom')
    assert.equal(await page.locator('.group-events button').count(), 12, 'first page is not bounded')
    const firstPage = await page.locator('.group-events button').allTextContents()
    const background = await page.evaluate(() => scrollY)
    const box = await page.locator('#group-browser').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(80)
    assert(await page.locator('#group-browser').evaluate(e => e.scrollTop) > 0, 'group browser does not scroll')
    await page.locator('#group-browser').evaluate(e => { e.scrollTop = e.scrollHeight })
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(50)
    assert(Math.abs(await page.evaluate(() => scrollY) - background) < 1, 'group browser scrolled the timeline')
    if (viewport.width < 720) {
      const cdp = await page.context().newCDPSession(page)
      for (const bottom of [false, true]) {
        await page.locator('#group-browser').evaluate((e, bottom) => { e.scrollTop = bottom ? e.scrollHeight : 0 }, bottom)
        const from = box.y + box.height * 0.6
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: from, id: 1 }] })
        for (let i = 1; i <= 8; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2, y: from + (bottom ? -60 : 60) * i / 8, id: 1 }] })
          await page.waitForTimeout(15)
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        assert(Math.abs(await page.evaluate(() => scrollY) - background) < 1, 'group touch overscroll escaped to the timeline')
      }
    }

    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    assert.equal(await page.locator('#group-browser').evaluate(e => e.scrollTop), 0, 'pagination did not reset scroll position')
    const secondPage = await page.locator('.group-events button').allTextContents()
    assert(!secondPage.some((title) => firstPage.includes(title)), 'pages repeat events')
    const wanted = await page.locator('.group-events button').last().innerText()
    const title = wanted.split('\n').at(-1)
    await page.getByRole('searchbox', { name: 'Find an event in this group' }).fill(title)
    assert(await page.locator('.group-events button').count() > 0, 'search cannot find events beyond the first page')
    const targetTitle = await page.locator('.group-events button').first().innerText()
    await page.getByRole('searchbox', { name: 'Find an event in this group' }).fill('nonexistent-event-zzzz')
    assert.equal(await page.locator('.group-events button').count(), 0)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('#group-browser').count(), 0)
    assert.equal(await page.evaluate(() => document.activeElement?.id), groupId, 'Escape lost the originating group')
    await page.locator(`[id="${groupId}"]`).click()
    await page.getByRole('searchbox', { name: 'Find an event in this group' }).fill(title)
    await page.locator('.group-events button').first().click()
    await page.locator('.card.selected').waitFor()
    assert(targetTitle.includes(await page.locator('.card.selected .title').innerText()), 'group selection opened the wrong event')
    assert.equal(await page.locator('.zoom-level').innerText(), beforeZoom)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow')
    await page.getByRole('button', { name: 'Close details', exact: true }).click()
    // Filters reprioritize milestones but keep all registered events as context.
    await page.evaluate(() => { location.hash = '#c=research' })
    await page.waitForTimeout(100)
    const filteredTotal = (await page.locator('.era-count').allTextContents()).reduce((n, text) => n + Number(text.match(/^[\d,]+/)[0].replaceAll(',', '')), 0)
    assert.equal(filteredTotal, total)
    const nextGroup = page.locator('.event-group').first()
    await nextGroup.scrollIntoViewIfNeeded()
    await nextGroup.click()
    await page.getByRole('button', { name: 'Zoom into this period' }).click()
    await page.waitForTimeout(80)
    assert.notEqual(await page.locator('.zoom-level').innerText(), '100%', 'optional group zoom did not work')
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
    await page.locator('.event-group').waitFor()
    assert.equal(await page.locator('.era-count').first().innerText(), '2 events · 1 shown')
    assert((await page.locator('.event-group').innerText()).includes('1 more event'))
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log('Collapsed group browser checks passed: persistent counts, era totals, collision-free rows, search/pagination, event selection, keyboard focus, filters and zoom in both themes at desktop/phone/320px widths.')
} finally {
  await browser?.close()
  server.kill()
}
