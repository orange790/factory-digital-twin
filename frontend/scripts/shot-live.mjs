import puppeteer from 'puppeteer-core'
const URL = 'https://factory-digital-twin-51346.app.workbuddy.host/?sharecode=CNZTSFNOVW'
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], defaultViewport: { width: 1680, height: 1050 } })
const p = await b.newPage()
await p.goto(URL + '#/login', { waitUntil: 'networkidle2' })
await new Promise(r=>setTimeout(r,1200))
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('登'))?.click())
await new Promise(r=>setTimeout(r,2600))
await p.goto(URL + '#/twin', { waitUntil: 'networkidle2' })
await new Promise(r=>setTimeout(r,5000))
await p.screenshot({ path: 'D:/smallscalefactory/.shots/live-twin.png' })
console.log('done', await p.evaluate(()=>document.querySelector('.content')?.innerText.slice(0,40)))
await b.close()
