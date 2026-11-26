<!-- fr:journal-schema=4 -->
# Journal: 2026-11-26-word-default-red-toggle-top-dock

<!-- fr:journal kind=discovery scope=plan id=p1-d1 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d1 · discovery · A fresh worktree has no node_modules (phase 1)

npm ci was needed in the workspace before typecheck/test could run.

<!-- fr:journal kind=discovery scope=plan id=p1-d2 created=2026-11-26T11:27:08+00:00 phase=1 -->
### p1-d2 · discovery · handle.applySettings never saves (phase 1)

ReaderHandle.applySettings applies with save=false (host-driven); the panel's path saves. The redLetters live branch saves only when save is true, so the mount test asserts the store save through the panel.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-26T11:31:17+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Red letters hint says 'first letter of each word' but in chunk mode it controls the pivot (phase 1)

settings-panel.ts:91; the field shows in both modes.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-26T11:31:17+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · No test covers the save=false host path for a redLetters change (phase 1)

mount.test.ts:253-272 only exercises the panel save path.

<!-- fr:journal kind=review scope=plan id=p1-review created=2026-11-26T11:31:17+00:00 phase=1 -->
### p1-review · review · phase 1 review: 2 in-scope findings, both fixed (phase 1)

Independent reviewer checked migrations, the live redLetters path, gated CSS (computed colours in Chromium), panel and manifest against spec R1-R3, and drove the UI for the reader-red-letters-toggle row. Findings p1-r1 and p1-r2 fixed with tests in the follow-up commit.

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-26T11:31:17+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Red letters hint says 'first letter of each word' but in chunk mode it controls the pivot (phase 1)

Hint is now 'first letters and pivot'; settings-panel test asserts it.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-26T11:31:17+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: No test covers the save=false host path for a redLetters change (phase 1)

New mount test: handle.applySettings (save=false) flips data-red-letters and does not save.

<!-- fr:journal kind=discovery scope=plan id=p2-d1 created=2026-11-26T11:55:49+00:00 phase=2 -->
### p2-d1 · discovery · fr isolation exec cannot run npm here: node_modules is darwin (phase 2)

The container is linux-arm64 but the worktree's node_modules was installed on the host (rollup-darwin-arm64), so vitest/playwright were run on the host from the worktree cwd instead of through fr isolation exec.

<!-- fr:journal kind=discovery scope=plan id=p2-d2 created=2026-11-26T11:55:49+00:00 phase=2 -->
### p2-d2 · discovery · The page cannot scroll up, so a block above the band at the page top stays under the cards (phase 2)

The follow aims at bandTop + 8, but a block whose natural top is above that and whose scroller is already at 0 cannot move down. The window (outline) is clipped to the band, so it is empty there. The packaged-build e2e therefore moves to a deeper section (n x3) before asserting the follow.

<!-- fr:journal kind=finding scope=plan id=p2-f1 created=2026-11-26T11:55:49+00:00 phase=2 state=open review_scope=out -->
### p2-f1 · finding [open] (reviewer: out of scope) · Pages with scroll-snap pull the block back under the cards (phase 2)

On tests/fixtures/snap.html (proximity snap on blocks) the instant scroll to bandTop + 8 snaps back to a snap point, leaving the block under the cards and the outline (clipped to the band) empty. Before this change the aim (10 % of the viewport) was close to a snap point at the top. The p5a-r2 e2e now asserts the window height only for smooth.html. A fix would need the follow to accept the snapped position or lift the snap while following.

<!-- fr:journal kind=finding scope=plan id=p2-f2 created=2026-11-26T11:55:49+00:00 phase=2 state=open review_scope=out -->
### p2-f2 · finding [open] (reviewer: out of scope) · Title or stop card is squeezed to a strip when the exhibit list is tall (phase 2)

The support is a flex column with a capped height; .sr-stage-details has flex 0 1 auto, so with two or more exhibits the chapter or stop card above them is clipped (visible in the 'title card and two exhibits' screenshot). The same shrink rule existed before the move; now that the card is the first thing under the stage it is more visible.

