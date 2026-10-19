import fs from 'node:fs'; import path from 'node:path'
const dir = path.join(process.argv[2], 'json')
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  for (const feature of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    console.log(`feature ${feature.name}: ${feature.elements.length} elements`)
    for (const s of feature.elements) {
      const steps = s.steps.filter((x) => !x.hidden)
      console.log(`  ${s.name} line=${s.line}: ` + steps.map((x) => `${x.keyword.trim()} ${x.name}@${x.line}=${x.result.status}${x.embeddings ? '[' + x.embeddings.map((e) => Buffer.from(e.data, 'base64').toString()).join('|') + ']' : ''}`).join(' ; '))
    }
  }
}
