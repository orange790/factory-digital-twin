import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const OUT = 'D:/smallscalefactory/.shots/mock2'
fs.mkdirSync(OUT, { recursive: true })
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/twin', '/device', '/alarm', '/workorder', '/inspection']
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], defaultViewport: { width: 1680, height: 1050 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0,140)))
p.on('console', (m) => { if (m.type()==='error' && !m.text().includes('Failed to load resource')) errs.push('console: ' + m.text().slice(0,140)) })
await p.goto('http://127.0.0.1:5173/#/login', { waitUntil: 'networkidle2' })
const token = 'mock.' + Buffer.from(JSON.stringify({ sub: 'admin', role: 'admin', iat: Date.now() })).toString('base64')
await p.evaluate((t) => { localStorage.setItem('ft-twin-source','mock'); localStorage.setItem('ft-twin-token', t); localStorage.setItem('ft-twin-session', JSON.stringify({sub:'admin',role:'admin'})) }, token)
for (const r of routes) {
  errs.length = 0
  await p.goto('about:blank')
  await p.goto('http://127.0.0.1:5173/#' + r, { waitUntil: 'networkidle2' })
  await new Promise(r2=>setTimeout(r2, r.startsWith('/twin')?4500:2400))
  const s = await p.evaluate(() => ({ len: document.querySelector('.content')?.innerText.length ?? -1, rows: document.querySelectorAll('.el-table__row').length, canvas: !!document.querySelector('canvas') }))
  await p.screenshot({ path: `${OUT}/${r.replace(/\//g,'_')||'_root'}.png` })
  console.log(`${r} -> len=${s.len} rows=${s.rows} canvas=${s.canvas}`)
  const u=[...new Set(errs)].slice(0,3); if (u.length) console.log('   ⚠ ' + u.join('\n   ⚠ '))
}
await b.close()
