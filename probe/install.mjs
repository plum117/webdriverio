// One real browser install through @wdio/utils setupBrowser(), as one worker would do it.
// Usage: node install.mjs <@wdio/utils build/node.js> <cacheDir> <firefox|chrome>
// Prints one JSON line: { ok, ms, error }
import { pathToFileURL } from 'node:url'

const [utilsBuild, cacheDir, browserName] = process.argv.slice(2)
const { setupBrowser } = await import(pathToFileURL(utilsBuild).href)
const start = Date.now()
try {
    await setupBrowser({ cacheDir }, [{ browserName, browserVersion: 'stable' }])
    console.log('RESULT ' + JSON.stringify({ ok: true, ms: Date.now() - start }))
} catch (err) {
    const lines = String(err?.message ?? err).split('\n')
    const pick = lines.filter((l) => /Provider:|EBUSY|EPERM|exists but/.test(l)).slice(-1)[0] ?? lines[0]
    const error = pick.trim().replace(cacheDir, '<cache>').replaceAll(cacheDir, '<cache>').slice(0, 260)
    console.log('RESULT ' + JSON.stringify({ ok: false, ms: Date.now() - start, error }))
}
