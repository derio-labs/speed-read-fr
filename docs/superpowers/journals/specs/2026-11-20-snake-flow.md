<!-- fr:journal-schema=4 -->
# Journal: 2026-11-20-snake-flow

<!-- fr:journal kind=discovery scope=spec id=900e6fa5f411 created=2026-11-20T12:44:43+00:00 input=true -->
### 900e6fa5f411 · discovery · Operator brief: snake flow

[screenshot of current three-row flow] This is not what I meant with Three row flow. 1st of all, the reading window should be much wider. 2nd, the words don't appear 3 at a time (or four or five - which should be allowed to grow again, as should the number of total characters - up to the width of the reading window). Rather the eye stays focused on the red target while the words flow through it, one at a time, snapping to the letter closer to the word's middlepoint. So three full rows are visible, flowing "like a snake": bottom row right > left > middle row right > left > top row right > left.  The flow reverses or keeps flowing interactively when rolling the mouse, as before

<!-- fr:journal kind=decision scope=spec id=d1-geometry created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d1-geometry · decision · One continuous ribbon on three rows; target fixed at middle-row centre; ribbon shifts left one word per step, rows wrap upward

Operator confirmed the ribbon reading (top = read, bottom = coming).

<!-- fr:journal kind=decision scope=spec id=d2-target created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d2-target · decision · Target = red braces above and below spanning the word; only centre letter red, not bold

Old ticks were too small, changed size, or were covered by glyphs.

<!-- fr:journal kind=decision scope=spec id=d3-inline-code created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d3-inline-code · decision · Atoms <=20 chars flow as words (monospace, extra time); longer atoms become a chip plus an exhibit following the code setting

Operator chose split-by-length over all-to-exhibits or all-flow.

<!-- fr:journal kind=decision scope=spec id=d4-motion created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d4-motion · decision · Quick glide (~100 ms, <= 1/3 word time) then hold; wheel drives the same glide

<!-- fr:journal kind=decision scope=spec id=d5-width created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d5-width · decision · Flow window near full width: min(1200px, viewport-64px) in overlay; full panel in VS Code

<!-- fr:journal kind=decision scope=spec id=d6-verification created=2026-11-21T05:48:23+00:00 decided_by=operator -->
### d6-verification · decision · Unit + Playwright pre-merge with PR screenshots; operator walk post-merge under tester gate

<!-- fr:journal kind=finding scope=spec id=s-r1 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r1 · finding [open] (reviewer: in scope) · Inline exhibits do not fit the exhibit model, which is keyed by block and rendered by cloning the block element

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r2 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r2 · finding [open] (reviewer: in scope) · The width design targets a floating layout no shipping host uses; the browser overlay is the bottom-stage grid

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r3 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r3 · finding [open] (reviewer: in scope) · The R11 cap also applies to the browser overlay, and the existing wrap path does not run in bottom-stage hosts

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r4 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r4 · finding [open] (reviewer: in scope) · The measured characters cap is not enforced or refreshed

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r5 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r5 · finding [open] (reviewer: in scope) · The speech design describes a fallback that is unreachable in shipping hosts and calls a behaviour change existing

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r6 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r6 · finding [open] (reviewer: in scope) · Glide duration is undefined for scrub and speech steps

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r7 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r7 · finding [open] (reviewer: in scope) · A chip's stop or dwell mid-sentence splits the ribbon run and the spoken sentence

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r8 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r8 · finding [open] (reviewer: in scope) · The middle-letter rule differs between R3 and the design, and atom pacing is only roughly defined

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r9 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r9 · finding [open] (reviewer: in scope) · The Test Plan walk omits R10 and R12

See reviewer return (spec-review-1).

<!-- fr:journal kind=finding scope=spec id=s-r10 created=2026-11-21T11:50:09+00:00 state=open review_scope=in -->
### s-r10 · finding [open] (reviewer: in scope) · Row reader-snake-flow has no verify: live

See reviewer return (spec-review-1).

<!-- fr:journal kind=review scope=spec id=spec-review-1 created=2026-11-21T11:50:09+00:00 -->
### spec-review-1 · review · independent spec review: 10 findings

fr-spec-reviewer checked the spec against brief 900e6fa5f411 and decisions d1-d6, the codebase (file:line for every named file) and internal consistency. Ten findings, all in scope: exhibit model (s-r1), bottom-stage overlay layout (s-r2), cap and wrap in bottom-stage hosts (s-r3, s-r4), estimated speech boundaries (s-r5), glide duration (s-r6), mid-sentence chip stops (s-r7), middle-letter and atom pacing rules (s-r8), Test Plan coverage (s-r9), row verify key (s-r10).

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-21T11:50:09+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · Checks must run on the bottom-stage layouts users see, not only the plain demo

