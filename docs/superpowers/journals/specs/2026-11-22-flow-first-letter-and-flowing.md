<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-flow-first-letter-and-flowing

<!-- fr:journal kind=discovery scope=spec id=operator-brief created=2026-11-22T16:23:10+00:00 input=true -->
### operator-brief · discovery · Operator brief (verbatim)

two changes: 1. in the three row flow mode, the first letter of each word becomes red as soon as it enters inside the red brackets and remains so as long as any part of the word remains inside the brackets. 2. add a modifier to the three row flow mode, word-based vs flowing. The word-based is the current one, the flowing is the same speed but continuous, flowing, without stopping for each word.

<!-- fr:journal kind=decision scope=spec id=d1-flowing-pace created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d1-flowing-pace · decision · Flowing pace: per-word timing

The ribbon slides continuously over each word's own scheduled time (handover point to handover point); average speed equals WPM, pauses become slowdowns. Decided by the operator (recommended option).

<!-- fr:journal kind=decision scope=spec id=d2-motion-control created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d2-motion-control · decision · Control: Settings field 'Flow motion', default Flowing

A Flow motion select (Word by word / Flowing) in Settings, saved per host (speedRead.flowMotion in VS Code). Operator chose the recommended field but with Flowing as the default.

<!-- fr:journal kind=decision scope=spec id=d3-speech-reduced-motion created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d3-speech-reduced-motion · decision · Flowing keeps flowing with speech; reduced motion falls back to word steps

With speech on, each spoken/estimated boundary starts a slide toward the next word over its estimated time; reduced motion behaves like Word by word. Decided by the operator.

<!-- fr:journal kind=decision scope=spec id=d4-verification created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d4-verification · decision · Verification: unit + Playwright, developer gate

Unit tests and Playwright before merge with PR screenshots; developer gate; no post-merge steps. Decided by the operator (recommended option).

<!-- fr:journal kind=decision scope=spec id=d5-which-words created=2026-11-22T16:23:10+00:00 decided_by=operator -->
### d5-which-words · decision · Every middle-row word overlapping the bracket gets its first letter/digit red

Follows the brief's explicit "each word"; the letter is the first letter or digit (same alphabet as middleLetter), red not bold. Author's call from the brief text.

<!-- fr:journal kind=finding scope=spec id=s1 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s1 · finding [open] (reviewer: in scope) · Flow motion changes never reach the stage through player.on('settings'); they rebuild the timeline

target: spec

<!-- fr:journal kind=finding scope=spec id=s2 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s2 · finding [open] (reviewer: in scope) · Item gaps and inline stops/dwells are not designed for Flowing; the slide trigger catches inline dwells

target: spec

<!-- fr:journal kind=finding scope=spec id=s3 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s3 · finding [open] (reviewer: in scope) · A position jump while playing cannot be told apart from an ordinary advance or a spoken boundary

target: spec

<!-- fr:journal kind=finding scope=spec id=s4 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s4 · finding [open] (reviewer: in scope) · The speech path misses the sentence's first word, and its slide pace can stop and start

target: spec

<!-- fr:journal kind=finding scope=spec id=s5 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s5 · finding [open] (reviewer: in scope) · The mid-slide window-rebuild clause describes a case that cannot happen and misses the real coordinate handover

target: spec

<!-- fr:journal kind=finding scope=spec id=s6 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s6 · finding [open] (reviewer: in scope) · The test surface misses existing tests that the red first letter and the Flowing default will break

target: spec

<!-- fr:journal kind=finding scope=spec id=s7 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s7 · finding [open] (reviewer: in scope) · Several stage.ts line citations are off

target: spec

<!-- fr:journal kind=finding scope=spec id=s8 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s8 · finding [open] (reviewer: in scope) · markBracket is not re-run when the bracket or the layout changes without a step

target: spec

<!-- fr:journal kind=finding scope=spec id=s9 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s9 · finding [open] (reviewer: in scope) · R3 does not state that Flow motion is shown only in flow mode, though the design and the acceptance row do

target: spec

<!-- fr:journal kind=finding scope=spec id=s10 created=2026-11-22T16:30:29+00:00 state=open review_scope=in -->
### s10 · finding [open] (reviewer: in scope) · The Test Plan points to tests listed in ## Verification, but they are listed under Test surface

