import path from 'node:path'
import url from 'node:url'
import type { Server } from 'node:http'
import { startParallelFixtureServer, stopParallelFixtureServer } from '../../../parallelFixtureServer.js'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const mode = (process.env.PAR_MODE ?? 'contexts') as 'contexts'
let server: Server
export const config: WebdriverIO.Config = {
    specs: [path.join(__dirname, 'mocha.html.spec.ts')],
    maxInstances: 1,
    capabilities: [{ browserName: 'chrome', webSocketUrl: true, 'wdio:experimentalBiDiCommands': true, 'goog:chromeOptions': { args: ['headless', 'disable-gpu'] } }],
    logLevel: 'warn',
    framework: 'mocha',
    outputDir: path.join(__dirname, 'out-mocha'),
    reporters: ['spec', ['html', { outputDir: path.join(__dirname, 'out-mocha', 'html') + path.sep, filename: 'report.html', useOnAfterCommandForScreenshot: true }]],
    onPrepare: async () => { server = await startParallelFixtureServer() },
    onComplete: async () => { await stopParallelFixtureServer(server) },
    mochaOpts: { ui: 'bdd', timeout: 60000, ...(mode === 'sequential' as string ? {} : { parallelMode: mode, maxParallelContexts: 3 }) }
}
