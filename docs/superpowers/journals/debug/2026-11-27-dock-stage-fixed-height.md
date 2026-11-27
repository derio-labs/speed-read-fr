<!-- fr:journal-schema=4 -->
# Journal: 2026-11-27-dock-stage-fixed-height

<!-- fr:journal kind=repro scope=debug id=56b31dfd1076 created=2026-11-27T08:34:24+00:00 -->
### 56b31dfd1076 · repro · Dock reading box changes height between cards and prose (R4)

Found walking Test Plan step 1 of 2026-11-26-word-default-red-toggle-top-dock (row vscode-fixed-chunk-box) in the built VS Code webview (scripts/webview-harness.mjs, tests/fixtures/sample.md, defaults: readingMode flow). Sampling every 250 ms: `.sr-stage` is 180px while prose plays and 128px while a title/dwell card shows; `.sr-stage-support` below it moves 52px at every switch. Spec R4: "The reading box keeps its fixed size and position through prose, chapters and exhibits." Pre-existing (same 128/180 on 0f327b4), made visible by PR #24 moving the stage to the top of the dock.

<!-- fr:journal kind=root-cause scope=debug id=ff6830cbd2c3 created=2026-11-27T08:34:28+00:00 -->
### ff6830cbd2c3 · root-cause · .sr-display height keyed to its momentary data-kind, not the reading mode

packages/core/src/ui/styles.ts: `[data-bottom-stage] .sr-display` is 80px; `.sr-display[data-kind="flow"]` is 3 × 44px = 132px. stage.ts sets display.dataset.kind per step (ready → title → flow → title …) while `.sr-reader[data-reading-mode]` stays "flow" throughout. So the box shrinks to 80px each time a card replaces the ribbon. Measured `.sr-display` 80 ↔ 132 with every other stage child constant.

<!-- fr:journal kind=finding scope=debug id=8658a47975ac created=2026-11-27T08:46:51+00:00 state=fixed -->
### 8658a47975ac · finding [fixed] · Flow height keyed to data-reading-mode; e2e test pins one box height

styles.ts: `.sr-reader[data-bottom-stage][data-reading-mode="flow"] .sr-stage .sr-display` replaces `.sr-display[data-kind="flow"]`. Failing test first: tests/e2e/webview.spec.ts "the reading box keeps one height through titles, dwell cards and prose (flow, R4)" failed with ["128/176","180/228"]; passes after the fix, chunk-mode control passes before and after. Full suite: vitest 834 passed, playwright 127 passed, tsc clean.

<!-- fr:journal kind=review scope=debug id=010cc13632ec created=2026-11-27T08:46:58+00:00 -->
### 010cc13632ec · review · Self-review: no findings

Checked: live flow<->chunk switch still resizes (a real mode change); --sr-row-h/--sr-ribbon-font set during cards only feed the ribbon; the Overlay band (setBandTop/place) now sees a steady card edge. No .fr/docs.yaml in this repo, so no docs check owed.
