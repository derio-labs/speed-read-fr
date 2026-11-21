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
