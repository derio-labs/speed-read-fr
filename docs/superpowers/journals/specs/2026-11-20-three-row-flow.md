<!-- fr:journal-schema=4 -->
# Journal: 2026-11-20-three-row-flow

<!-- fr:journal kind=discovery scope=spec id=operator-brief created=2026-11-19T23:01:47+00:00 input=true -->
### operator-brief · discovery · Three-row flow reading mode

I would like a second speed reading mode, where I can always see 3 rows of text and they "flow" along the crosshairs (in the center of the middle row)

<!-- fr:journal kind=decision scope=spec id=reading-mode-control created=2026-11-19T23:01:47+00:00 decided_by=operator -->
### reading-mode-control · decision · Select reading mode in Settings

Add a persistent Reading mode selector in Settings; leave the existing chunk-at-a-time mode as the default.

<!-- fr:journal kind=decision scope=spec id=rolling-three-row-flow created=2026-11-19T23:01:47+00:00 decided_by=operator -->
### rolling-three-row-flow · decision · Flow text through a fixed middle-row crosshair

Use a rolling three-line window that moves upward through a fixed center crosshair in the middle row, paced by configured WPM; preserve existing chapter, stop and exhibit behavior.

<!-- fr:journal kind=decision scope=spec id=flow-verification created=2026-11-19T23:01:47+00:00 decided_by=operator -->
### flow-verification · decision · Verify with CI and a browser UI check

Use automated CI tests and a browser UI check before merge, with no post-merge tester gate; candidate installation is unavailable because the repo has no .fr/candidate-install.

<!-- fr:journal kind=decision scope=spec id=flow-all-hosts created=2026-11-19T23:01:47+00:00 decided_by=operator -->
### flow-all-hosts · decision · Make flow mode available in all hosts

Expose the mode in Chrome, Firefox and VS Code through the shared reader core, with a separate saved preference per host.
