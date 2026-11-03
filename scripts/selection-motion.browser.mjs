import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const port = 4349
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
let browser
try {
 await new Promise((resolve, reject) => {
   const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 10000)
   const fail = (error) => { clearTimeout(timeout); reject(error) }
   server.once('error', fail)
   server.once('exit', code => fail(new Error(`Preview exited: ${code}`)))
   let output = ''
   server.stdout.on('data', data => {
     // Vite colors the URL in CI, and writes may split across stdout chunks.
     output += String(data)
     const plain = output.replace(/\u001b\[[0-9;]*m/g, '')
     if (plain.includes(`:${port}/`)) { clearTimeout(timeout); resolve() }
   })
 })
 browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors=[]
const base=`http://127.0.0.1:${port}/ai-timeline/`
const id='2024-09-12-openai-o1'
for (const viewport of [{width:390,height:844},{width:320,height:740},{width:1280,height:900}]) {
 const page=await browser.newPage({viewport,reducedMotion:'no-preference',colorScheme:'dark'})
 page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(base+`#e=${id}&z=4`)
 await page.locator('.card.selected').waitFor()
 await page.getByRole('button',{name:'Close details'}).click()
 await page.waitForTimeout(450)
 await page.evaluate(id=>{const card=document.getElementById(id);scrollBy(0,card.getBoundingClientRect().top-450)},id)
 await page.waitForTimeout(50)
 const before=await page.locator(`[id="${id}"]`).boundingBox()
 const sample=()=>page.evaluate(id=>({card:document.getElementById(id).getBoundingClientRect().toJSON(),panel:document.querySelector('.panel')?.getBoundingClientRect().toJSON(),animations:document.querySelector('.timeline').getAnimations({subtree:true}).filter(a=>a.playState==='running').length}),id)
 const start=await page.evaluate(async id => {
   document.getElementById(id).querySelector('button').click()
   for (let i = 0; i < 20; i++) await Promise.resolve()
   return {
     card: document.getElementById(id).getBoundingClientRect().toJSON(),
     panel: document.querySelector('.panel').getBoundingClientRect().toJSON(),
   }
 }, id)
 await page.waitForTimeout(100)
 const middle=await sample()
 await page.waitForTimeout(400)
 const end=await sample()
 assert(Math.abs(start.card.top-before.y)<20,'card jumped on first frame')
 assert(Math.abs(start.card.left-before.x)<20,'card jumped horizontally on first frame')
 assert(Math.abs(start.card.width-before.width)<20,'card width jumped on first frame')
 assert(start.card.height<180,'card expanded instantly')
 assert(middle.animations>0,'no intermediate animation')
 assert(end.animations===0,'animations did not settle')
 if(viewport.width<720) {
   assert(start.panel.top>viewport.height-40,'sheet appeared instantly')
   assert(middle.panel.top>end.panel.top && middle.panel.top<viewport.height,'sheet did not slide')
   assert(end.card.bottom<end.panel.top,'card is covered by sheet')
 } else {
   assert(middle.card.width < before.width && middle.card.width > end.card.width, 'card width did not interpolate')
   assert(start.panel.left>viewport.width-40,'sidebar appeared instantly')
   assert(middle.panel.left>end.panel.left && middle.panel.left<viewport.width,'sidebar did not slide')
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 // Rapid keyboard reselection cancels obsolete layout/scroll work.
 await page.keyboard.press('j')
 await page.waitForTimeout(40)
 await page.keyboard.press('k')
 await page.waitForTimeout(450)
 assert.equal(await page.locator('.card.selected').getAttribute('id'),id)
 if (viewport.width===390) {
   await page.getByRole('button',{name:'Close details'}).click()
   await page.waitForTimeout(80)
   // Compare within one browser task, so normal movement between protocol
   // round trips cannot be mistaken for a discontinuity.
   const reversal = await page.evaluate(async id => {
     const before = document.querySelector('.panel').getBoundingClientRect().top
     document.getElementById(id).querySelector('button').click()
     for (let i = 0; i < 20; i++) await Promise.resolve()
     return document.querySelector('.panel').getBoundingClientRect().top - before
   }, id)
   assert(Math.abs(reversal)<2,'sheet jumped while reversing')
   await page.waitForTimeout(450)
   assert.equal(await page.locator('.panel').count(),1,'reopening created duplicate panels')
 }

 await page.getByRole('button',{name:'Close details'}).click()
 await page.waitForTimeout(450)
 assert.equal(await page.locator('.panel').count(),0)
 await page.close()
}
for (const {os,pref,expectMotion} of [
 {os:'reduce',pref:'system',expectMotion:false},
 {os:'no-preference',pref:'reduce',expectMotion:false},
 {os:'reduce',pref:'full',expectMotion:true},
]) {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:os})
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(pref=>localStorage.setItem('ai-timeline:prefs',JSON.stringify({motion:pref,theme:'dark'})),pref)
 await page.goto(base+`#e=${id}&z=4`)
 await page.locator('.card.selected').waitFor()
 assert.equal(await page.locator('.timeline').evaluate(e=>e.getAnimations({subtree:true}).length),0,'deep link animated')
 await page.getByRole('button',{name:'Close details'}).click()
 await page.waitForTimeout(450)
 await page.evaluate(id=>document.getElementById(id).querySelector('button').click(),id)
 await page.waitForTimeout(60)
 const count=await page.locator('.timeline').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)
 assert.equal(count>0,expectMotion,`motion preference failed ${os}/${pref}`)
 await page.close()
}
assert.deepEqual(errors,[])
console.log('Selection motion browser checks passed: mobile/desktop geometry, intermediate frames, rapid reselection, reversal, reduced motion and deep links.')
} finally {
 await browser?.close()
 server.kill()
}
