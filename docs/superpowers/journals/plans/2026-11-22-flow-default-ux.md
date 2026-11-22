<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-flow-default-ux

<!-- fr:journal kind=discovery scope=plan id=p1-d1 created=2026-11-22T08:55:59+00:00 phase=1 -->
### p1-d1 · discovery · StageZone.refresh nulled the live ribbon after a settings rebuild, so resize and settings re-placement no-op'd until the next step (phase 1)

mount.rebuild() calls player.replaceTimeline (whose step event lays out a new ribbon) and then every zone's refresh(); the stage's refresh set `ribbon = null`, leaving the DOM ribbon un-tracked. A paused reader then ignored resizes (relayoutRibbon no-ops) and the new focusChars handler. refresh now drops the ribbon only when it belongs to an old timeline (`ribbon.steps !== ctx.timeline.steps`). Found by the Focus-span clamp-to-row e2e (viewport narrowed after a settings change).

<!-- fr:journal kind=discovery scope=plan id=p1-d2 created=2026-11-22T08:55:59+00:00 phase=1 -->
### p1-d2 · discovery · The flow-default migration changes what a mounted reader writes to storage.local on load (phase 1)

Loading now writes `migrations: ['flow-default']` (and the migrated settings) once. Two existing assertions needed adjusting: reader-entry.test.ts "ignores synthetic input" now clears the set spy after the reader is ready, and the extension e2e tests clear storage then seed a chunk-mode baseline with the migration already applied (a seeded chunk with no `migrations` key is, correctly, migrated to flow). tests/package.test.ts now passes a globalState to the packaged extension's activate.

<!-- fr:journal kind=discovery scope=plan id=p1-d3 created=2026-11-22T08:55:59+00:00 phase=1 -->
### p1-d3 · discovery · Acceptance rows not yet moved (phase 1)

The four rows of docs/acceptance/features/2026-11-22-flow-default-ux.yaml still read not-implemented with no level refs; the two amendments (reader-snake-flow, reader-three-row-flow) are already in the fragment. Evidence that backs them: core settings/stage/settings-panel unit tests, vscode config/manifest tests, browser storage tests and the new tests/e2e/core.spec.ts + extension.spec.ts cases. Left for deliver (`local` rows are stamped there).

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

added the chunkSettings helper in packages/core/src/testing/reader.ts for the repeated chunk pin, rather than repeating the literal.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t2 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t2 · discovery · no-refactor-because P1.T2 (phase 1)

no refactor step: the migration is one small function in each host (storage.ts, config.ts), nothing duplicated to clean.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t3 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t3 · discovery · no-refactor-because P1.T3 (phase 1)

TARGET_PAD and the per-word target code were removed as part of the rewrite of placeRibbon (lightMiddle replaced by markCurrent); no dead code left.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t4 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t4 · discovery · no-refactor-because P1.T4 (phase 1)

wheelDelta is exported by dial-strip.ts and stage.ts already imported createDialStrip from it, so there is no cycle and nothing to move.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t5 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t5 · discovery · no-refactor-because P1.T5 (phase 1)

no refactor step: the change is a host-setting gate plus removals; nothing to clean.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t6 created=2026-11-22T08:55:59+00:00 phase=1 -->
### no-refactor-p1-t6 · discovery · no-refactor-because P1.T6 (phase 1)

