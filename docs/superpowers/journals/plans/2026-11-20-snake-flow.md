<!-- fr:journal-schema=4 -->
# Journal: 2026-11-20-snake-flow

<!-- fr:journal kind=decision scope=plan id=p1-push-skipped created=2026-11-21T12:12:25+00:00 phase=1 -->
### p1-push-skipped · decision · P1.T1.S2 'push so CI runs' skipped; the orchestrator pushes (phase 1)

The repo has no CI config and the brief says the orchestrator pushes. The smoke test ran locally in Playwright.

<!-- fr:journal kind=decision scope=plan id=p1-suite-log-location created=2026-11-21T12:12:25+00:00 phase=1 -->
### p1-suite-log-location · decision · Suite log kept in .visual/, not test-results/ (phase 1)

Playwright empties test-results/ at the start of a run, which would unlink a log being written there. .visual/ is git-ignored and untouched by Playwright, so the suite log and the screenshots live there.

<!-- fr:journal kind=decision scope=plan id=p1-atom-lit-one-box created=2026-11-21T12:12:25+00:00 phase=1 -->
### p1-atom-lit-one-box · decision · A lit atom word keeps one .sr-atom box with the middle letter inside (phase 1)

Splitting an atom across tokenNodes slices gave each slice its own padding and shifted the middle letter 5px off the target (found by the e2e 1px check on the word Space). The lit word now wraps the whole text in one .sr-atom span.

<!-- fr:journal kind=discovery scope=plan id=p1-panel-outline-overlap created=2026-11-21T12:12:25+00:00 phase=1 -->
### p1-panel-outline-overlap · discovery · Panel layout: the open contents sidebar overlays the left ~300px of the wide flow stage (phase 1)

In bottom-stage panel layout the outline is position:absolute at the left (styles.ts .sr-outline inset:0 auto 0 0). The chunk stage was a centred 420px so never met it; the full-width flow stage now runs under it at wide viewports, hiding the left of the ribbon (and most of a short bottom row). R7 says the full panel width, so the stage was left at 100%; see the finding.

<!-- fr:journal kind=finding scope=plan id=p1-panel-outline-overlap-f created=2026-11-21T12:12:25+00:00 phase=1 state=open review_scope=in -->
### p1-panel-outline-overlap-f · finding [open] (reviewer: in scope) · Wide panel: contents sidebar covers the left of the flow ribbon (phase 1)

At 1440px in panel layout with the contents sidebar showing, the ribbon's left edge, including the whole short bottom row near the end of a run, is hidden under it (see panel-flow-paused.png). Chosen not to change the sidebar or inset the stage inside phase 1; a follow-up could inset the flow stage by the sidebar width while it is open. The narrow viewport (900px) shot shows the same overlap.

<!-- fr:journal kind=discovery scope=plan id=p1-node-modules created=2026-11-21T12:12:25+00:00 phase=1 -->
### p1-node-modules · discovery · The worktree had no node_modules; npm ci --prefer-offline fixed it (phase 1)

node_modules is git-ignored; installed in the worktree so typecheck, vitest and Playwright run.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-21T12:12:25+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

a one-line query switch on the demo and a smoke assertion; nothing to restructure

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t5 created=2026-11-21T12:12:25+00:00 phase=1 -->
### no-refactor-p1-t5 · discovery · no-refactor-because P1.T5 (phase 1)

tests and README text only; the dead flow-row code was already removed in P1.T4.S4

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-21T12:19:36+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Window re-centre rebuild resets x to null, so that step snaps without the glide every ~100 words (phase 1)

stage.ts:256/235. Fix: seed the new ribbon at the previous index's mid with --sr-glide 0, reflow, then place with r.x set; unit assert non-zero glide on the re-centring step.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-21T12:19:37+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · Speech hold with no boundaries still lights the red middle letter while braces are hidden (phase 1)

stage.ts:243. Fix: lightMiddle(r, hidden ? null : index); tts-panel tests expect no .sr-flow-mid while held.

