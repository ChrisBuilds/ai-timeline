// Browser benchmark: loads the built site with synthetic data of several sizes
// in Chromium, slows the CPU down to stand in for a low-end phone, and measures
// load, zoom, scroll, filtering and selecting an event.
//
//   npm run build && node bench/browser.mjs [--sizes 1000,5000,20000] [--cpu 4] [--json out.json]
//
// Prints a Markdown table. With --budgets, exits non-zero when a metric goes
// over its budget in bench/budgets.json.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { generate } from './synthetic.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const sizes = opt('sizes', '1000,5000,20000').split(',').map(Number)
const cpu = Number(opt('cpu', '4'))
const jsonOut = opt('json', null)
const checkBudgets = args.includes('--budgets')
const port = Number(opt('port', '4317'))
const base = `http://localhost:${port}/ai-timeline/`

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
}

// Runs in the page before any app code: records long tasks and when the first card appears.
function instrument() {
  window.__bench = { longTasks: [], firstCard: null }
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__bench.longTasks.push({ start: e.startTime, duration: e.duration })
  }).observe({ type: 'longtask', buffered: true })
  const mo = new MutationObserver(() => {
    if (document.querySelector('.card')) {
      mo.disconnect()
      requestAnimationFrame(() => (window.__bench.firstCard = performance.now()))
    }
  })
  addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }))
  /** Frame times over `ms` while `drive(frame)` runs on each frame. */
  window.__frames = (ms, drive) =>
    new Promise((resolve) => {
      const times = []
      const t0 = performance.now()
      let last = t0
      let n = 0
      const tick = (t) => {
        times.push(t - last)
        last = t
        if (drive) drive(n++)
        if (t - t0 < ms) requestAnimationFrame(tick)
        else resolve(times)
      }
      requestAnimationFrame((t) => {
        last = t
        if (drive) drive(n++)
        requestAnimationFrame(tick)
      })
    })
  /** Time from `act()` until the next frame has painted. */
  window.__untilPaint = (act) =>
    new Promise((resolve) => {
      const t0 = performance.now()
      act()
      requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0))
    })
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b)
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  return {
    frames: times.length,
    mean: times.reduce((a, b) => a + b, 0) / (times.length || 1),
    p95: p(0.95),
    max: sorted.at(-1) ?? 0,
    // Frames that took more than two 60Hz frames.
    janky: times.filter((t) => t > 34).length,
  }
}

async function measure(browser, size, device) {
  const data = JSON.stringify(generate(size, 7))
  const context = await browser.newContext(VIEWPORTS[device])
  const page = await context.newPage()
  await page.route('**/data/events.json', (route) => route.fulfill({ body: data, contentType: 'application/json' }))
  await page.addInitScript(instrument)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })

  await page.goto(base, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__bench.firstCard !== null, null, { timeout: 120_000 })
  await page.waitForTimeout(500)
  const load = await page.evaluate(() => ({
    firstCard: window.__bench.firstCard,
    longTaskMs: window.__bench.longTasks.reduce((a, t) => a + t.duration, 0),
    domNodes: document.getElementsByTagName('*').length,
    cards: document.querySelectorAll('.card').length,
    heapMB: (performance.memory?.usedJSHeapSize ?? 0) / 1e6,
  }))

  // Zoom in four steps, as a person pressing + would, then let the glide finish.
  await page.mouse.move(VIEWPORTS[device].viewport.width / 2, 400)
  const zoomIn = await page.evaluate(() =>
    window.__frames(1600, (n) => {
      if (n % 6 === 0 && n < 24) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    }),
  )
  const zoomedNodes = await page.evaluate(() => document.getElementsByTagName('*').length)

  // Scroll down steadily, 30px a frame.
  const scroll = await page.evaluate(() => window.__frames(1500, () => scrollBy(0, 30)))

  // Back to zoom 1, then apply a filter and select an event.
  await page.keyboard.press('0')
  await page.waitForTimeout(800)
  const filterMs = await page.evaluate(() => window.__untilPaint(() => (location.hash = '#c=research')))
  await page.waitForTimeout(300)
  const clearMs = await page.evaluate(() => window.__untilPaint(() => (location.hash = '#')))
  await page.waitForTimeout(300)
  const selectMs = await page.evaluate(() =>
    window.__untilPaint(() => document.querySelector('.card .card-button')?.click()),
  )

  await context.close()
  return {
    size,
    device,
    load,
    zoom: stats(zoomIn),
    zoomedNodes,
    scroll: stats(scroll),
    filterMs,
    clearMs,
    selectMs,
  }
}

function startServer() {
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    server.stdout.on('data', (b) => {
      if (String(b).includes(String(port))) resolve(server)
    })
    server.on('exit', (code) => reject(new Error(`vite preview exited with ${code}`)))
  })
}

const fmt = (n, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : '–')

function table(results) {
  const rows = [
    '| Events | Device | First card (ms) | Long tasks at load (ms) | DOM nodes | Zoom frame p95 / max (ms) | Zoom janky frames | Scroll frame p95 / max (ms) | Scroll janky frames | Filter (ms) | Select (ms) |',
    '| --: | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
  ]
  for (const r of results) {
    rows.push(
      `| ${r.size} | ${r.device} | ${fmt(r.load.firstCard)} | ${fmt(r.load.longTaskMs)} | ${r.load.domNodes} → ${r.zoomedNodes} | ${fmt(r.zoom.p95)} / ${fmt(r.zoom.max)} | ${r.zoom.janky}/${r.zoom.frames} | ${fmt(r.scroll.p95)} / ${fmt(r.scroll.max)} | ${r.scroll.janky}/${r.scroll.frames} | ${fmt(r.filterMs)} | ${fmt(r.selectMs)} |`,
    )
  }
  return rows.join('\n')
}

/** Checks results against bench/budgets.json; returns a list of failures. */
function overBudget(results) {
  const budgets = JSON.parse(readFileSync(join(root, 'bench/budgets.json'), 'utf8')).browser
  const fails = []
  for (const r of results) {
    const b = budgets[`${r.size}/${r.device}`]
    if (!b) continue
    const check = (name, value) => {
      if (b[name] !== undefined && value > b[name]) fails.push(`${r.size} ${r.device}: ${name} ${fmt(value)} > ${b[name]}`)
    }
    check('firstCard', r.load.firstCard)
    check('domNodes', Math.max(r.load.domNodes, r.zoomedNodes))
    check('zoomP95', r.zoom.p95)
    check('scrollP95', r.scroll.p95)
    check('filterMs', r.filterMs)
    check('selectMs', r.selectMs)
  }
  return fails
}

const server = await startServer()
const browser = await chromium.launch()
const results = []
try {
  for (const size of sizes) {
    for (const device of Object.keys(VIEWPORTS)) {
      results.push(await measure(browser, size, device))
      console.error(`measured ${size} ${device}`)
    }
  }
} finally {
  await browser.close()
  server.kill()
}

console.log(`CPU slowed ${cpu}x. Times in ms.\n\n${table(results)}`)
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ cpu, results }, null, 2))
if (checkBudgets) {
  const fails = overBudget(results)
  if (fails.length) {
    console.log(`\n**Over budget:**\n${fails.map((f) => `- ${f}`).join('\n')}`)
    process.exit(1)
  }
  console.log('\nAll metrics are within budget.')
}
process.exit(0)
