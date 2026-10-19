import fs from 'node:fs'; import path from 'node:path'
const dir = process.argv[2]
const raw = path.join(dir, '.video-reporter-screenshots')
console.log('videos:', fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => f.replace(/-0-0--CHROME.*/, '')).join(', '))
if (fs.existsSync(raw)) for (const f of fs.readdirSync(raw)) console.log(`  frames ${f.replace(/-0-0--CHROME.*/, '')}: ${fs.readdirSync(path.join(raw, f)).length}`)
const log = fs.readFileSync(path.join(dir, 'wdio-0-0-video-reporter.log'), 'utf8').split('\n')
console.log('  not available:', log.filter((l) => l.includes('not available')).length, '| ffmpeg errors:', log.filter((l) => /ffmpeg.*(error|fail)/i.test(l)).length, '| generated:', log.filter((l) => l.includes('Generated video')).length)
