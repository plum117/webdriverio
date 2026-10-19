# Parallel Mode in the Ported Reporters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@wdio/video-reporter`, `@wdio/html-reporter` and `@wdio/cucumberjs-json-reporter` give the same report in parallel mode (#16058, `parallelMode: 'contexts' | 'userContexts'`) as in sequential mode.

**Architecture:** In parallel mode, each test runs inside `AsyncLocalStorage.run(contextId, …)`, and every reporter event and process event (`ReportEvents`, `attach()`) of a test runs synchronously inside that scope (proved, see Analysis). The base reporter already maps `contextId → TestStats` privately. The plan makes that map public in `@wdio/reporter`, lets the runner tell each reporter the active context, and changes each reporter from "one current test" to "the test of this context". Tasks 1–2 are one core PR that must merge first; Tasks 3–8 are commits on the 3 reporter PRs.

**Tech Stack:** TypeScript, vitest, WebdriverIO testrunner e2e (Chrome 155, BiDi), ffmpeg (video).

**Spec:** this file, section "Analysis" (no separate spec). Context: plum117/wdio-claude-notes#12. Harness used for the analysis: `.claude/plans/parallel-reporters-harness/` (copy a folder to `e2e/wdio/reporters/par/results/` of a worktree, an ignored path).

## Analysis (2026-10-17, main at b7cfd77df, Chrome 155.0.8059.80)

### How parallel mode sends events (code path)
| Source | Carries `contextId`? | Runs inside the test's ALS scope? |
|---|---|---|
| Mocha `test:start`, `test:pending` | yes | yes |
| Mocha `test:pass/fail/end` | no (base reporter maps uid → context) | yes |
| Cucumber step `test:start`, scenario `suite:start`, `test:end` | yes | yes |
| Command events `client:before/afterCommand` | yes (runner, `getContextIdPayload`) | yes |
| `browser.on('bidiCommand')` (video listens directly) | no; `params.context` is the test's tab or a frame in it | yes at send, **no** at result (socket) |
| Process events `ReportEvents.*` (html), `attach()` (cucumberjs-json) | no | yes (PoC: 15/15 events resolved to the right test, also hook logs and logs after other tests started) |
| Timers made in a test (`setInterval` of `screenshotIntervalSecs`) | no | yes (ALS follows async resources) |

Preconditions: BiDi session and `'wdio:experimentalBiDiCommands': true` (both frameworks); Mocha parallel has no `retries`/`bail`; Cucumber parallel has retries (`suite:retry`). Scenarios of **different feature files** of one worker also run at the same time. `@wdio/reporter` has no dependency on `webdriverio`/`@wdio/globals`; the store is `browser[PARALLEL_CONTEXT_STORE_KEY]` (`webdriverio` export), set per session.

### Matrix of real runs (✓ = same as sequential, ✗ = wrong)
| Reporter | Mocha `contexts` | Mocha `userContexts` | Cucumber steps `contexts` | Cucumber `scenarioLevelReporter` `contexts` | 2 feature files, `contexts` |
|---|---|---|---|---|---|
| html | ✗ logs and screenshots of A, B, C under E/F/C (last started test) | ✗ same | ✓ only by timing (sync log steps; an async step that logs after `await` would be wrong) | ✗ "A start, B start, C start" all under C | not run (same mechanism) |
| video (`saveAllVideos`) | ✗ 2 videos for 5 tests, names "A-checkboxes--B-login-fails--C-inputs", 3 ffmpeg errors | not run (same state) | ✗ 2 videos for 5 scenarios, one folder with 23 frames | ✗ 2 videos + 1 lone folder | not run |
| cucumberjs-json | n/a | n/a | ✗ A and B have 1 "pending" step; C has the steps of A, B, C; lines `null` | n/a (step based) | ✗ "D dropdown end" in scenario X of the other feature |

Sequential runs of the same harness: all ✓.