target: spec

<!-- fr:journal kind=review scope=spec id=spec-review created=2026-11-22T16:30:29+00:00 -->
### spec-review · review · independent spec review: 10 findings (all in scope, all fixed)

fr-spec-reviewer raised s1-s10; every finding was fixed in the spec.

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-22T16:30:29+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · Flowing is timing-heavy and many existing middle-letter / no-red-letter assertions must be rewritten

<!-- fr:journal kind=lens scope=spec id=lens-simplicity-1 created=2026-11-22T16:30:29+00:00 lens=simplicity step=spec-review -->
### lens-simplicity-1 · lens · Slide state must survive rebuilds, relayouts, motion switches and speech retargets

<!-- fr:journal kind=finding scope=spec id=s1-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s1 -->
### s1-resolved · finding [fixed] · resolves s1: Flow motion changes never reach the stage through player.on('settings'); they rebuild the timeline

flowMotion is now render-only: sameExceptLive in mount.ts, player.setFlowMotion emitting settings, stage settings listener handles the switch; R3 says the position does not move.

<!-- fr:journal kind=finding scope=spec id=s2-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s2 -->
### s2-resolved · finding [fixed] · resolves s2: Item gaps and inline stops/dwells are not designed for Flowing; the slide trigger catches inline dwells

Design now slides across item gaps in the gap's time, ends a word before an inline stop/dwell on its mid and holds with no back-glide; R4/R5 updated; tests added.

<!-- fr:journal kind=finding scope=spec id=s3-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s3 -->
### s3-resolved · finding [fixed] · resolves s3: A position jump while playing cannot be told apart from an ordinary advance or a spoken boundary

Continuation/resume/jump rules defined by index relative to r.index; a jump places the word at once then flows; tests for speech on and off.

<!-- fr:journal kind=finding scope=spec id=s4-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s4 -->
### s4-resolved · finding [fixed] · resolves s4: The speech path misses the sentence's first word, and its slide pace can stop and start

First word via show() handled by the same rule; slide time is spokenWordMs(wpm), the tts estimator's own pace, exported from tts.ts.

<!-- fr:journal kind=finding scope=spec id=s5-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s5 -->
### s5-resolved · finding [fixed] · resolves s5: The mid-slide window-rebuild clause describes a case that cannot happen and misses the real coordinate handover

Slides are expressed as word anchors and pixels re-derived from current spans every frame, so rebuilds and relayouts need no re-anchoring and cannot jump back; RUN_EDGE test added.

<!-- fr:journal kind=finding scope=spec id=s6-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s6 -->
### s6-resolved · finding [fixed] · resolves s6: The test surface misses existing tests that the red first letter and the Flowing default will break

Test surface names each affected test and whether it is rewritten or pinned to word (flowOpts, core.spec, extension.spec, webview.spec, tts-panel).

<!-- fr:journal kind=finding scope=spec id=s7-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s7 -->
### s7-resolved · finding [fixed] · resolves s7: Several stage.ts line citations are off

Line references corrected to the reviewer's verified lines.

<!-- fr:journal kind=finding scope=spec id=s8-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s8 -->
### s8-resolved · finding [fixed] · resolves s8: markBracket is not re-run when the bracket or the layout changes without a step

sizeTarget and relayoutRibbon re-mark; R1 states it; paused focus-span/relayout test added.

<!-- fr:journal kind=finding scope=spec id=s9-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s9 -->
### s9-resolved · finding [fixed] · resolves s9: R3 does not state that Flow motion is shown only in flow mode, though the design and the acceptance row do

R3 states the visibility rule; panel design describes the toggle listener and read() keeping the stored value.

<!-- fr:journal kind=finding scope=spec id=s10-resolved created=2026-11-22T16:30:29+00:00 state=fixed resolves=s10 -->
### s10-resolved · finding [fixed] · resolves s10: The Test Plan points to tests listed in ## Verification, but they are listed under Test surface

Test Plan now points at Test surface under ## Design.

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-22T16:30:30+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  reader-flow-first-letter: none
  reader-flowing-motion: none
row_kinds:
  reader-flow-first-letter: none
  reader-flowing-motion: none
run_gate: developer
run_kind: none
```
