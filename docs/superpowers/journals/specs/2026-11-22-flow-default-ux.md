<!-- fr:journal-schema=4 -->
# Journal: 2026-11-22-flow-default-ux

<!-- fr:journal kind=discovery scope=spec id=operator-brief created=2026-11-22T08:22:54+00:00 input=true -->
### operator-brief · discovery · Operator brief, verbatim

UX improvements: The three-row-flow should be the default. The red brackets in this mode should have a configurable stable length, what a typical human can process in one glance. No red letter in this mode. The WPM display on both read modes should have controls that modify it on the fly in 25 WPM increments. Also, if overlay mode in VS Code cannot work, disable the option.

<!-- fr:journal kind=decision scope=spec id=d1-focus-span created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d1-focus-span · decision · Bracket length is a fixed focus span in characters, default 20

Operator answered "20 chars as default." (unit characters, measured in the ribbon font).

<!-- fr:journal kind=decision scope=spec id=d2-stepping created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d2-stepping · decision · One word per step stays

The ribbon still advances one word per step; only the bracket's look changes.

<!-- fr:journal kind=decision scope=spec id=d3-migration created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d3-migration · decision · Move every existing user to flow once

A one-time migration switches stored chunk to flow; later choices are kept.

<!-- fr:journal kind=decision scope=spec id=d4-vscode-display created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d4-vscode-display · decision · Hide the Reader display field in VS Code

Leave the field out of the VS Code Settings panel and drop the speedRead.display contribution.

<!-- fr:journal kind=decision scope=spec id=d5-wpm-controls created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d5-wpm-controls · decision · WPM stepper buttons plus wheel on the readout

− / + buttons beside the readout and the mouse wheel over it, 25 WPM per step, both modes.

<!-- fr:journal kind=decision scope=spec id=d6-verification created=2026-11-22T08:22:54+00:00 decided_by=operator -->
### d6-verification · decision · Automated verification, developer gate

Unit tests and Playwright before merge with PR screenshots; nothing held after merge.

<!-- fr:journal kind=finding scope=spec id=s-r1 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r1 · finding [open] (reviewer: in scope) · Changing Focus span does not resize the brackets, because no settings change triggers a relayout

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r2 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r2 · finding [open] (reviewer: in scope) · Removing .sr-flow-mid leaves the current word with no DOM marker that tests rely on

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r3 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r3 · finding [open] (reviewer: in scope) · The Test surface ignores the existing tests that assume chunk is the default

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r4 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r4 · finding [open] (reviewer: in scope) · Making display a host setting is under-specified

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r5 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r5 · finding [open] (reviewer: in scope) · The renderStatus rebuild would drop focus from persistent buttons

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r6 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r6 · finding [open] (reviewer: in scope) · The stepper's keyboard reasoning misstates keys.ts, and a focused button takes Space away from play/pause

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r7 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r7 · finding [open] (reviewer: in scope) · The new click and wheel handlers do not honour ctx.accepts

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r8 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r8 · finding [open] (reviewer: in scope) · One step per wheel event over-steps on trackpads and mishandles horizontal and ctrl wheel events

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r9 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r9 · finding [open] (reviewer: in scope) · Row reader-three-row-flow still says chunk stays the default

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r10 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r10 · finding [open] (reviewer: in scope) · The README still documents chunk as the default and the red letter

See the independent spec review spec-review-1.

<!-- fr:journal kind=finding scope=spec id=s-r11 created=2026-11-22T08:27:47+00:00 state=open review_scope=in -->
### s-r11 · finding [open] (reviewer: in scope) · Some cited line numbers are off by one

See the independent spec review spec-review-1.

<!-- fr:journal kind=review scope=spec id=spec-review-1 created=2026-11-22T08:27:47+00:00 -->
### spec-review-1 · review · independent spec review: 11 findings

Decisions d1-d6 honoured; findings s-r1..s-r11 all in scope (settings relayout, current-word marker, chunk-default test fallout, display host setting, status rebuild, keyboard focus, trusted events, wheel stepping, reader-three-row-flow row, README, line numbers).

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-22T08:27:47+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · Removing .sr-flow-mid and flipping the default ripple through many unit and e2e tests