### Other findings of the analysis
- **F1 (video, also sequential):** with `wdio:experimentalBiDiCommands`, `takeScreenshot` is the BiDi capture of the current top-level context. A capture that is still running when a navigation starts fails with "Cannot find context with specified id" (standalone script: 5/5 fail with BiDi commands, 0/10 with classic). Mocha sequential harness with the flag: 7 frames "not available" (5 "Cannot find context", 2 "connection was closed" at session end). Parallel mode requires the flag, so this comes first (Task 3).
- **F2 (video):** Cucumber parallel emits `test:pass|fail` **and** `test:end`; the reporter calls `onTestEnd` from both for Cucumber → 2 ends per test (`generateVideo()` 2 times).
- **F3 (html):** screenshot files are named by timestamp (`screenshots/<cid>/<YYYYMMDD-HHmmss.SSS>/…`): 2 parallel tests in the same millisecond overwrite one file.
- **F4 (Allure, core):** `@wdio/allure-reporter` keeps one current test too; the video reporter's Allure attachment goes to that test. Out of scope here; the video reporter must not attach to a wrong Allure test.
- **F5 (core, for the #16058 author):** the launcher failure line in Cucumber parallel shows a uuid: `Error in "d0a1ac45-…: Then the step fails"` (sequential: `"1: Then the step fails"`).

### Decision for the maintainers (ask before Task 1)
- **Option A (this plan):** core helper in `@wdio/reporter` + runner (Tasks 1–2), then the reporters use it. One mechanism for all reporters, also third-party ones and Allure later.
- **Option B (fallback if A is refused):** each reporter reads `browser[PARALLEL_CONTEXT_STORE_KEY]` through `@wdio/globals` itself (html must add the dependency; breaks with `injectGlobals: false`) — or, minimum, each reporter warns once and (video) stops recording when `parallelMode` is set.

## Global Constraints
- Sequential mode output must not change (all current unit, smoke and e2e tests stay green without edits).
- Third-party reporters built on an older `@wdio/reporter` have no `setContextIdResolver`: the runner calls it only when it exists.
- Multi-remote: parallel mode is not set up (`setBrowser` is skipped); no resolver there.
- Names: `multi-remote` / `isMultiRemote` (AGENTS.md naming check prints nothing).
- One commit per task; conventional commits (`feat(@wdio/reporter): …`, `fix(@wdio/video-reporter): …`).
- Each task's proof: a RED unit test, then the parallel e2e config of that reporter (real Chrome), compared with the sequential run of the same specs.

## Review Focus
1. A process event sent **after** its test ended (video's `test:video-capture` after ffmpeg, an `attach()` in an `After` hook) must still go to that test, not to the last started one. → Task 2 test `routes a late event by its context`.
2. A test that never started in parallel (`it.skip`): the context store has a value with no test; the event must go nowhere, not to another test. → Task 2 test `gives no test for an unknown context`.
3. Cucumber retry in parallel (`suite:retry`): cucumberjs-json keeps only the last try of each scenario. → Task 8 test `keeps only the last try of a retried scenario in parallel`.
4. Events with no context in parallel mode (`before`/`after` all hooks, `runner:end`): `getTestByContext(undefined)` returns `undefined` when contexts exist (not the last test). → Task 2 test `gives no current test in parallel mode without a context`.
5. A frame-capture retry (Task 3) after the session ended must not loop or delay `onRunnerEnd` past `videoRenderTimeout`. → Task 3 test `does not retry after the session ended`.

---

### Task 1: Stats keep `contextId` and `parentUid` (core PR, `@wdio/reporter`)

**Files:**
- Modify: `packages/wdio-reporter/src/stats/test.ts`, `packages/wdio-reporter/src/stats/suite.ts`, `packages/wdio-reporter/src/stats/hook.ts`
- Test: `packages/wdio-reporter/tests/stats/test.test.ts`, `suite.test.ts`, `hook.test.ts`

**Interfaces:**
- Produces: `TestStats.contextId?: string`, `TestStats.parentUid?: string | null`, `SuiteStats.contextId?: string`, `SuiteStats.parentUid?: string | null`, `HookStats.parentUid?: string | null` (copied from the event in the constructors; `Suite` interface gets `contextId?: string`).

- [ ] **Step 1: Failing tests** — `new TestStats({ …, contextId: 'ctx-1', parentUid: 'suite-1' })` has `contextId === 'ctx-1'`, `parentUid === 'suite-1'`; same for `SuiteStats` (`contextId`, `parentUid: null` stays `null`) and `HookStats.parentUid`.
- [ ] **Step 2:** `npx vitest run packages/wdio-reporter/tests/stats` → FAIL (`undefined`).
- [ ] **Step 3:** Copy the fields in the 3 constructors.
- [ ] **Step 4:** Same command → PASS; `pnpm run test:package @wdio/reporter` → PASS.
- [ ] **Step 5:** Commit `feat(@wdio/reporter): keep the context and the parent of a test, suite and hook`.

### Task 2: Context lookup for reporters, set by the runner (core PR)

**Files:**
- Modify: `packages/wdio-reporter/src/index.ts` (the closure maps `contextTests`, `contextByUid` become private fields), `packages/wdio-runner/src/reporter.ts`, `packages/wdio-runner/src/index.ts:250` (next to `setBrowser`)
- Test: `packages/wdio-reporter/tests/reporter.test.ts`, `packages/wdio-runner/tests/reporter.test.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces (on `WDIOReporter`):
  - `setContextIdResolver(resolver: () => string | undefined): void`
  - `get activeContextId(): string | undefined` — the resolver's value, `undefined` without resolver.
  - `getTestByContext(contextId?: string): TestStats | undefined` — the test that started last in this context; for `undefined`: the current test when no context was ever tracked (sequential), else `undefined`. (Same rule as the existing `getCommandTarget`, which now calls it.)
  - `getSuiteByContext(contextId?: string): SuiteStats | undefined` — the suite started last with this `contextId` (Cucumber scenario in step mode); same `undefined` rule.
- Produces (runner): `BaseReporter.setContextIdResolver(resolver)` calls `reporter.setContextIdResolver?.(resolver)` on each reporter; `Runner` calls it with `() => getContextIdPayload(browser).contextId` when `!this._isMultiRemote`.

- [ ] **Step 1: Failing tests (reporter):** `routes a late event by its context` (start A in ctx-a, start B in ctx-b, end A → `getTestByContext('ctx-a')` is A); `gives no test for an unknown context`; `gives no current test in parallel mode without a context`; `gives the current test in sequential mode` (no contextId ever → last test); `activeContextId reads the resolver`; `getSuiteByContext gives the scenario suite`.
- [ ] **Step 2: Failing test (runner):** `sets the context resolver on reporters that have it` (one reporter with the method, one without → no throw, the first gets a function).
- [ ] **Step 3:** `npx vitest run packages/wdio-reporter packages/wdio-runner` → the new tests FAIL.
- [ ] **Step 4:** Implement; `getCommandTarget` uses `getTestByContext(payload.contextId)`.
- [ ] **Step 5:** Same command → PASS. Real proof: the probe reporter of the harness (`html/probe.reporter.ts`) rewritten to use `this.activeContextId` + `this.getTestByContext()` instead of `@wdio/globals` gives the same 15/15 lines on `mocha.probe.conf.ts` with `PAR_MODE=contexts`.
- [ ] **Step 6:** Commit `feat(@wdio/reporter, @wdio/runner): let reporters find the test of a parallel context`.

### Task 3: Video frames survive a navigation in BiDi capture (video PR, also sequential)

**Files:** Modify `packages/wdio-video-reporter/src/index.ts` (`addFrame` capture chain); Test `packages/wdio-video-reporter/tests/frameRetry.test.ts`

**Interfaces:** Produces `FRAME_CAPTURE_RETRIES = 2`, `FRAME_CAPTURE_RETRY_DELAY = 100` (ms) in `src/constants.ts`.

- [ ] **Step 1: Failing tests:** `takes the frame again when the capture fails with "Cannot find context"` (mock capture rejects once with that message, then resolves → frame written, no "not available"); `does not retry after the session ended` (message "connection was closed" → no retry, "not available" at once).
- [ ] **Step 2:** `npx vitest run packages/wdio-video-reporter/tests/frameRetry.test.ts` → FAIL.
- [ ] **Step 3:** Retry only for errors matching `/Cannot find context|no such frame/i`, up to `FRAME_CAPTURE_RETRIES`, after `FRAME_CAPTURE_RETRY_DELAY`; the existing `endsInTime(…, videoRenderTimeout)` limit stays around the whole chain.
- [ ] **Step 4:** PASS. Real proof: `video/mocha.video.conf.ts` with `PAR_MODE=sequential` (flag on): "not available" 7 → at most 2 (the 2 "connection was closed" at session end); `pnpm run test:e2e:video-reporter` still passes.
- [ ] **Step 5:** Commit `fix(@wdio/video-reporter): take a frame again when a navigation stopped its BiDi capture`.

### Task 4: One recording per parallel test (video PR)

**Files:** Modify `packages/wdio-video-reporter/src/index.ts`, add `packages/wdio-video-reporter/src/recording.ts`; Test `packages/wdio-video-reporter/tests/parallel.test.ts`; e2e `e2e/wdio/reporters/video/wdio.parallel.conf.ts` + `video.parallel.e2e.ts` (from the harness), script `test:e2e:video-reporter:parallel`, CI step next to `test:e2e:video-reporter` in `.github/workflows/test-testrunner.yml`.

**Interfaces:**
- Consumes: Task 1 `TestStats.contextId`/`parentUid`, `SuiteStats.parentUid`; Task 2 `activeContextId`.
- Produces: `class Recording { testName?: string; nameParts: string[]; recordingPath?: string; frameNr: number; openTestTitle?: string; frameContext?: string; interval?: NodeJS.Timeout }`; `#recordings: Map<string, Recording>` keyed by `contextId ?? 'main'`; `#recordingOf(contextId?: string): Recording`.

- [ ] **Step 1: Failing tests:** `records 3 overlapping tests into 3 folders` (start A/B/C in 3 contexts, frames by `client:afterCommand` with each `contextId`, end in another order → 3 `generateVideo` calls, each with its own path and frame count); `names a parallel video from its suite chain` (nested describe via `parentUid` → same name as sequential `filenamePrefixSource: 'suite'` and `'test'`); `takes a BiDi command frame in the recording of the context active at send`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Move the per-test fields into `Recording`; events pick the recording by `test.contextId`, `payload.contextId`, or `activeContextId` (bidiCommand at send, stored with the command id); names come from the `parentUid` chain when it is set, else from the current stack (sequential unchanged).
- [ ] **Step 4:** PASS; all video unit tests PASS. Real proof: `test:e2e:video-reporter:parallel` (Mocha `contexts` 5 tests, Cucumber steps and scenario level) → one video per test/scenario, the same names as the sequential run, no ffmpeg error; frame 0 of each video shows that test's page (open one PNG per folder).
- [ ] **Step 5:** Commit `feat(@wdio/video-reporter): record each parallel test on its own`.

### Task 5: One end per test in Cucumber parallel (video PR, F2)

**Files:** Modify `packages/wdio-video-reporter/src/index.ts`; Test `tests/parallel.test.ts`.
- [ ] **Step 1: Failing test:** `ends a Cucumber test one time when the framework sends test:pass and test:end` → `generateVideo` called 1 time.
- [ ] **Step 2:** FAIL (2 calls). **Step 3:** `onTestEnd` returns at once for a test uid that already ended (`#endedTests: Set<string>`, cleared on `test:start` of that uid for retries). **Step 4:** PASS + Task 4 e2e. **Step 5:** Commit `fix(@wdio/video-reporter): end a Cucumber test one time in parallel mode`.

### Task 6: No Allure video on a wrong test in parallel mode (video PR, F4)

**Files:** Modify `packages/wdio-video-reporter/src/index.ts`, README "Parallel mode" section; Test `tests/parallel.test.ts`.
- [ ] **Step 1: Failing test:** `does not attach videos to Allure in parallel mode, and warns one time` (resolver gives a context, Allure configured → no Allure placeholder, 1 warning `"@wdio/allure-reporter does not support parallel mode: the videos are not attached to Allure"`).
- [ ] **Step 2:** FAIL. **Step 3:** guard in `#attachVideoToAllure` and `onExit`. **Step 4:** PASS. **Step 5:** Commit `fix(@wdio/video-reporter): attach no video to Allure in parallel mode`.

### Task 7: Html events go to the test of their context (html PR, F3)

**Files:** Modify `packages/wdio-html-reporter/src/htmlReporter.ts` (`saveMessage`, `saveScreenshot`, `saveVideo`, `onAfterCommand`); Test `packages/wdio-html-reporter/tests/parallel.test.ts`; e2e: the html harness as `e2e/wdio/reporters/html/` (Mocha) — the Cucumber run uses the `tests/` package (the e2e package has no `@wdio/cucumber-framework`), script `test:e2e:html-reporter:parallel`, CI step.

**Interfaces:** Consumes Task 2 `getTestByContext`, `activeContextId`. Produces `#targetTest(contextId?: string): TestStats | undefined = this.getTestByContext(contextId ?? this.activeContextId)`; `_currentTestUid` stays (public field) but no lookup uses it.

- [ ] **Step 1: Failing tests:** `puts a log of test A under A after B started` (resolver returns ctx-a); `puts a command screenshot under the test of the command's contextId`; `gives 2 screenshots in the same millisecond 2 files` (path `screenshots/<cid>/<timestamp>-<test uid>/<filename>.png`).
- [ ] **Step 2:** FAIL. **Step 3:** use `#targetTest`. **Step 4:** PASS + all html tests + smoke `htmlReporter`, `htmlReporterCucumber`. Real proof: harness `mocha.html.conf.ts` with `contexts` and `userContexts`, and `cucumber.conf.ts` with `SCENARIO_LEVEL=1` → output equal to the sequential run (event lists per test).
- [ ] **Step 5:** Commit `feat(@wdio/html-reporter): put the logs and screenshots of a parallel test under that test`.

### Task 8: Cucumber JSON per scenario, not "the last one" (cucumberjs-json PR)

**Files:** Modify `packages/wdio-cucumberjs-json-reporter/src/index.ts`; Test `packages/wdio-cucumberjs-json-reporter/tests/parallel.test.ts`; e2e `e2e/wdio/reporters/cucumberjs-json/wdio.parallel.conf.ts` (harness `shop.feature` + `shop2.feature` grouped), script, CI step.

**Interfaces:**
- Consumes: Task 1 `parentUid`/`contextId`, Task 2 `getSuiteByContext`, `activeContextId`.
- Produces: `#features: Map<string, Feature>` (feature suite uid), `#scenarios: Map<string, Scenario>` (scenario suite uid), `#scenarioOf(stats: { parentUid?: string | null }): Scenario` (by `parentUid`, else today's `getCurrentScenario()`), `#pendingEmbeddings: Map<Scenario, Embedding[]>`. `getCurrentScenario()`/`getCurrentStep()` stay public for sequential callers.

- [ ] **Step 1: Failing tests:** `adds each step to the scenario of its parentUid while 3 scenarios overlap`; `puts an attach() in the step of the active context's scenario`; `keeps the scenarios of 2 features that run at the same time in their own feature`; `keeps only the last try of a retried scenario in parallel` (`suite:retry`).
- [ ] **Step 2:** FAIL. **Step 3:** replace each "current" lookup in `onSuiteStart`, `onHookStart/End`, `addStepData`, `updateStepStatus`, `cucumberJsAttachment` by the maps; `retakeScenarioLines` and `#scenarioLines` already work per scenario. **Step 4:** PASS + all unit tests + 5 smoke suites + `test:e2e:cucumberjs-json-reporter`. Real proof: `cucumber.conf.ts` and `cucumber.grouped.conf.ts` with `contexts` → JSON equal to the sequential run (scenario names, step lines, embeddings, statuses).
- [ ] **Step 5:** Commit `feat(@wdio/cucumberjs-json-reporter): build each scenario from its own events in parallel mode`.

## Staged order (proposal of 2026-10-17, from the user: "fix sequential first, provide libs, then parallel")
- **Stage 1 — sequential, no core change, no maintainer decision:** Task 3 (F1 is a sequential bug with `experimentalBiDiCommands`). Then refactor each reporter from "one current test" to "state per test" (video `Recording` keyed by test, html `#targetTest(undefined)`, cucumberjs-json maps by uid with the "last one" fallback). Sequential output stays the same: the current unit, smoke and e2e tests are the proof. These commits can go on the 3 open PRs.
- **Stage 2 — the lib (core PR):** Tasks 1–2 in `@wdio/reporter` (stats fields, `getTestByContext`, `getSuiteByContext`, `activeContextId`) and `@wdio/runner` (sets the resolver). Needs the maintainers (Option A vs B).
- **Stage 3 — parallel wiring:** each reporter passes the `contextId` (or `activeContextId`) to the per-test state of Stage 1; Tasks 5, 6 and the parallel e2e configs of Tasks 4, 7, 8. Small diffs after Stage 1.
- Cost: Stage 1 picks the state shape before Stage 2 is agreed; the shape above is the one this plan needs in both options, so the risk is low.

## CI evidence
- G2 (#16046, `.exe` for a ffmpeg command name on Windows, 3e2e651bb): run 39039665390, `Unit Test (windows-latest.22.19.0 / 24 / 26)` pass; the Node 24 log shows `✓ packages/wdio-video-reporter/tests/findFfmpeg.test.ts (8 tests | 1 skipped)` (the skip is the POSIX-only "not executable" test). No Windows video e2e job exists.

## Order and owners
1. Ask the maintainers (#16058 author) Option A vs B, with this Analysis. Also report F5.
2. Option A: Tasks 1–2 as one core PR (`feat/reporter-parallel-context`), then Task 3 (independent, can go first), Tasks 4–6, 7, 8 on the reporter PRs after a rebase on the merged core PR.
3. Each reporter README gets a short "Parallel mode" section in its task (what works; Allure note for video).
