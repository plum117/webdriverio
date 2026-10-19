import fs from 'node:fs'; import path from 'node:path'
const dir = process.argv[2]
for (const f of fs.readdirSync(dir).filter((f) => /^report-.*\.json$/.test(f))) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  console.log('metrics', JSON.stringify(r.metrics))
  const walk = (s, d = 0) => { console.log(' '.repeat(d) + 'suite', s.title); for (const t of s.tests ?? []) console.log(' '.repeat(d + 2) + `${t.title} | ${t.state} | events=${JSON.stringify((t.events ?? []).map((e) => e.type === 'log' ? e.value : e.type))}`); for (const c of s.suites ?? []) walk(c, d + 2) }
  for (const s of r.suites ?? []) walk(s)
}