<!-- fr:journal kind=lens scope=spec id=lens-security-1 created=2026-11-22T08:27:47+00:00 lens=security step=spec-review -->
### lens-security-1 · lens · New click and wheel inputs in the browser reader must respect trustedEventsOnly

<!-- fr:journal kind=finding scope=spec id=s-r1-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r1 -->
### s-r1-resolved · finding [fixed] · resolves s-r1: Changing Focus span does not resize the brackets, because no settings change triggers a relayout

Spec adds a player.on('settings') handler that resizes the live bracket when focusChars changes; test listed.

<!-- fr:journal kind=finding scope=spec id=s-r2-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r2 -->
### s-r2-resolved · finding [fixed] · resolves s-r2: Removing .sr-flow-mid leaves the current word with no DOM marker that tests rely on

Spec adds data-current on the current .sr-w and moves the existing unit/e2e assertions onto it.

<!-- fr:journal kind=finding scope=spec id=s-r3-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r3 -->
### s-r3-resolved · finding [fixed] · resolves s-r3: The Test surface ignores the existing tests that assume chunk is the default

Test surface now says chunk tests pin readingMode 'chunk' and the storage fallback assertion flips to flow.

<!-- fr:journal kind=finding scope=spec id=s-r4-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r4 -->
### s-r4-resolved · finding [fixed] · resolves s-r4: Making display a host setting is under-specified

Spec widens HostSetting, guards the populate line and read(), adds a harness display option (default true) and has the demo declare display.

<!-- fr:journal kind=finding scope=spec id=s-r5-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r5 -->
### s-r5-resolved · finding [fixed] · resolves s-r5: The renderStatus rebuild would drop focus from persistent buttons

Spec keeps the stepper group as a fixed child of status and updates only its text; focus survival tested.

<!-- fr:journal kind=finding scope=spec id=s-r6-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r6 -->
### s-r6-resolved · finding [fixed] · resolves s-r6: The stepper's keyboard reasoning misstates keys.ts, and a focused button takes Space away from play/pause

Rationale corrected; buttons are tabindex -1 and a pointer click returns focus to the reader.

<!-- fr:journal kind=finding scope=spec id=s-r7-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r7 -->
### s-r7-resolved · finding [fixed] · resolves s-r7: The new click and wheel handlers do not honour ctx.accepts

Both listeners check ctx.accepts; an untrusted-event test is listed.

<!-- fr:journal kind=finding scope=spec id=s-r8-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r8 -->
### s-r8-resolved · finding [fixed] · resolves s-r8: One step per wheel event over-steps on trackpads and mishandles horizontal and ctrl wheel events

Wheel uses wheelDelta, ignores zero vertical, leaves ctrl/meta, accumulates 100 px per step with a 300 ms reset.

<!-- fr:journal kind=finding scope=spec id=s-r9-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r9 -->
### s-r9-resolved · finding [fixed] · resolves s-r9: Row reader-three-row-flow still says chunk stays the default

Spec lists a reword amendment of reader-three-row-flow; added in this record.

<!-- fr:journal kind=finding scope=spec id=s-r10-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r10 -->
### s-r10-resolved · finding [fixed] · resolves s-r10: The README still documents chunk as the default and the red letter

Spec adds a Docs section that updates the README.

<!-- fr:journal kind=finding scope=spec id=s-r11-resolved created=2026-11-22T08:27:47+00:00 state=fixed resolves=s-r11 -->
### s-r11-resolved · finding [fixed] · resolves s-r11: Some cited line numbers are off by one

Citations corrected to settings.ts:42 and stage.ts:228-246.

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-22T08:27:48+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  reader-flow-default: none
  reader-focus-span: none
  reader-wpm-stepper: none
  vscode-no-display-choice: none
row_kinds:
  reader-flow-default: none
  reader-focus-span: none
  reader-wpm-stepper: none
  vscode-no-display-choice: none
run_gate: developer
run_kind: none
```
