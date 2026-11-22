<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-flow-first-letter-and-flowing

<!-- fr:journal kind=decision scope=plan id=anchor-edges created=2026-11-22T16:52:59+00:00 phase=1 -->
### anchor-edges · decision · Anchors gain 'end' and 'begin' so an item gap is a real slide (phase 1)

The spec defines 'after' of a word and 'before' of the next as the same handover point, so a gap slide from {prev, after} to {next, before} would be zero distance and the ribbon would hold for the gap. The Anchor type has two more points, 'end' (the word's right edge) and 'begin' (the next word's left edge): a word before an item gap slides to 'end', the gap crosses to 'begin', the next word slides on from there. Positions still rise on every frame.

<!-- fr:journal kind=decision scope=plan id=atom-first-letter created=2026-11-22T16:52:59+00:00 phase=1 -->
### atom-first-letter · decision · An atom's first letter is wrapped inside its monospace span (phase 1)

tokenNodes wraps the first letter or digit of the joined word text in span.sr-w-first, also inside span.sr-atom for a code or math word. The existing stage test that expected an atom with no children now expects the single sr-w-first child.

<!-- fr:journal kind=decision scope=plan id=flowing-state created=2026-11-22T16:52:59+00:00 phase=1 -->
### flowing-state · decision · Flowing state is slide + rest anchor, applied through applyX (phase 1)

