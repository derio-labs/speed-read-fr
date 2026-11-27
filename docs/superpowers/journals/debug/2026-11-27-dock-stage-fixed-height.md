<!-- fr:journal-schema=4 -->
# Journal: 2026-11-27-dock-stage-fixed-height

<!-- fr:journal kind=repro scope=debug id=56b31dfd1076 created=2026-11-27T08:34:24+00:00 -->
### 56b31dfd1076 · repro · Dock reading box changes height between cards and prose (R4)

Found walking Test Plan step 1 of 2026-11-26-word-default-red-toggle-top-dock (row vscode-fixed-chunk-box) in the built VS Code webview (scripts/webview-harness.mjs, tests/fixtures/sample.md, defaults: readingMode flow). Sampling every 250 ms: `.sr-stage` is 180px while prose plays and 128px while a title/dwell card shows; `.sr-stage-support` below it moves 52px at every switch. Spec R4: "The reading box keeps its fixed size and position through prose, chapters and exhibits." Pre-existing (same 128/180 on 0f327b4), made visible by PR #24 moving the stage to the top of the dock.
