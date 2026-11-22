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
