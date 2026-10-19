import { Given, When, Then } from '/Users/dprevost/Git/webdriverio/.claude/worktrees/video-reporter/packages/wdio-cucumber-framework/build/index.js'
import { browser } from '@wdio/globals'
import { PARALLEL_FIXTURE_ORIGIN as O } from '../../../parallelFixtureServer.js'
Given(/^I open the "([^"]*)" page$/, async (page: string) => { await browser.url(`${O}/${page}`) })
When(/^I open the "([^"]*)" page and wait (\d+) ms$/, async (page: string, ms: string) => { await browser.url(`${O}/${page}`); await browser.pause(Number(ms)) })
When(/^I log "([^"]*)"$/, (text: string) => { void text })
Then('the step fails', () => { throw new Error('fails on purpose') })
