import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const OUT = 'D:/smallscalefactory/.shots/http2'
fs.mkdirSync(OUT, { recursive: true })
const routes = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], defaultViewport: { width: 1680, height: 1050 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0,140)))
p.on('console', (m) => { if (m.type()==='error' && !m.text().includes('Failed to load resource')) errs.push('console: ' + m.text().slice(0,140)) })
p.on('response', (r) => { const u=r.url(); if (u.includes('/api/') && r.status()>=400) errs.push(`http ${r.status()} ${u.replace('http://127.0.0.1:5173','')}`) })

await p.goto('http://127.0.0.1:5173/#/login', { waitUntil: 'networkidle2' })
await p.evaluate(() => { localStorage.setItem('ft-twin-source','http'); localStorage.removeItem('ft-twin-token'); localStorage.removeItem('ft-twin-session') })
await p.reload({ waitUntil: 'networkidle2' })
await new Promise(r=>setTimeout(r,900))
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('登'))?.click())
await new Promise(r=>setTimeout(r,3000))
console.log('token:', (await p.evaluate(()=>localStorage.getItem('ft-twin-token')||'')).slice(0,8))

for (const r of routes) {
  errs.length = 0
  await p.goto('about:blank')
  await p.goto('http://127.0.0.1:5173/#' + r, { waitUntil: 'networkidle2' })
  await new Promise(r2=>setTimeout(r2, r.startsWith('/twin')?5000:2800))
  const name = r.replace(/\//g,'_') || '_root'
  await p.screenshot({ path: `${OUT}/${name}.png` })
  const s = await p.evaluate(() => ({ len: document.querySelector('.content')?.innerText.length ?? -1, rows: document.querySelectorAll('.el-table__row').length, canvas: !!document.querySelector('canvas') }))
  console.log(`${r} -> len=${s.len} rows=${s.rows} canvas=${s.canvas}`)
  const u = [...new Set(errs)].slice(0,3)
  if (u.length) console.log('   ⚠ ' + u.join('\n   ⚠ '))
}
await b.close()
