/* oxlint-disable */
// samples the time to two animation frames in one more browser while the e2e suite runs,
// until the file STOP exists. usage: node latency-ci.mjs <browser> <out.jsonl>
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { remote } from '../../packages/webdriverio/build/index.js'
const [name, out] = process.argv.slice(2)
const stop = path.join(path.dirname(out), 'STOP')
const html = `<!doctype html><style>@keyframes m{from{left:0}to{left:300px}}#b{position:absolute;width:50px;height:50px;background:red;animation:m 1s linear infinite alternate}</style><div id=b></div>`
const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html) })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const b = await remote({ logLevel: 'error', capabilities: { browserName: name, ...(name === 'firefox' ? { 'moz:firefoxOptions': { args: ['-headless'] } } : { 'goog:chromeOptions': { args: ['headless=new'] } }) } })
await b.url(`http://127.0.0.1:${server.address().port}/`)
while (!fs.existsSync(stop)) {
  const s = await b.execute(() => new Promise(async (resolve) => {
    const res = []
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, Math.random() * 50))
      const t0 = performance.now()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      res.push(performance.now() - t0)
    }
    resolve(res)
  }))
  fs.appendFileSync(out, s.map((w) => JSON.stringify({ kind: 'synthetic', browser: name, waited: w, at: Date.now() })).join('\n') + '\n')
}
await b.deleteSession(); server.close()
