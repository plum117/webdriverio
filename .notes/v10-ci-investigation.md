# v10 CI failures, run 37125810207 (commit 326fa2e)

Investigated on 2026-10-03. Failing jobs in that run:

| Job | Status |
| --- | --- |
| E2E Launch Test (windows-latest) | Investigated, fix on `claude/project-thread-ovug28` |
| Component Test (macos-latest.26) | Investigated, fix on `claude/project-thread-ovug28-component-mock` |
| Multi-remote E2E (windows-latest) | Skipped: covered by #15893 |
| E2E Launch Test (macos-15) | Not investigated yet |

Before these, build, lint, depcheck, typings and all unit tests (5,333) passed
locally on 326fa2e, so every failure is in a lane that runs a browser.

## 1. E2E Launch Test (windows-latest): Firefox `waitForResponse` timeout

**Symptom.** `e2e/wdio/headless/mocking.e2e.ts` › "network mocking should be
able to see the response body" fails in Firefox 156 on all 4 attempts with
`waitForResponse timed out after 5000ms` (`mocking.e2e.ts:148`). Chrome and
Edge pass.

**Why now.** #15856 (Oct 2) added `mocking.e2e.ts` to the multi-browser run
in `wdio.local.conf.ts`, so the test runs in Firefox CI for the first time.

**Root cause.** From `launch.e2e-1-0.log` (BiDi traffic of the failing run),
the document request `1813-…` is intercepted, continued and completes.
`network.getData` with `dataType: "request"` errors at once ("no such
network data"), but `network.getData` with `dataType: "response"` (command
id 6026) never gets a result. In Firefox's
`remote/webdriver-bidi/modules/root/network.sys.mjs`, `getData` waits on
`collectedData.networkDataCollected`, which resolves only when
`NetworkResponse.readAndProcessResponseBody()` resolves. That in turn waits
for the DevTools network listener to call `setResponseContent()`, with no
fallback, so the read can hang forever. The geckodriver log shows an
`NS_ERROR_NOT_AVAILABLE` in `network.sys.mjs` in the same window.
`WebDriverInterception.waitForResponse()` only resolves once that body read
settles, so it times out even though the response arrived.

**Fix.** `packages/webdriverio/src/utils/interception/index.ts`: the body read
in `responseCompleted` races a 2s wait. After that the response counts as
received, a warning is logged, and the body is still attached if it arrives
later. The e2e test checks the body everywhere except Firefox, where it
checks that a call was recorded.

**Verified.** New unit test (fails without the fix); webdriverio unit tests
(1,730), oxlint, typings and e2e typings pass. **Not verified:** the Firefox
e2e run itself (browser downloads are blocked in the investigation
environment). No Firefox bug has been filed yet.

## 2. Component Test (macos-latest.26): page deadlock in `mock.test.ts`

**Symptom.** `e2e/browser-runner/mock.test.ts` in Chrome Canary 157 fails
with `Command script.callFunction with id 16 timed out after 180000ms`.
Only the Node 26 cell failed; Node 22 and 24 passed in the same run.

**Why now.** #15840 (Oct 2) re-enabled this suite on macOS, using Chrome
Canary instead of skipping it.

**Root cause.** In the browser runner, `browser.mock()` runs inside the test
page. The page owns the BiDi intercept and must release every request it
pauses. The test's second pattern `*/api/*` has no BiDi URL pattern
equivalent, so the intercept matches every request. The runner template
loads `source-map-support`, which maps error stacks with a **synchronous**
`XMLHttpRequest` to the Vite server. While the catch-all intercept is
active, that request is paused, and the page, blocked inside it, can never
release it.

Reproduced locally (Chromium 141 + chromedriver 141, Node 26.10.0): 3 of 10
runs hung, 0 of 8 on Node 22. On a hung run the mapper tab answered CDP but
the test page did not. A gdb backtrace of the page renderer's main thread
was in `blink::XMLHttpRequest::send` → `ResourceRequestSender::SendSync`,
and an `XMLHttpRequest.open` hook logged
`browser-source-map-support.js` as the caller. The Node 26 dependence looks
like timing (which files `source-map-support` has cached before the mock is
created), not a functional difference.

**Fix.** `packages/wdio-browser-runner`: the in-page `networkAddIntercept` /
`networkRemoveIntercept` record active intercept ids in
`window.__wdioNetworkIntercepts__`. The template installs
`source-map-support` with a `retrieveSourceMap` that returns an empty map
while one is active, so no synchronous request is made. Trade-off: a stack
formatted while a mock is active keeps generated positions for files not
mapped yet.

**Verified.** 15 of 15 local Node 26 runs pass with the fix; browser-runner
unit tests (73, including two new ones) and oxlint pass; template snapshot
updated. **Not verified:** macOS with Chrome Canary, which only the PR's CI
can show.

## Environment notes for the next investigator

- GitHub job logs and artifacts of the upstream repo need a signed-in user;
  this session could not read them, so they were attached by hand.
- Chrome, Firefox and chromedriver downloads are blocked here. A matching
  chromedriver came from the `chromedriver-py` wheel on PyPI, and Chromium
  from `/opt/pw-browsers/chromium-1194`. Node 26 came from nodejs.org.
- The runner template links `https://webdriver.io/img/favicon.png`, which the
  proxy blocks. Locally it was replaced in the build output only, since the
  load error fails the run.