no refactor step: tests, docs and screenshots only.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Browser overlay: wheel over the WPM readout also scrubs the reading position (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · Focus span measured with digits, so 20 characters spans about 29 prose characters (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=finding scope=plan id=p1-r3 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r3 · finding [open] (reviewer: in scope) · Stepper wheel acts on mostly-horizontal swipes (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=finding scope=plan id=p1-r4 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r4 · finding [open] (reviewer: in scope) · The settings-event focusChars branch never runs (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=finding scope=plan id=p1-r5 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r5 · finding [open] (reviewer: in scope) · A failed migration write overrides a later chunk choice (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=finding scope=plan id=p1-r6 created=2026-11-22T09:11:08+00:00 phase=1 state=open review_scope=in -->
### p1-r6 · finding [open] (reviewer: in scope) · The + button shifts when the readout gains a digit (phase 1)

Raised by the independent phase-1 review.

<!-- fr:journal kind=review scope=plan id=p1-review-1 created=2026-11-22T09:11:08+00:00 phase=1 -->
### p1-review-1 · review · Phase 1 independent review: 6 findings (p1-r1..p1-r6), all in scope (phase 1)

The reviewer read the full diff against R1-R7, ran vitest/tsc and the new e2e tests, and drove the demo and the Chrome extension overlay with fresh screenshots. Findings p1-r1..p1-r6 were fixed with tests; the suite is green after the fixes.

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Browser overlay: wheel over the WPM readout also scrubs the reading position (phase 1)

821f161: routeWheel ignores handled events and the .sr-wpm group; reader-entry.test.ts covers it.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: Focus span measured with digits, so 20 characters spans about 29 prose characters (phase 1)

35364aa: the probe measures PROBE_TEXT like the chunk fit; stage.test.ts covers it.

<!-- fr:journal kind=finding scope=plan id=p1-r3-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r3 -->
### p1-r3-resolved · finding [fixed] · resolves p1-r3: Stepper wheel acts on mostly-horizontal swipes (phase 1)

35364aa: dominant-horizontal events are left to the browser; stage.test.ts covers it.

<!-- fr:journal kind=finding scope=plan id=p1-r4-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r4 -->
### p1-r4-resolved · finding [fixed] · resolves p1-r4: The settings-event focusChars branch never runs (phase 1)

35364aa: dead branch and focus field removed; refresh() sizes the target; a paused-resize test covers it.

<!-- fr:journal kind=finding scope=plan id=p1-r5-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r5 -->
### p1-r5-resolved · finding [fixed] · resolves p1-r5: A failed migration write overrides a later chunk choice (phase 1)

c7bdc14: save also records flow-default; storage.test.ts covers it.

<!-- fr:journal kind=finding scope=plan id=p1-r6-resolved created=2026-11-22T09:11:08+00:00 phase=1 state=fixed resolves=p1-r6 -->
### p1-r6-resolved · finding [fixed] · resolves p1-r6: The + button shifts when the readout gains a digit (phase 1)

9689303: the readout has a min-width of 10ch; an e2e position test covers it.

<!-- fr:journal kind=finding scope=plan id=l-security-r1 created=2026-11-22T09:17:40+00:00 state=open review_scope=in -->
### l-security-r1 · finding [open] (reviewer: in scope) · migrateFlowDefault silently rewrote the shared .vscode/settings.json (Workspace target) on activation

Raised by the lens review over the whole diff.

<!-- fr:journal kind=finding scope=plan id=l-tests-r1 created=2026-11-22T09:17:40+00:00 state=open review_scope=in -->
### l-tests-r1 · finding [open] (reviewer: in scope) · core.spec.ts claimed a stage wheel leaves WPM unchanged but asserted nothing

Raised by the lens review over the whole diff.

<!-- fr:journal kind=finding scope=plan id=l-tests-r2 created=2026-11-22T09:17:40+00:00 state=open review_scope=in -->
### l-tests-r2 · finding [open] (reviewer: in scope) · R7 was tested only through the harness, not the real VS Code webview mount

Raised by the lens review over the whole diff.

<!-- fr:journal kind=finding scope=plan id=l-tests-r3 created=2026-11-22T09:17:40+00:00 state=open review_scope=in -->
### l-tests-r3 · finding [open] (reviewer: in scope) · migrateFlowDefault had no test for a rejected update or both scopes set

Raised by the lens review over the whole diff.

<!-- fr:journal kind=finding scope=plan id=l-tests-r4 created=2026-11-22T09:17:40+00:00 state=open review_scope=in -->
### l-tests-r4 · finding [open] (reviewer: in scope) · A failing migrations read dropped stored settings on load and made save reject

Raised by the lens review over the whole diff.

<!-- fr:journal kind=review scope=plan id=lens-review-1 created=2026-11-22T09:17:40+00:00 -->
### lens-review-1 · review · Lens review (security, tests): 5 findings, all in scope and fixed

The security lens raised l-security-r1 and the tests lens raised l-tests-r1..r4; each was fixed with a test and the full suite is green.

<!-- fr:journal kind=finding scope=plan id=l-security-r1-resolved created=2026-11-22T09:17:40+00:00 state=fixed resolves=l-security-r1 -->
### l-security-r1-resolved · finding [fixed] · resolves l-security-r1: migrateFlowDefault silently rewrote the shared .vscode/settings.json (Workspace target) on activation

4557072: only the user (Global) scope is migrated; workspace values are never written; config.test.ts covers it.

<!-- fr:journal kind=finding scope=plan id=l-tests-r1-resolved created=2026-11-22T09:17:40+00:00 state=fixed resolves=l-tests-r1 -->
### l-tests-r1-resolved · finding [fixed] · resolves l-tests-r1: core.spec.ts claimed a stage wheel leaves WPM unchanged but asserted nothing

7be6971: the e2e now wheels over the stage and asserts WPM unchanged and position moved.

<!-- fr:journal kind=finding scope=plan id=l-tests-r2-resolved created=2026-11-22T09:17:40+00:00 state=fixed resolves=l-tests-r2 -->
### l-tests-r2-resolved · finding [fixed] · resolves l-tests-r2: R7 was tested only through the harness, not the real VS Code webview mount

c3e2b24: webview.spec.ts opens Settings and asserts no Reader field and a Focus span field.

<!-- fr:journal kind=finding scope=plan id=l-tests-r3-resolved created=2026-11-22T09:17:40+00:00 state=fixed resolves=l-tests-r3 -->
### l-tests-r3-resolved · finding [fixed] · resolves l-tests-r3: migrateFlowDefault had no test for a rejected update or both scopes set

4557072: the rejection is caught, the flag stays unset and the next run migrates; covered in config.test.ts and providers.test.ts.

<!-- fr:journal kind=finding scope=plan id=l-tests-r4-resolved created=2026-11-22T09:17:40+00:00 state=fixed resolves=l-tests-r4 -->
### l-tests-r4-resolved · finding [fixed] · resolves l-tests-r4: A failing migrations read dropped stored settings on load and made save reject

d5dc145: the migrations read failure is contained; storage.test.ts covers load and save.
