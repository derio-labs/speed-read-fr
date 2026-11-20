<!-- fr:journal-schema=4 -->
# Journal: 2026-11-20-three-row-flow

<!-- fr:journal kind=discovery scope=plan id=shared-reading-mode-persistence created=2026-11-20T07:28:19+00:00 phase=1 -->
### shared-reading-mode-persistence · discovery · Adding the mode to shared Settings covers browser and VS Code persistence paths. (phase 1)

The browser extension persists a complete Settings value through its existing storage key, and VS Code derives flattened configuration keys from DEFAULT_SETTINGS. A single shared readingMode field and normalization therefore preserve old saved values as chunk without host-specific mode logic.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

The browser stores already serialize complete Settings objects, while VS Code flattens the shared defaults; using those paths keeps mode normalization centralized.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t3 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t3 · discovery · no-refactor-because P1.T3 (phase 1)

The selector reuses the panel's shared select/read/apply/save flow, so no redundant control wiring remains.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t4 created=2026-11-20T07:28:19+00:00 phase=1 -->
### no-refactor-p1-t4 · discovery · no-refactor-because P1.T4 (phase 1)

The browser scenario uses existing openDemo helpers and captures each visual state directly; no separate test-only capture layer was needed.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-20T07:51:49+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Flow crosshair (18px plus) was drawn over the pivot letter, hiding the highlighted character (phase 1)

`.sr-flow-axis` (styles.ts) drew an 18x18 plus at the exact centre of the middle row, on top of `.sr-flow-pivot`; visible in every flow screenshot. Chunk mode avoids this with ticks above/below the glyph.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-20T07:51:49+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · Flow-mode whole-sentence fallback was ellipsis-clipped, showed a false pivot, and was untested (phase 1)

`showWhole` in flow mode passed the whole sentence as the middle row's tokens; the nowrap row clipped it at both ends and the ORP pivot landed mid-sentence. No test fired `whole` in flow mode, with or without `details`.

<!-- fr:journal kind=finding scope=plan id=p1-r3 created=2026-11-20T07:51:49+00:00 phase=1 state=open review_scope=in -->
### p1-r3 · finding [open] (reviewer: in scope) · Tests covered only the mid-chapter happy path; the three-row check counted DOM nodes, not visible rows (phase 1)

No coverage for first/last chunk, end-of-chapter next sentence, floating/bottom-stage flow layouts; the e2e 'three rows' assertion counted nodes, so a clipped or zero-height row passed.

<!-- fr:journal kind=finding scope=plan id=p1-r4 created=2026-11-20T07:51:49+00:00 phase=1 state=open review_scope=in -->
### p1-r4 · finding [open] (reviewer: in scope) · Middle row rendered 'read itall': the leading space of .sr-flow-after collapsed inside the grid (phase 1)

Found by the orchestrator in flow-progressed.png while verifying p1-r1. Grid items trim leading/trailing whitespace, so a pivot at a word end ran two words together.

<!-- fr:journal kind=review scope=plan id=p1-review created=2026-11-20T07:51:49+00:00 phase=1 -->
### p1-review · review · Phase 1 code review: 4 in-scope findings raised, all fixed and re-verified (phase 1)

Reviewer a4831360cff4aaab6 (separate context) reviewed spec + plan + code and raised p1-r1, p1-r2, p1-r3; the orchestrator added p1-r4 from a screenshot. Fixes in 81e2c1c and 13bd0c7 (which also fixed a flow-grid shrink bug the new visible-rows e2e exposed). The orchestrator red-checked the p1-r2 unit tests against the pre-fix stage.ts (2 failed). The reviewer re-reviewed both commits, found nothing new, re-ran the flow e2e (3 passed) and opened all 12 fresh screenshots. Full suite after fixes: vitest 646 passed / 7 skipped, Playwright 80 passed. The reviewer suggested a narrow-width-layout lens (nowrap rows may truncate near the pivot in a narrow VS Code panel); not an effective lens in this repo, so it stays a noted concern here — the floating-layout e2e asserts the visible-rows invariant at that size.

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-20T07:51:49+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Flow crosshair (18px plus) was drawn over the pivot letter, hiding the highlighted character (phase 1)

81e2c1c: ticks above/below the middle row at 50% width (8px; 6px floating; 3px bottom-stage); e2e asserts tick centring in panel and floating layouts.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-20T07:51:49+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: Flow-mode whole-sentence fallback was ellipsis-clipped, showed a false pivot, and was untested (phase 1)

81e2c1c: fallback renders the whole sentence wrapped, 2-line-clamped, no pivot, top/bottom rows kept; tts-panel.test.ts 'flow whole-sentence fallback' with and without details (red without the fix).

<!-- fr:journal kind=finding scope=plan id=p1-r3-resolved created=2026-11-20T07:51:49+00:00 phase=1 state=fixed resolves=p1-r3 -->
### p1-r3-resolved · finding [fixed] · resolves p1-r3: Tests covered only the mid-chapter happy path; the three-row check counted DOM nodes, not visible rows (phase 1)

13bd0c7: stage unit tests for first/last chunk and neighbours across gaps/cards; e2e expectVisibleFlowRows, end-of-chapter sentence-jump test, floating-layout test. Bottom stage is unit-covered only (unreachable from the demo).

<!-- fr:journal kind=finding scope=plan id=p1-r4-resolved created=2026-11-20T07:51:49+00:00 phase=1 state=fixed resolves=p1-r4 -->
### p1-r4-resolved · finding [fixed] · resolves p1-r4: Middle row rendered 'read itall': the leading space of .sr-flow-after collapsed inside the grid (phase 1)

81e2c1c: white-space: pre on .sr-flow-before/.sr-flow-after; unit test asserts 'read it all'; e2e asserts the computed white-space; reviewer confirmed spaces in fresh screenshots.
