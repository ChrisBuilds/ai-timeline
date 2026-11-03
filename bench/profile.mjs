// Profiles one interaction with Chromium's CPU profiler and prints the
// functions with the most self time. For finding hot spots, not for CI.
//
//   npm run build && node bench/profile.mjs <load|filter|select|zoom> [events]

import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serveSynthetic } from './serve-data.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const action = process.argv[2] ?? 'filter'
const size = Number(process.argv[3] ?? 20000)
const port = 4319
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((r) => server.stdout.on('data', (b) => String(b).includes(String(port)) && r()))

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await serveSynthetic(page, size)
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
const url = `http://localhost:${port}/ai-timeline/`
if (action === 'load') await cdp.send('Profiler.start')
await page.goto(url)
await page.waitForSelector('.card')
await page.waitForTimeout(500)
if (action !== 'load') {
  await cdp.send('Profiler.start')
  const t0 = Date.now()
  if (action === 'filter') await page.evaluate(() => (location.hash = '#c=research'))
  if (action === 'select') await page.locator('.card .card-button').first().click()
  if (action === 'zoom') for (let i = 0; i < 4; i++) await page.keyboard.press('+')
  await page.waitForTimeout(action === 'zoom' ? 1500 : 300)
  console.log(`${action} took about ${Date.now() - t0}ms of wall time including waits`)
}
const { profile } = await cdp.send('Profiler.stop')
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const dt = profile.timeDeltas
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  const f = n.callFrame
  const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000)
}
const total = [...self.values()].reduce((a, b) => a + b, 0)
console.log(`total sampled ${total.toFixed(0)}ms`)
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${v.toFixed(1).padStart(8)}ms  ${k}`)
await browser.close()
server.kill()
process.exit(0)
