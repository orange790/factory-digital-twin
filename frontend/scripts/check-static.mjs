import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] || 'http://127.0.0.1:5199/'
const routes = ['/', '/twin', '/alarm', '/workorder', '/heatmap', '/about']
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], defaultViewport: { width: 1600, height: 1000 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0,120)))
p.on('console', (m) => { if (m.type()==='error') errs.push('console: ' + m.text().slice(0,120)) })
p.on('response', (r) => { if (r.status() >= 400) errs.push(`http ${r.status()} ${r.url()}`) })

await p.goto(BASE + '#/login', { waitUntil: 'networkidle2' })
await new Promise(r=>setTimeout(r,1200))
console.log('登录页文本:', (await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,60))))
// 一键访客进入或预填登录
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('登'))?.click())
await new Promise(r=>setTimeout(r,2200))
console.log('登录后 hash:', await p.evaluate(()=>location.hash))

for (const r of routes) {
  errs.length = 0
  await p.goto(BASE + '#' + r, { waitUntil: 'networkidle2' })
  await new Promise(r2=>setTimeout(r2, r === '/twin' ? 4500 : 2200))
  const s = await p.evaluate(() => ({ len: document.querySelector('.content')?.innerText.length ?? -1, rows: document.querySelectorAll('.el-table__row').length, canvas: !!document.querySelector('canvas') }))
  console.log(`${r} -> len=${s.len} rows=${s.rows} canvas=${s.canvas}`)
  const u=[...new Set(errs)].slice(0,3); if (u.length) console.log('   ⚠ ' + u.join('\n   ⚠ '))
}
await b.close()
