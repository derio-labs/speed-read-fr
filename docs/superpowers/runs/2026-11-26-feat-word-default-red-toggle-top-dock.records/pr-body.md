<!-- rendered by fr for run 2026-11-26-feat-word-default-red-toggle-top-dock; edit above this line only -->

## Findings

- `s1` (spec) — The Red letters off rule loses to the flow first-letter accent rule on specificity — **fixed**
- `s2` (spec) — Render-only redLetters path through applySettings is undesigned — **fixed**
- `s3` (spec) — add prepends puts re-added earlier exhibits on top — **fixed**
- `s4` (spec) — New follow aim drops the scrollport floor; FOLLOW_AT and fallback undefined — **fixed**
- `s5` (spec) — Cards growing over the block do not re-aim or re-clip — **fixed**
- `s6` (spec) — Floating-dock styles plan misses drawer rule and outline anchoring — **fixed**
- `s7` (spec) — Test surface omits existing tests that assert the inverted behaviour — **fixed**
- `s8` (spec) — Storage test 'leaves a missing record alone' contradicts the design — **fixed**
- `s9` (spec) — Panel 'reading section' and manifest description names do not match code — **fixed**
- `p1-r1` (plan, phase 1) — Red letters hint says 'first letter of each word' but in chunk mode it controls the pivot — **fixed**
- `p1-r2` (plan, phase 1) — No test covers the save=false host path for a redLetters change — **fixed**
- `p2-f1` (plan, phase 2) — Pages with scroll-snap pull the block back under the cards — **fixed**
- `p2-f2` (plan, phase 2) — Title or stop card is squeezed to a strip when the exhibit list is tall — **fixed**
- `p2-r1` (plan, phase 2) — Floating outline card sits on the page band and covers the followed block — **fixed**
- `p2-r2` (plan, phase 2) — On proximity-snap pages the follow ends with the block under the stage; the snap assertion was dropped (covers p2-f1) — **fixed**
- `p2-r3` (plan, phase 2) — The current stop/dwell card, first under the stage, is squeezed whenever an exhibit shows (covers p2-f2) — **fixed**
- `p2-r4` (plan, phase 2) — Fixed-toolbar e2e no longer exercises the chrome floor; belowChrome scan capped at 0.6 of the viewport — **fixed**
- `p2-r5` (plan, phase 2) — Stop-card re-follow e2e passes by construction — **fixed**
- `p2-r6` (plan, phase 2) — Packaged-build test lost its follow checks — **fixed**
- `p2-r7` (plan, phase 2) — Teardown unsubscribe from onBandChange untested — **fixed**
- `l-simplicity-r1` (plan) — exhibits.ts:96-99 duplicates the filter/sort chain for newestFirst — **fixed**
- `l-simplicity-r2` (plan) — newestFirst actually means latest by document position; document it — **fixed**
- `l-simplicity-r3` (plan) — mount.ts repeats the ResizeObserver lookup — **fixed**
- `l-simplicity-r5` (plan) — Shape file omits the overlay's place(), the belowChrome limit change and the layout.ts edit — **fixed**
- `l-simplicity-r6` (plan) — e2e helper bandPoint moves the mouse; rename — **fixed**
- `l-tests-r1` (plan) — No test asserts the pivot or first letter is red with Red letters on — **fixed**
- `l-tests-r2` (plan) — snap.html case asserts nothing about blocks snapping below the cards — **fixed**
- `l-tests-r3` (plan) — p5a-r8 narrow-window assertion is guaranteed by place()'s band-top clip — **fixed**
- `l-tests-r4` (plan) — Shape file says the outline is out of the page band and omits layout.ts and place()/belowChrome changes — **fixed**

## Out-of-scope findings

- `p2-r8` (plan, phase 2) — Short windows leave a tiny page band — **deferred** → https://github.com/derio-labs/speed-read-fr/issues/25
- `l-simplicity-r4` (plan) — FreeBand.below is never read anywhere — **deferred** → https://github.com/derio-labs/speed-read-fr/issues/26

## Shape of the change

The dock reader (`bottomStage: true`: browser Overlay, Side panel, VS Code panel), top to bottom:

```diff
  .sr-main             toolbar · overall progress
- .sr-stage-support    title / stop / dwell card, then exhibits in document order
  .sr-stage            the reading box, fixed size
+ .sr-stage-support    title / stop / dwell card (kept whole), then exhibits latest-by-position first (list scrolls)
  .sr-outline          floating only: its own left column beside the reading box and cards, ending above the page band
```

What changed in each file. `+` marks what the change adds and `-` what it replaces:

```diff
  packages/core/src/settings.ts                 # Settings, DEFAULT_SETTINGS, normalizeSettings
-   flowMotion: 'flowing'
+   flowMotion: 'word'
+   redLetters: true
  packages/core/src/ui/settings-panel.ts        # the Settings form
+   field('Red letters', 'first letters and pivot', …)
  packages/core/src/ui/mount.ts                 # builds the reader DOM, applies settings, the dock's band
+   sameExceptLive ignores redLetters; live branch sets data-red-letters, saves on save=true
-   stage.before(support)
+   stage.after(support); floating order outline, main, support
+   freeBand(): band starts at the cards' bottom; onBandChange(fn)
  packages/core/src/ui/exhibits.ts              # createExhibits: the exhibit pane and its list
+   newestFirst: latest-by-position first (one direction-aware insert)
  packages/core/src/ui/layout.ts                # FreeBand type, narrow push layout
+   FreeBand doc: the dock's band lies below the reader's cards
  packages/core/src/ui/styles.ts                # reader stylesheet, incl. the [data-bottom-stage] dock grid
+   accents gated on .sr-reader:not([data-red-letters="off"])
+   floating grid rows auto auto minmax(0,1fr), columns auto (Contents) minmax(0,1fr); details flex 0 0 auto; drawer rows 2-4
  packages/browser-extension/src/storage.ts     # storage.local store + one-time migrations
+   MIGRATIONS list: flow-default, word-motion-default (one write)
  packages/browser-extension/src/reader-entry.ts  # Overlay: page fade, follow, scroll band
-   setBandBottom(fn)
+   setBandTop(fn), refollow(), place(); scroll-padding-top on the scroller (restored on close)
-   place(): window bottom clipped to the band bottom
+   place(): window top clipped to the band top
-   belowChrome scan limit innerHeight × 0.6
+   belowChrome scan limit start + innerHeight × 0.6
  packages/vscode-extension/package.json        # speedRead.* configuration manifest
+   speedRead.flowMotion default "word"; speedRead.redLetters
```

## Review lenses

| Lens | Why | Files examined | Findings |
| --- | --- | --- | --- |
| simplicity | spec-review: "the generalised migration list and the dynamic follow band add moving parts; keep them minimal" | 11 | l-simplicity-r1 fixed, l-simplicity-r2 fixed, l-simplicity-r3 fixed, l-simplicity-r4 out of scope (https://github.com/derio-labs/speed-read-fr/issues/26), l-simplicity-r5 fixed, l-simplicity-r6 fixed |
| tests | spec-review: "existing unit and e2e assertions encode the old geometry and defaults; check none silently invert" | 20 | l-tests-r1 fixed, l-tests-r2 fixed, l-tests-r3 fixed, l-tests-r4 fixed |

## Pre-merge verification owed

None.

## Post-merge verification owed

None.

## Manual operations

None.

## PR settle

- `git.settle.conflicts`: `fix` (default)
- `git.settle.ci`: `fix` (default)

The repo setting applies.

## Owed actions discharged

None.

## Tests

Full suite run at delivery — `full-suite-2.log@a02500e3c604`.

## Proportionality

```text
proportionality: merge-base 0f327b47597f546750676b6274aef772bf45db2d

## Unreferenced new files

none.

## Out-of-plan touches

- .claude/agents/fr-phase-executor.md
- .claude/agents/fr-spec-reviewer.md
- packages/vscode-extension/src/config.test.ts
- tests/e2e/webview.spec.ts

## Size

810 lines changed (+668 -142; fr artifacts excluded) against an estimate of 950 (0.9×).

## Phases

2 agentic phases serve 6 of 6 requirements (R1, R2, R3, R4, R5, R6).
```

## Cost

| step | turns | cost | main turns | main cache-read / output | main cost | subagent turns | subagent cache-read / output | subagent cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| brainstorm | 14 | $0.06 | 14 | 1.4M / 12k | $0.06 | — | — | — |
| spec-review | 66 | $0.26 | 29 | 4.3M / 20k | $0.14 | 37 | 3.0M / 25k | $0.12 |
| plan | 4 | $0.03 | 4 | 762k / 8.3k | $0.03 | — | — | — |
| plan-review | — | — | — | — | — | — | — | — |
| implement | 268 | $0.64 | 48 | 11.0M / 32k | $0.40 | 220 | 23.2M / 151k | $0.24 |
| journal-check | — | — | — | — | — | — | — | — |
| lens-review | 51 | $0.18 | 8 | 2.3M / 7.8k | $0.06 | 43 | 5.7M / 34k | $0.12 |
| deliver | — | — | — | — | — | — | — | — |
| (outside run) | 41 | $0.33 | 41 | 11.7M / 25k | $0.33 | — | — | — |
| **total** | | $1.50 | | | | | | |

| phase | tier | bound | ran | executor turns | executor cache-read / output | executor cost | reviewer turns | reviewer cache-read / output | reviewer cost | orchestrator turns | orchestrator cache-read / output | orchestrator cost |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | standard | claude-sonnet-5 | claude-sonnet-5-5 ≠ | 52 | 3.9M / 28k | $0.00 | 18 | 1.4M / 14k | $0.07 | 24 | 5.2M / 14k | $0.14 |
| 2 | standard | claude-sonnet-5 | claude-sonnet-5-5 ≠ | 138 | 18.5M / 89k | $0.00 | 28 | 2.8M / 31k | $0.17 | 24 | 5.8M / 18k | $0.26 |

_`ran` is shown only for an attempt that recorded its bound model; `≠` marks a phase that ran on a different model family._

Sessions: 1 read, 0 unavailable.