<!-- fr:journal kind=discovery scope=plan id=p2-d3 created=2026-11-26T11:55:49+00:00 phase=2 -->
### p2-d3 · discovery · VS Code webview e2e indexed exhibits in document order (phase 2)

tests/e2e/webview.spec.ts picked the first and second math exhibit with nth(0) and nth(1); the dock lists the newest first, so the indices swap. The webview shares core's bottomStage dock, so it gets the new order too.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p2-t1 created=2026-11-26T11:55:49+00:00 phase=2 -->
### no-refactor-p2-t1 · discovery · no-refactor-because P2.T1 (phase 2)

newestFirst is one conditional in add(); the two orderings share before() and sort the same way, nothing to extract

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p2-t2 created=2026-11-26T11:55:49+00:00 phase=2 -->
### no-refactor-p2-t2 · discovery · no-refactor-because P2.T2 (phase 2)

a DOM-order swap plus grid-area edits; no duplication introduced

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p2-t3 created=2026-11-26T11:55:49+00:00 phase=2 -->
### no-refactor-p2-t3 · discovery · no-refactor-because P2.T3 (phase 2)

setBandBottom became setBandTop and place/tick read one bandTop(); no leftover code from the old clip

<!-- fr:journal kind=finding scope=plan id=p2-r1 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r1 · finding [open] (reviewer: in scope) · Floating outline card sits on the page band and covers the followed block (phase 2)

styles.ts:554-556 put the outline at band top + 8.

<!-- fr:journal kind=finding scope=plan id=p2-r2 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r2 · finding [open] (reviewer: in scope) · On proximity-snap pages the follow ends with the block under the stage; the snap assertion was dropped (covers p2-f1) (phase 2)

tests/e2e/extension.spec.ts:861-866.

<!-- fr:journal kind=finding scope=plan id=p2-r3 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r3 · finding [open] (reviewer: in scope) · The current stop/dwell card, first under the stage, is squeezed whenever an exhibit shows (covers p2-f2) (phase 2)

styles.ts:524 flex 0 1 auto inside the capped support.

<!-- fr:journal kind=finding scope=plan id=p2-r4 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r4 · finding [open] (reviewer: in scope) · Fixed-toolbar e2e no longer exercises the chrome floor; belowChrome scan capped at 0.6 of the viewport (phase 2)

extension.spec.ts:672; reader-entry.ts:249-270.

<!-- fr:journal kind=finding scope=plan id=p2-r5 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r5 · finding [open] (reviewer: in scope) · Stop-card re-follow e2e passes by construction (phase 2)

extension.spec.ts:904-920 asserted w.top >= bandTop, which place() guarantees.

<!-- fr:journal kind=finding scope=plan id=p2-r6 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r6 · finding [open] (reviewer: in scope) · Packaged-build test lost its follow checks (phase 2)

extension.spec.ts:507-528.

<!-- fr:journal kind=finding scope=plan id=p2-r7 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=in -->
### p2-r7 · finding [open] (reviewer: in scope) · Teardown unsubscribe from onBandChange untested (phase 2)

reader-entry.ts:616.

<!-- fr:journal kind=finding scope=plan id=p2-r8 created=2026-11-26T13:36:37+00:00 phase=2 state=open review_scope=out -->
### p2-r8 · finding [open] (reviewer: out of scope) · Short windows leave a tiny page band (phase 2)

The calc(100vh - 245px) support reservation (styles.ts:549) predates this change.

<!-- fr:journal kind=review scope=plan id=p2-review created=2026-11-26T13:36:37+00:00 phase=2 -->
### p2-review · review · phase 2 review: 7 in-scope findings (incl. p2-f1, p2-f2 reclassified), all fixed; 1 out of scope (phase 2)

