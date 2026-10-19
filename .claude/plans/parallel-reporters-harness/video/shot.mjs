import { remote } from 'webdriverio'
const browser = await remote({ logLevel: 'error', capabilities: { browserName: 'chrome', webSocketUrl: true, 'wdio:experimentalBiDiCommands': process.env.BIDI === '1', 'goog:chromeOptions': { args: ['headless', 'disable-gpu'] } } })
let ok = 0, failed = 0, errors = new Set()
for (let i = 0; i < 5; i++) {
  await browser.url(i % 2 ? 'https://guinea-pig.webdriver.io/' : 'https://guinea-pig.webdriver.io/two.html')
  try { await browser.takeScreenshot(); ok++ } catch (e) { failed++; errors.add(e.message.slice(0, 120)) }
  const p = browser.takeScreenshot().then(() => ok++, (e) => { failed++; errors.add('after next url: ' + e.message.slice(0, 100)) })
  await browser.url('https://guinea-pig.webdriver.io/')
  await p
}
console.log(`BIDI=${process.env.BIDI} ok=${ok} failed=${failed}`, [...errors])
await browser.deleteSession()
