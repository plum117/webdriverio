import { browser, $, expect } from '@wdio/globals'
import { PARALLEL_FIXTURE_ORIGIN as O } from '../../../parallelFixtureServer.js'

const log = (_text: string) => {}

describe('parallel html', () => {
    beforeEach(function () {
        log(`hook for ${this.currentTest?.title}`)
    })
    it('A checkboxes', async () => {
        log('A start')
        await browser.url(`${O}/checkboxes`)
        await browser.pause(900)
        await $('#checkboxes input:first-of-type').click()
        log('A end')
    })
    it('B login fails', async () => {
        log('B start')
        await browser.url(`${O}/login`)
        await browser.pause(300)
        await $('#username').setValue('tomsmith')
        log('B end')
        await expect($('h2')).toHaveText('not the title', { wait: 200 })
    })
    it('C inputs', async () => {
        log('C start')
        await browser.url(`${O}/inputs`)
        await browser.pause(600)
        await browser.takeScreenshot()
        log('C end')
    })
    describe('nested', () => {
        it('E nested one', async () => {
            log('E start')
            await browser.url(`${O}/tables`)
            await browser.pause(700)
            log('E end')
        })
        it('F nested two', async () => {
            log('F start')
            await browser.url(`${O}/dropdown`)
            await browser.pause(200)
            log('F end')
        })
    })
    it.skip('D skipped', async () => {})
})
