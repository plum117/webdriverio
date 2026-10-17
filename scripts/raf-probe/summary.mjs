/* oxlint-disable */
// usage: node summary.mjs <dir with *.jsonl>
import fs from 'node:fs'
import path from 'node:path'
const dir = process.argv[2]
const rows = []
for (const f of fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.jsonl'))) {
  const job = path.dirname(f)
  for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) rows.push({ job, ...JSON.parse(l) })
}
const groups = {}
for (const r of rows) (groups[`${r.job.replace(/-\d+$/, '')} ${r.kind}`] ??= []).push(r)
for (const [k, g] of Object.entries(groups).sort()) {
  const w = g.filter((r) => !r.byTimer).map((r) => r.waited).sort((a, b) => a - b)
  const p = (q) => w.length ? w[Math.min(w.length - 1, Math.floor(q * w.length))].toFixed(0) : '-'
  const over = (ms) => w.filter((x) => x > ms).length
  console.log(`${k.padEnd(48)} N=${String(g.length).padStart(5)} timer=${g.filter((r) => r.byTimer).length} p50=${p(.5)} p99=${p(.99)} p99.9=${p(.999)} max=${w.length ? w.at(-1).toFixed(0) : '-'} >100=${over(100)} >250=${over(250)} >500=${over(500)} >1000=${over(1000)}`)
}