<!-- fr:journal kind=finding scope=plan id=p1-r3 created=2026-11-21T12:19:38+00:00 phase=1 state=open review_scope=in -->
### p1-r3 · finding [open] (reviewer: in scope) · placeRibbon re-measures the middle row width every step; glideMs duplicates baseMs (phase 1)

stage.ts:230; ribbon-geometry.ts:199. Fix: measure row width in measureRibbon and store it; reuse pacing.baseMs.

<!-- fr:journal kind=finding scope=plan id=p1-r4 created=2026-11-21T12:19:39+00:00 phase=1 state=open review_scope=out -->
### p1-r4 · finding [open] (reviewer: out of scope) · Pre-existing dial wheel gain (x4-x6.8) makes fast wheel turns jump many words (phase 1)

dial-strip.ts, untouched by this change. Operator asked the wheel to work 'as before'; slow turns step word by word.

<!-- fr:journal kind=review scope=plan id=p1-review-1 created=2026-11-21T12:23:37+00:00 phase=1 -->
### p1-review-1 · review · phase 1 independent review: 3 in-scope (minor), 1 out-of-scope (phase 1)

Independent reviewer measured the bottom-stage demo (floating, panel, 700px): row seams join to the pixel, no skipped or duplicated words, middle letter within 0.02px of target, braces = word width + 8px, glide 66.7ms at 300 wpm and 0 under reduced motion, stage 1198px floating / 1440px panel, chunk mode 420px unchanged, ~0.5ms per step. Raised p1-r1 (glide lost on window re-centre), p1-r2 (lit letter during speech hold), p1-r3 (row width measured per step), p1-r4 (out: pre-existing dial wheel gain); confirmed p1-panel-outline-overlap-f. All in-scope findings fixed in 1482a35 and f0bc84e with tests; full suite green after the fixes (.visual/phase1-fix-suite.log).

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-21T12:23:37+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Window re-centre rebuild resets x to null, so that step snaps without the glide every ~100 words (phase 1)

1482a35: new window seeded at the previous position and glides; unit test asserts non-zero --sr-glide on the re-centring step.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-21T12:23:37+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: Speech hold with no boundaries still lights the red middle letter while braces are hidden (phase 1)

1482a35: held ribbon lights no middle letter; tts-panel tests expect no .sr-flow-mid while held.

<!-- fr:journal kind=finding scope=plan id=p1-r3-resolved created=2026-11-21T12:23:37+00:00 phase=1 state=fixed resolves=p1-r3 -->
### p1-r3-resolved · finding [fixed] · resolves p1-r3: placeRibbon re-measures the middle row width every step; glideMs duplicates baseMs (phase 1)

1482a35: row width measured once per layout in measureRibbon; glideMs reuses pacing.baseMs.

<!-- fr:journal kind=finding scope=plan id=p1-panel-outline-overlap-f-resolved created=2026-11-21T12:23:37+00:00 phase=1 state=fixed resolves=p1-panel-outline-overlap-f -->
### p1-panel-outline-overlap-f-resolved · finding [fixed] · resolves p1-panel-outline-overlap-f: Wide panel: contents sidebar covers the left of the flow ribbon (phase 1)

f0bc84e: flow stage starts at the open sidebar's right edge (--sr-flow-inset, updated on resize and drawer toggle); Playwright check at 1440px panel.

<!-- fr:journal kind=finding scope=plan id=p1-r4-resolved created=2026-11-21T12:23:37+00:00 phase=1 state=open resolves=p1-r4 out_of_scope=true -->
### p1-r4-resolved · finding [out-of-scope] · resolves p1-r4: Pre-existing dial wheel gain (x4-x6.8) makes fast wheel turns jump many words (phase 1)

Dial wheel gain lives in dial-strip.ts, untouched by this change; the operator asked the wheel to behave as before. Raised with the operator as an optional flow-mode cap.
