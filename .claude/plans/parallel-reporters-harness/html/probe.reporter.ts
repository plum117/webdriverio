import WDIOReporter, { type TestStats } from '/Users/dprevost/Git/webdriverio/.claude/worktrees/html-reporter/packages/wdio-reporter/build/index.js'
import { browser } from '/Users/dprevost/Git/webdriverio/.claude/worktrees/html-reporter/packages/wdio-globals/build/index.js'
const KEY = '__parallelContextStore'
export default class ProbeReporter extends WDIOReporter {
    #byContext = new Map<string, string>()
    #rows: string[] = []
    constructor (options: object) {
        super(options)
        this.on('test:start', (test: { title: string, contextId?: string }) => { if (test.contextId) this.#byContext.set(test.contextId, test.title) })
        process.on('test:log' as never, ((text: string) => {
            const ctx = (browser as unknown as Record<string, { getStore(): string | undefined }>)[KEY]?.getStore()
            this.#rows.push(`log "${text}" -> context test "${ctx ? this.#byContext.get(ctx) : 'none'}"`)
        }) as never)
        this.on('client:afterCommand', (c: { command: string, contextId?: string }) => { if (c.command === 'takeScreenshot') this.#rows.push(`takeScreenshot -> "${c.contextId ? this.#byContext.get(c.contextId) : 'none'}"`) })
    }
    onTestEnd (test: TestStats) {
        const ctx = (browser as unknown as Record<string, { getStore(): string | undefined }>)[KEY]?.getStore()
        this.#rows.push(`test:end "${test.title}" in context of "${ctx ? this.#byContext.get(ctx) : 'none'}"`)
    }
    onRunnerEnd () { console.log('PROBE\n' + this.#rows.join('\n')) }
}
