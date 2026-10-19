import VideoReporter from '/Users/dprevost/Git/webdriverio/.claude/worktrees/video-reporter/packages/wdio-video-reporter/build/index.js'
import path from 'node:path'
import url from 'node:url'
import type { Server } from 'node:http'
import { startParallelFixtureServer, stopParallelFixtureServer } from '../../../parallelFixtureServer.js'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const mode = process.env.PAR_MODE ?? 'contexts'
const out = path.join(__dirname, 'out-cucumber')
let server: Server
const extra = (process.env.PAR_REPORTERS ?? '').split(',').filter(Boolean).map((name) => name === 'html'
    ? ['html', { outputDir: path.join(out, 'html') + path.sep, filename: 'report.html' }]
    : [VideoReporter as never, { saveAllVideos: true, outputDir: path.join(out, 'video') }])
export const config: WebdriverIO.Config = {
    specs: [path.join(__dirname, 'shop.feature')],
    maxInstances: 1,
    capabilities: [{ browserName: 'chrome', webSocketUrl: true, 'wdio:experimentalBiDiCommands': true, 'goog:chromeOptions': { args: ['headless', 'disable-gpu'] } }],
    logLevel: 'warn',
    framework: 'cucumber',
    outputDir: out,
    reporters: ['spec', ...(process.env.PAR_REPORTERS ? extra as never[] : [['cucumberjs-json', { jsonFolder: path.join(out, 'json'), language: 'en' }]] as never[])],
    onPrepare: async () => { server = await startParallelFixtureServer() },
    onComplete: async () => { await stopParallelFixtureServer(server) },
    cucumberOpts: { require: [path.join(__dirname, 'steps.ts')], timeout: 60000, scenarioLevelReporter: process.env.SCENARIO_LEVEL === '1', ...(mode === 'sequential' ? {} : { parallelMode: mode as 'contexts', maxParallelContexts: 3 }) }
}
