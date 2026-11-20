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

<!-- fr:journal kind=finding scope=spec id=s1 created=2026-11-19T23:06:10+00:00 state=open review_scope=in -->
### s1 · finding [open] (reviewer: in scope) · Add the required top-level Test Plan section

The reviewed spec lacked a top-level Test Plan while artifacts.test_plan is enabled. Added the required heading and stated there are no post-merge operator steps because CI and the browser scenario verify the behavior before merge.

<!-- fr:journal kind=finding scope=spec id=s2 created=2026-11-19T23:06:10+00:00 state=open review_scope=in -->
### s2 · finding [open] (reviewer: in scope) · Declare the VS Code readingMode contribution

The VS Code host declares each speedRead setting in packages/vscode-extension/package.json and maps it through config.ts. The spec now requires the speedRead.readingMode enum/default contribution and coverage of the existing normalization and configuration path.

<!-- fr:journal kind=finding scope=spec id=s3 created=2026-11-19T23:06:10+00:00 state=open review_scope=in -->
### s3 · finding [open] (reviewer: in scope) · Define the flow-mode focus marker geometry

The existing chunk-mode .sr-axis sits at 45 percent and shifts with list depth. The spec now defines a separate flow-mode marker at the horizontal center and the vertical midpoint of the middle row, independent of list depth, while preserving the existing marker in chunk mode.

<!-- fr:journal kind=review scope=spec id=spec-review created=2026-11-19T23:06:10+00:00 -->
### spec-review · review · Independent spec review: 3 findings

The reviewer verified all four operator decisions against the spec and codebase and raised three in-scope findings. All three are fixed in the spec.

<!-- fr:journal kind=lens scope=spec id=lens-tests-1 created=2026-11-19T23:06:10+00:00 lens=tests step=spec-review -->
### lens-tests-1 · lens · Check visual geometry and per-host settings coverage across the feature.

<!-- fr:journal kind=finding scope=spec id=s1-resolved created=2026-11-19T23:06:10+00:00 state=fixed resolves=s1 -->
### s1-resolved · finding [fixed] · resolves s1: Add the required top-level Test Plan section

Added a top-level

<!-- fr:journal kind=finding scope=spec id=s2-resolved created=2026-11-19T23:06:10+00:00 state=fixed resolves=s2 -->
### s2-resolved · finding [fixed] · resolves s2: Declare the VS Code readingMode contribution

Spec now names the speedRead.readingMode contribution in packages/vscode-extension/package.json, its enum/default, and config-path coverage.

<!-- fr:journal kind=finding scope=spec id=s3-resolved created=2026-11-19T23:06:10+00:00 state=fixed resolves=s3 -->
### s3-resolved · finding [fixed] · resolves s3: Define the flow-mode focus marker geometry

Spec now defines a separate centered flow-mode crosshair that is unaffected by list depth and preserves the old chunk-mode axis.

<!-- fr:journal kind=decision scope=spec id=exit-baseline created=2026-11-19T23:06:12+00:00 -->
### exit-baseline · decision · exit when spec-review resolved

The exit when spec-review resolved; `fr verification set` and `deliver` compare against it.

```yaml
row_gates:
  reader-three-row-flow: none
row_kinds:
  reader-three-row-flow: none
run_gate: developer
run_kind: none
```

<!-- fr:journal kind=discovery scope=spec id=test-plan-step-1 created=2026-11-20T09:29:30+00:00 -->
### test-plan-step-1 · discovery · Test Plan step 1: n/a

Step: No post-merge operator steps are required. The feature's user-visible behavior is covered before merge by the automated tests and browser scenario listed in `## Verification`.

Reason: The Test Plan has no post-merge operator steps; behaviour was verified before merge by the full suite (vitest 650 passed, Playwright 82 passed) and the browser scenario.
