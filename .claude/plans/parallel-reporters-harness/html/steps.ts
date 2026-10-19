import { Given, When, Then } from '@wdio/cucumber-framework'
import { browser } from '@wdio/globals'
import { ReportEvents } from '@wdio/html-reporter'
import { PARALLEL_FIXTURE_ORIGIN as O } from '../../../parallelFixtureServer.js'
Given(/^I open the "([^"]*)" page$/, async (page: string) => { await browser.url(`${O}/${page}`) })
When(/^I open the "([^"]*)" page and wait (\d+) ms$/, async (page: string, ms: string) => { await browser.url(`${O}/${page}`); await browser.pause(Number(ms)) })
When(/^I log "([^"]*)"$/, (text: string) => { new ReportEvents().logMessage(text) })
Then('the step fails', () => { throw new Error('fails on purpose') })