stage.ts holds slide {from,to,startedAt,durationMs}, rest (the placed word's middle or a frozen point), and a frame handle. placeRibbon cancels the slide and sets rest, the state listener freezes a slide on leaving playing (collapsing nested frozen anchors through freezeAnchor), relayoutRibbon re-derives x from the anchors, and a motion switch starts or cancels a slide at once.

<!-- fr:journal kind=discovery scope=plan id=handle-apply-no-save created=2026-11-22T16:52:59+00:00 phase=1 -->
### handle-apply-no-save · discovery · handle.applySettings never saves; only the panel path does (phase 1)

mountReader's handle.applySettings calls applySettings(next, false), so a test of 'saved' must change the setting through the Settings panel. The live-setting path (wpm, flowMotion) saves through the player 'settings' listener.

<!-- fr:journal kind=discovery scope=plan id=worktree-no-modules created=2026-11-22T16:52:59+00:00 phase=1 -->
### worktree-no-modules · discovery · The fresh worktree has no node_modules (phase 1)

npx vitest failed with ERR_MODULE_NOT_FOUND until npm ci ran in the worktree; node_modules is git-ignored.

<!-- fr:journal kind=discovery scope=plan id=range-stub-single-node created=2026-11-22T16:52:59+00:00 phase=1 -->
### range-stub-single-node · discovery · stage.test's Range stub assumed one text node per word (phase 1)

The first-letter span splits a word into several text nodes, so the stubbed Range.getBoundingClientRect now sums the text before the start container.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t5 created=2026-11-22T16:52:59+00:00 phase=1 -->
### no-refactor-p1-t5 · discovery · no-refactor-because P1.T5 (phase 1)

stage.ts stays readable with the slide helpers (flowWord, flowGap, syncMotion) next to the ribbon code; the step classification is three lines in flowWord, so a pure classifyFlowStep in ribbon-geometry.ts would only move them away from the state they read.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t6 created=2026-11-22T16:52:59+00:00 phase=1 -->
### no-refactor-p1-t6 · discovery · no-refactor-because P1.T6 (phase 1)

speech reuses flowWord and the same slide path with a spoken flag; there was no duplicated speech check to remove.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t7 created=2026-11-22T16:52:59+00:00 phase=1 -->
### no-refactor-p1-t7 · discovery · no-refactor-because P1.T7 (phase 1)

the e2e helpers openFlow and openInline now pin flowMotion 'word' once for every flow case that reads the middle letter on the centre; nothing further to reuse.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-22T17:12:54+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · Frozen anchors nest one level per early or simultaneous speech boundary, so per-frame anchorX cost grows without bound (phase 1)

freezeAnchor collapsed only when the new slide shared the old `to`; every speech retarget has a new `to`. Verified at ribbon-geometry.ts freezeAnchor and stage.ts hereAnchor.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-22T17:12:54+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · flowGap slides from wherever the ribbon rests, sweeping the whole item in the gap's time (phase 1)

With speech and no boundaries the ribbon rests on the item's first word; the timed gap slid it to the next item's begin. Reproduced by a new stage test (x 59 > handover 52.5 before the fix).

<!-- fr:journal kind=finding scope=plan id=p1-r3 created=2026-11-22T17:12:54+00:00 phase=1 state=open review_scope=in -->
### p1-r3 · finding [open] (reviewer: in scope) · markBracket/anchorX scan the whole window each frame instead of only the spans near the target (phase 1)

markBracket iterated all spans (up to 400) every frame.

<!-- fr:journal kind=finding scope=plan id=p1-r4 created=2026-11-22T17:12:54+00:00 phase=1 state=open review_scope=in -->
### p1-r4 · finding [open] (reviewer: in scope) · Acceptance rows reader-flow-first-letter / reader-flowing-motion still not-implemented with no level refs (phase 1)

Tests verifying them landed in this phase.

<!-- fr:journal kind=review scope=plan id=review-p1 created=2026-11-22T17:12:54+00:00 phase=1 -->
### review-p1 · review · phase 1 code review: 4 findings, all in scope, all fixed (phase 1)

Dispatched code reviewer (superpowers:requesting-code-review) raised p1-r1..p1-r4; each verified against the code and fixed with tests (superpowers:receiving-code-review). Reviewer judged the anchor-edges deviation sound. Suite after fixes: vitest 809 passed / 7 skipped, Playwright 120 passed. Visual pass: the reviewer drove the bottom-stage demo with its own Playwright scripts (review-shots/*.mjs), opened 31 fresh screenshots covering every declared state of both rows, and found no defect.

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-22T17:12:54+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: Frozen anchors nest one level per early or simultaneous speech boundary, so per-frame anchorX cost grows without bound (phase 1)

hereAnchor now re-expresses the live position with pointAnchor, a depth-1 anchor between the two adjacent word middles (binary search); freezeAnchor removed. Pure test asserts flatness over 50 re-freezes; stage test runs a chain of early boundaries.

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-22T17:12:54+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: flowGap slides from wherever the ribbon rests, sweeping the whole item in the gap's time (phase 1)

flowGap slides only when the braces are shown and the ribbon's word is the one before the gap; otherwise the ribbon stays until the next word places it. New stage test red before, green after.

<!-- fr:journal kind=finding scope=plan id=p1-r3-resolved created=2026-11-22T17:12:54+00:00 phase=1 state=fixed resolves=p1-r3 -->
### p1-r3-resolved · finding [fixed] · resolves p1-r3: markBracket/anchorX scan the whole window each frame instead of only the spans near the target (phase 1)

markBracket uses `overlapping` (binary search on sorted spans) to visit only spans near the bracket, tested against a full scan. With anchors flat, anchorX does at most four indexOf lookups per frame, which is negligible.

<!-- fr:journal kind=finding scope=plan id=p1-r4-resolved created=2026-11-22T17:12:54+00:00 phase=1 state=fixed resolves=p1-r4 -->
### p1-r4-resolved · finding [fixed] · resolves p1-r4: Acceptance rows reader-flow-first-letter / reader-flowing-motion still not-implemented with no level refs (phase 1)

Both rows moved to ci with unit and ui level refs via fr acceptance set-status (CI runs npm test and test:e2e).

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r1 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r1 · finding [open] (reviewer: in scope) · slideX(anchorX(from), anchorX(to), ...) expression copied three times in stage.ts

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r2 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r2 · finding [open] (reviewer: in scope) · applyX duplicates placeRibbon's offset/style writes

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r3 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r3 · finding [open] (reviewer: in scope) · inBracket/screenLeft re-test what overlapping() already guarantees

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r4 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r4 · finding [open] (reviewer: in scope) · firstLetter duplicates alnumOffsets and forced exporting ALNUM

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r5 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r5 · finding [open] (reviewer: in scope) · flowWord + showFlow(place=false) re-implement half of placeRibbon behind a flag

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r6 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r6 · finding [open] (reviewer: in scope) · stepInfo assigned in three places

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r7 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r7 · finding [open] (reviewer: in scope) · redundant readingMode check before flowing()

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r8 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r8 · finding [open] (reviewer: in scope) · isInlineStop not used in showStep

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r9 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r9 · finding [open] (reviewer: in scope) · liveRibbon duplicates showFlow's liveness predicate

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r10 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-simplicity-r10 · finding [open] (reviewer: in scope) · mount.ts LIVE_KEYS machinery heavier than a literal

Raised by the simplicity lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r1 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r1 · finding [open] (reviewer: in scope) · syncMotion's remaining-time slide untested

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r2 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r2 · finding [open] (reviewer: in scope) · switching Flow motion while paused untested

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r3 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r3 · finding [open] (reviewer: in scope) · item-gap test does not pin end/begin anchors

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r4 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r4 · finding [open] (reviewer: in scope) · Flowing with estimated boundaries never exercised

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r5 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r5 · finding [open] (reviewer: in scope) · e2e clears-after-leaving assertion skipped behind if (same)

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r6 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r6 · finding [open] (reviewer: in scope) · first-letter mark offset inside a later token untested

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r7 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r7 · finding [open] (reviewer: in scope) · player.setFlowMotion untested

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r8 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r8 · finding [open] (reviewer: in scope) · spokenWordMs test restates the formula

Raised by the tests lens reviewer.

<!-- fr:journal kind=finding scope=plan id=l-tests-r9 created=2026-11-22T17:32:42+00:00 state=open review_scope=in -->
### l-tests-r9 · finding [open] (reviewer: in scope) · garbled leftover comment in inBracket test

Raised by the tests lens reviewer.

<!-- fr:journal kind=review scope=plan id=lens-review-1 created=2026-11-22T17:32:42+00:00 -->
### lens-review-1 · review · lens review: simplicity 10 findings, tests 9 findings, all in scope, all closed

One reviewer per lens (simplicity, tests) over the diff from merge base 1af2e37 to HEAD; findings verified and fixed with tests (mutation-checked), l-tests-r6 closed by removing the unreachable code. Suite after fixes: vitest 816 passed / 7 skipped, Playwright 120 passed.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r1-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r1 -->
### l-simplicity-r1-resolved · finding [fixed] · resolves l-simplicity-r1: slideX(anchorX(from), anchorX(to), ...) expression copied three times in stage.ts

Extracted slideNowX(r, s), used by hereAnchor, tick and relayoutRibbon.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r2-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r2 -->
### l-simplicity-r2-resolved · finding [fixed] · resolves l-simplicity-r2: applyX duplicates placeRibbon's offset/style writes

applyX(r, x, glide = 0); placeRibbon computes the glide and calls it.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r3-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r3 -->
### l-simplicity-r3-resolved · finding [fixed] · resolves l-simplicity-r3: inBracket/screenLeft re-test what overlapping() already guarantees

markBracket uses the overlapping range directly; inBracket/screenLeft deleted, edge cases moved to overlapping tests (strictness mutation-checked).

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r4-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r4 -->
### l-simplicity-r4-resolved · finding [fixed] · resolves l-simplicity-r4: firstLetter duplicates alnumOffsets and forced exporting ALNUM

firstLetter moved to text/middle.ts on alnumOffsets; ALNUM private again; tests moved.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r5-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r5 -->
### l-simplicity-r5-resolved · finding [fixed] · resolves l-simplicity-r5: flowWord + showFlow(place=false) re-implement half of placeRibbon behind a flag

setCurrent split out; showFlow only builds/returns the ribbon, placeFlow positions; kind ternary replaced by if/else.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r6-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r6 -->
### l-simplicity-r6-resolved · finding [fixed] · resolves l-simplicity-r6: stepInfo assigned in three places

Set once in showFlowStep and passed to flowWord; flowGap clears it for its own step.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r7-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r7 -->
### l-simplicity-r7-resolved · finding [fixed] · resolves l-simplicity-r7: redundant readingMode check before flowing()

Dropped.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r8-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r8 -->
### l-simplicity-r8-resolved · finding [fixed] · resolves l-simplicity-r8: isInlineStop not used in showStep

showStep uses isInlineStop (now a type guard).

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r9-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r9 -->
### l-simplicity-r9-resolved · finding [fixed] · resolves l-simplicity-r9: liveRibbon duplicates showFlow's liveness predicate

showFlow reuses liveRibbon() plus run bounds.

<!-- fr:journal kind=finding scope=plan id=l-simplicity-r10-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-simplicity-r10 -->
### l-simplicity-r10-resolved · finding [fixed] · resolves l-simplicity-r10: mount.ts LIVE_KEYS machinery heavier than a literal

Replaced with the two-field JSON literal comparison.

<!-- fr:journal kind=finding scope=plan id=l-tests-r1-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r1 -->
### l-tests-r1-resolved · finding [fixed] · resolves l-tests-r1: syncMotion's remaining-time slide untested

New test pins x at the handover by the end of the step; the full-time mutation fails it.

<!-- fr:journal kind=finding scope=plan id=l-tests-r2-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r2 -->
### l-tests-r2-resolved · finding [fixed] · resolves l-tests-r2: switching Flow motion while paused untested

New test: no movement while paused after switching back; dropping the playing guard fails it.

<!-- fr:journal kind=finding scope=plan id=l-tests-r3-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r3 -->
### l-tests-r3-resolved · finding [fixed] · resolves l-tests-r3: item-gap test does not pin end/begin anchors

Gap test asserts the first gap frame at the item's right edge and the next word's first frame at its left edge; removing the end branch fails it.

<!-- fr:journal kind=finding scope=plan id=l-tests-r4-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r4 -->
### l-tests-r4-resolved · finding [fixed] · resolves l-tests-r4: Flowing with estimated boundaries never exercised

New estimate=true test: x never goes back, at most one still frame across >3 boundaries; a 0.7x slide mutation fails it. No R6 bug found.

<!-- fr:journal kind=finding scope=plan id=l-tests-r5-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r5 -->
### l-tests-r5-resolved · finding [fixed] · resolves l-tests-r5: e2e clears-after-leaving assertion skipped behind if (same)

Steps scrub(1) until the word leaves the bracket, requires same to be defined, then asserts.

<!-- fr:journal kind=finding scope=plan id=l-tests-r6-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r6 -->
### l-tests-r6-resolved · finding [fixed] · resolves l-tests-r6: first-letter mark offset inside a later token untested

Shape is impossible: flow forces chunkWords 1 (timeline.ts:163), one token per word; the multi-token mark() was removed and markedNodes(token) builds the word, so there is no untested branch left.

<!-- fr:journal kind=finding scope=plan id=l-tests-r7-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r7 -->
### l-tests-r7-resolved · finding [fixed] · resolves l-tests-r7: player.setFlowMotion untested

player.test.ts covers one event on change, none for same value, none after close; guard mutations fail.

<!-- fr:journal kind=finding scope=plan id=l-tests-r8-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r8 -->
### l-tests-r8-resolved · finding [fixed] · resolves l-tests-r8: spokenWordMs test restates the formula

Asserts known values 300->200, 180->333.33, 60->666.67, 1000->111.11; removing the clamp fails it.

<!-- fr:journal kind=finding scope=plan id=l-tests-r9-resolved created=2026-11-22T17:32:42+00:00 state=fixed resolves=l-tests-r9 -->
### l-tests-r9-resolved · finding [fixed] · resolves l-tests-r9: garbled leftover comment in inBracket test

Moot: the test was deleted with l-simplicity-r3.