<!-- fr:journal kind=lens scope=spec id=lens-simplicity-1 created=2026-11-21T11:50:09+00:00 lens=simplicity step=spec-review -->
### lens-simplicity-1 · lens · Ribbon layout over a bounded word window vs rendering only words near the target

<!-- fr:journal kind=finding scope=spec id=s-r1-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r1 -->
### s-r1-resolved · finding [fixed] · resolves s-r1: Inline exhibits do not fit the exhibit model, which is keyed by block and rendered by cloning the block element

Design now names a TimelineExhibit union with an inline variant, a per-exhibit identity key (b<block>i<inline>), core rendering via <pre><code> (never host.exhibit), and a unit test for two long atoms in one block.

<!-- fr:journal kind=finding scope=spec id=s-r2-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r2 -->
### s-r2-resolved · finding [fixed] · resolves s-r2: The width design targets a floating layout no shipping host uses; the browser overlay is the bottom-stage grid

Width section now targets the bottom-stage rules (styles.ts:470-472, 515-517); demo gains a ?bottomStage switch and Playwright runs flow/width checks on it.

<!-- fr:journal kind=finding scope=spec id=s-r3-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r3 -->
### s-r3-resolved · finding [fixed] · resolves s-r3: The R11 cap also applies to the browser overlay, and the existing wrap path does not run in bottom-stage hosts

R11 now covers every bottom-stage host; design names the new work: align() runs in bottom-stage hosts with axis 50%, shrink then data-wrap with bottom-stage wrap CSS.

<!-- fr:journal kind=finding scope=spec id=s-r4-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r4 -->
### s-r4-resolved · finding [fixed] · resolves s-r4: The measured characters cap is not enforced or refreshed

Design defines fit = floor(stageWidth/charWidth) clamped [5,80], measured after first layout and on resize, no cap at width 0, applied to effective settings in readSettings (stored value kept), panel max refreshed on open.

<!-- fr:journal kind=finding scope=spec id=s-r5-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r5 -->
### s-r5-resolved · finding [fixed] · resolves s-r5: The speech design describes a fallback that is unreachable in shipping hosts and calls a behaviour change existing

R12 and Speech section now state bottom-stage hosts follow estimated boundaries (tested), and the no-boundary hold is new behaviour reachable only on the plain demo.

<!-- fr:journal kind=finding scope=spec id=s-r6-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r6 -->
### s-r6-resolved · finding [fixed] · resolves s-r6: Glide duration is undefined for scrub and speech steps

Glide is min(100ms, baseMs(wpm)/3), independent of durationMs; mid-glide retarget from current position; snap for > one row and under prefers-reduced-motion.

<!-- fr:journal kind=finding scope=spec id=s-r7-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r7 -->
### s-r7-resolved · finding [fixed] · resolves s-r7: A chip's stop or dwell mid-sentence splits the ribbon run and the spoken sentence

Inline stops/dwells do not bound the ribbon; prompt renders in stage-details (or status line); speech splits the utterance at the stop and resumes; chip token defined (atom with full field), spoken as code/formula.

<!-- fr:journal kind=finding scope=spec id=s-r8-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r8 -->
### s-r8-resolved · finding [fixed] · resolves s-r8: The middle-letter rule differs between R3 and the design, and atom pacing is only roughly defined

R3 and design both use letters/digits index floor((n-1)/2); atom time = base x max(1, ceil(len/8)) replacing the flat bonus for atoms.

<!-- fr:journal kind=finding scope=spec id=s-r9-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r9 -->
### s-r9-resolved · finding [fixed] · resolves s-r9: The Test Plan walk omits R10 and R12

Test Plan adds steps 3 (chapter card + code stop) and 4 (speech); step 5 marked as also covered pre-merge.

<!-- fr:journal kind=finding scope=spec id=s-r10-resolved created=2026-11-21T11:50:09+00:00 state=fixed resolves=s-r10 -->
### s-r10-resolved · finding [fixed] · resolves s-r10: Row reader-snake-flow has no verify: live

Set via fr acceptance set-status --verify live (commit f0d26fd).

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-21T11:50:09+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  reader-dock-chunk-limits: none
  reader-inline-code-split: none
  reader-snake-flow: tester
row_kinds:
  reader-dock-chunk-limits: none
  reader-inline-code-split: none
  reader-snake-flow: live
run_gate: tester
run_kind: none
```
