<!-- fr:journal-schema=4 -->
# Journal: 2026-11-26-word-default-red-toggle-top-dock

<!-- fr:journal kind=discovery scope=spec id=brief created=2026-11-26T10:33:52+00:00 input=true -->
### brief · discovery · Operator brief

the flowing motion is "choppy" at 30Hz so we'll use word by word as default from now on. Also, let's make the red letters toggleable, default on. Another change: the reading box should be at the top of the page. The exhibits and title etc should appear underneath it and push the previous ones downward.

<!-- fr:journal kind=decision scope=spec id=D1 created=2026-11-26T10:33:52+00:00 decided_by=operator -->
### D1 · decision · Migration: move everyone once

Stored browser flowMotion 'flowing' becomes 'word' once via the migrations record; VS Code manifest default changes.

<!-- fr:journal kind=decision scope=spec id=D2 created=2026-11-26T10:33:52+00:00 decided_by=operator -->
### D2 · decision · Red letters toggle covers both modes

Flow first letter and chunk ORP pivot; other accents stay red.

<!-- fr:journal kind=decision scope=spec id=D3 created=2026-11-26T10:33:52+00:00 decided_by=operator -->
### D3 · decision · All dock hosts get the top reading box

Browser Overlay, Side panel, VS Code panel (bottomStage).

<!-- fr:journal kind=decision scope=spec id=D4 created=2026-11-26T10:33:52+00:00 decided_by=operator -->
### D4 · decision · Verification: unit + Playwright in CI

VS Code row stays walk-owed.

<!-- fr:journal kind=finding scope=spec id=s1 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s1 · finding [open] (reviewer: in scope) · The Red letters off rule loses to the flow first-letter accent rule on specificity

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s2 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s2 · finding [open] (reviewer: in scope) · Render-only redLetters path through applySettings is undesigned

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s3 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s3 · finding [open] (reviewer: in scope) · add prepends puts re-added earlier exhibits on top

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s4 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s4 · finding [open] (reviewer: in scope) · New follow aim drops the scrollport floor; FOLLOW_AT and fallback undefined

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s5 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s5 · finding [open] (reviewer: in scope) · Cards growing over the block do not re-aim or re-clip

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s6 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s6 · finding [open] (reviewer: in scope) · Floating-dock styles plan misses drawer rule and outline anchoring

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s7 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s7 · finding [open] (reviewer: in scope) · Test surface omits existing tests that assert the inverted behaviour

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s8 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s8 · finding [open] (reviewer: in scope) · Storage test 'leaves a missing record alone' contradicts the design

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=finding scope=spec id=s9 created=2026-11-26T11:09:41+00:00 state=open review_scope=in -->
### s9 · finding [open] (reviewer: in scope) · Panel 'reading section' and manifest description names do not match code

See the reviewer's return; fixed in the spec.

<!-- fr:journal kind=review scope=spec id=spec-review created=2026-11-26T11:09:41+00:00 -->
### spec-review · review · independent spec review: 9 findings, all in scope

fr-spec-reviewer checked the spec against D1-D4, the codebase (file:line for every named file, helper and selector) and itself. Findings s1-s9 were all in scope and are fixed in the spec.

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-26T11:09:41+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · existing unit and e2e assertions encode the old geometry and defaults; check none silently invert

<!-- fr:journal kind=lens scope=spec id=lens-simplicity-1 created=2026-11-26T11:09:41+00:00 lens=simplicity step=spec-review -->
### lens-simplicity-1 · lens · the generalised migration list and the dynamic follow band add moving parts; keep them minimal

<!-- fr:journal kind=finding scope=spec id=s1-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s1 -->
### s1-resolved · finding [fixed] · resolves s1: The Red letters off rule loses to the flow first-letter accent rule on specificity

Gate the accent rules themselves with .sr-reader:not([data-red-letters="off"]) (styles.ts:212, :241); pivot weight split out; shape block matches.

<!-- fr:journal kind=finding scope=spec id=s2-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s2 -->
### s2-resolved · finding [fixed] · resolves s2: Render-only redLetters path through applySettings is undesigned

redLetters joins sameExceptLive; the live branch assigns settings.redLetters, sets reader.dataset.redLetters and saves when save is true (mount.ts:116-117, :240-250).

<!-- fr:journal kind=finding scope=spec id=s3-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s3 -->
### s3-resolved · finding [fixed] · resolves s3: add prepends puts re-added earlier exhibits on top

newestFirst now inserts by reverse document position, mirroring exhibits.ts:93-95; test covers sync re-adds.

<!-- fr:journal kind=finding scope=spec id=s4-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s4 -->
### s4-resolved · finding [fixed] · resolves s4: New follow aim drops the scrollport floor; FOLLOW_AT and fallback undefined

Aim is max(bandTop+gap, port.top+gap, innerHeight*FOLLOW_AT) raised to chromeFloor; degenerate band falls back to 0/FOLLOW_AT; below defined; doc comments named.

<!-- fr:journal kind=finding scope=spec id=s5-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s5 -->
### s5-resolved · finding [fixed] · resolves s5: Cards growing over the block do not re-aim or re-clip

handle.onBandChange from a ResizeObserver on .sr-main and the support; overlay re-places and restarts the follow when the band top moves >1px.

<!-- fr:journal kind=finding scope=spec id=s6-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s6 -->
### s6-resolved · finding [fixed] · resolves s6: Floating-dock styles plan misses drawer rule and outline anchoring

Spec lists the grid template change, outline align/margin flip and the narrow drawer rule (styles.ts:541, :554-555, :562-563).

<!-- fr:journal kind=finding scope=spec id=s7-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s7 -->
### s7-resolved · finding [fixed] · resolves s7: Test surface omits existing tests that assert the inverted behaviour

Test surface lists each existing unit and e2e assertion to rewrite, with line refs.

<!-- fr:journal kind=finding scope=spec id=s8-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s8 -->
### s8-resolved · finding [fixed] · resolves s8: Storage test 'leaves a missing record alone' contradicts the design

Reworded to the unreadable-record case; added the both-migrations-in-one-write case.

<!-- fr:journal kind=finding scope=spec id=s9-resolved created=2026-11-26T11:09:41+00:00 state=fixed resolves=s9 -->
### s9-resolved · finding [fixed] · resolves s9: Panel 'reading section' and manifest description names do not match code

Names the Display fieldset; the manifest change is the default value only.

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-26T11:09:41+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  browser-dock-stage-top: none
  reader-red-letters-toggle: none
  reader-word-motion-default: none
row_kinds:
  browser-dock-stage-top: none
  reader-red-letters-toggle: none
  reader-word-motion-default: none
run_gate: developer
run_kind: none
```
