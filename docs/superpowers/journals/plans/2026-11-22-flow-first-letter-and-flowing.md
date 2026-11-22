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
