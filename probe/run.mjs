// Probe of the browser install when the delete of the downloaded archive fails.
// Usage:
//   node run.mjs lock <utils build/node.js> <firefox|chrome>
//     Windows only. Run 1: one install, and hold.ps1 keeps the archive open (real lock).
//     Run 2: one more install into the same cache, without the lock.
//   node run.mjs race <utils build/node.js> <firefox|chrome> <loops> <workers>
//     Each loop: <workers> installs at the same time into one new cache, then one more
//     install into that cache.
// Appends JSON rows to $RESULTS (default results.jsonl).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [mode, utilsBuild, browser, loopsArg = '1', workersArg = '3'] = process.argv.slice(2)
const resultsFile = process.env.RESULTS ?? 'results.jsonl'
const label = process.env.LABEL ?? ''

const newCache = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wdio-cache-'))

function install (cacheDir) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(here, 'install.mjs'), utilsBuild, cacheDir, browser], { stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        child.stdout.on('data', (d) => { out += d })
        child.stderr.on('data', (d) => { out += d })
        child.on('close', () => {
            const line = out.split('\n').find((l) => l.startsWith('RESULT '))
            const result = line ? JSON.parse(line.slice(7)) : { ok: false, error: 'no result: ' + out.slice(-200) }
            result.installedDespiteCleanup = out.includes("couldn't remove its download")
            result.retried = /before the retry|Keeping .* the executable is there/.test(out)
            result.log = out.split('\n').filter((l) => /WARN|ERROR|Keeping|Removing|EBUSY|EPERM/.test(l)).map((l) => l.trim().slice(0, 200)).slice(0, 8)
            resolve(result)
        })
    })
}

function hold (cacheDir) {
    const root = path.join(cacheDir, browser)
    fs.mkdirSync(root, { recursive: true })
    const pattern = browser === 'firefox' ? '*Firefox Setup*.exe' : '*.zip'
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'hold.ps1'), '-Root', root, '-Pattern', pattern], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    ps.stdout.on('data', (d) => { out += d })
    ps.stderr.on('data', (d) => { out += d })
    return {
        async stop () {
            ps.kill()
            await new Promise((r) => ps.once('close', r).once('error', r))
            return out.trim().split(/\r?\n/).filter(Boolean)
        }
    }
}

const write = (row) => {
    const full = { label, os: process.platform, browser, mode, ...row }
    fs.appendFileSync(resultsFile, JSON.stringify(full) + '\n')
    console.log(JSON.stringify(full))
}

if (mode === 'lock') {
    const cacheDir = newCache()
    const holder = hold(cacheDir)
    const run1 = await install(cacheDir)
    const holderLog = await holder.stop()
    const run2 = await install(cacheDir)
    const left = fs.readdirSync(path.join(cacheDir, browser))
    write({ run1, run2, holder: holderLog, cacheAfter: left })
} else if (mode === 'race') {
    const loops = Number(loopsArg)
    const workers = Number(workersArg)
    for (let i = 1; i <= loops; i++) {
        const cacheDir = newCache()
        const parallel = await Promise.all(Array.from({ length: workers }, () => install(cacheDir)))
        const after = await install(cacheDir)
        write({ loop: i, parallel, after })
        fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 })
    }
} else {
    throw new Error(`unknown mode ${mode}`)
}