Independent reviewer checked newest-first insert, dock DOM/grid, freeBand/onBandChange, follow aim/refollow/teardown and the e2e rewrites against R4-R6, and drove the extension fixture. p2-r2 = p2-f1 and p2-r3 = p2-f2, reclassified in scope by the reviewer; the operator approved fixing both. Fixes: 154b78b, e9324a1, bd8e18a; full suite green after them.

<!-- fr:journal kind=finding scope=plan id=p2-r1-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r1 -->
### p2-r1-resolved · finding [fixed] · resolves p2-r1: Floating outline card sits on the page band and covers the followed block (phase 2)

Outline align-self end at the bottom of row 3; e2e asserts the outline does not intersect the followed block.

<!-- fr:journal kind=finding scope=plan id=p2-r2-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r2 -->
### p2-r2-resolved · finding [fixed] · resolves p2-r2: On proximity-snap pages the follow ends with the block under the stage; the snap assertion was dropped (covers p2-f1) (phase 2)

Same defect as p2-f1; fixed by e9324a1 (scroll-padding-top) with the snap.html assertion restored in bd8e18a.

<!-- fr:journal kind=finding scope=plan id=p2-r3-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r3 -->
### p2-r3-resolved · finding [fixed] · resolves p2-r3: The current stop/dwell card, first under the stage, is squeezed whenever an exhibit shows (covers p2-f2) (phase 2)

Same defect as p2-f2; fixed by 154b78b (details flex 0 0 auto) with the whole-card e2e in bd8e18a.

<!-- fr:journal kind=finding scope=plan id=p2-f1-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-f1 answered_by=operator -->
### p2-f1-resolved · finding [fixed] · resolves p2-f1: Pages with scroll-snap pull the block back under the cards (phase 2)

Reclassified in scope by the reviewer (p2-r2); operator approved. scroll-padding-top = bandTop + 8 on the scroller, restored on close; snap.html height assertion restored; unit test for set/update/restore.

<!-- fr:journal kind=finding scope=plan id=p2-f2-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-f2 answered_by=operator -->
### p2-f2-resolved · finding [fixed] · resolves p2-f2: Title or stop card is squeezed to a strip when the exhibit list is tall (phase 2)

Reclassified in scope by the reviewer (p2-r3); operator approved. Details card flex 0 0 auto, exhibits flex 0 1 auto with the list scrolling; e2e asserts the card is whole in Overlay and Side panel.

<!-- fr:journal kind=finding scope=plan id=p2-r4-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r4 -->
### p2-r4-resolved · finding [fixed] · resolves p2-r4: Fixed-toolbar e2e no longer exercises the chrome floor; belowChrome scan capped at 0.6 of the viewport (phase 2)

Scan limit relative to its start; e2e runs header 128 and 320 px and asserts aim = header bottom + 8 at 320.

<!-- fr:journal kind=finding scope=plan id=p2-r5-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r5 -->
### p2-r5-resolved · finding [fixed] · resolves p2-r5: Stop-card re-follow e2e passes by construction (phase 2)

Asserts the block sits 8 px under the band top within 1 px after the card appears.

<!-- fr:journal kind=finding scope=plan id=p2-r6-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r6 -->
### p2-r6-resolved · finding [fixed] · resolves p2-r6: Packaged-build test lost its follow checks (phase 2)

Restored reached-block position and paragraph-gap checks.

<!-- fr:journal kind=finding scope=plan id=p2-r7-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=fixed resolves=p2-r7 -->
### p2-r7-resolved · finding [fixed] · resolves p2-r7: Teardown unsubscribe from onBandChange untested (phase 2)

Unit test: closing the reader disconnects every ResizeObserver; fails without offBand().

<!-- fr:journal kind=finding scope=plan id=p2-r8-resolved created=2026-11-26T13:36:37+00:00 phase=2 state=open resolves=p2-r8 out_of_scope=true -->
### p2-r8-resolved · finding [out-of-scope] · resolves p2-r8: Short windows leave a tiny page band (phase 2)

The support's max-height reservation predates this change; the band size in short windows is unchanged by moving the stage.
