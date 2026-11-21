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
