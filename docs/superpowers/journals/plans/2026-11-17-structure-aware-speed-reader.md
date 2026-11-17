<!-- fr:journal-schema=4 -->
# Journal: 2026-11-17-structure-aware-speed-reader

<!-- fr:journal kind=decision scope=plan id=p1-heading-step-position created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-heading-step-position · decision · Heading steps carry blockIndex -1 and a null-element source (phase 1)

The spec's `Section.heading` (kept verbatim) has no `SourceRef`, and a heading is not a
block, so `chapter` and `title` steps carry `blockIndex: -1` and `source: { element: null }`.
If cursor-follow on headings (R21) needs a source, phase 2/4 extraction must add one.

<!-- fr:journal kind=decision scope=plan id=p1-item-step-source created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-item-step-source · decision · List item steps carry the item's source, not the list block's (phase 1)

`item-chunk` and `item-gap` steps take `ListItem.source` so the VS Code cursor can sit on
the list item being read (R21 says list-item granularity); `list-whole` carries the block source.

<!-- fr:journal kind=decision scope=plan id=p1-timeline-shape created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-timeline-shape · decision · buildTimeline returns { steps, sections } with per-section firstStep and exhibits (phase 1)

`TimelineSection` holds id, title, level, words, `firstStep` and `exhibits`
(`{ blockIndex, block, revealAt }`). Every code/table/math/image/diagram block is listed;
`revealAt` is its own step index, or for a skipped one the index of the next step (the
timeline length when nothing follows). Chunk steps carry `sentenceIndex` (within the block
or item) and `sentenceStart`. The chapter card holds title, words, summary and direct
sub-headings; its estimated time is left to `sectionEstimate` in pacing.

<!-- fr:journal kind=decision scope=plan id=p1-sentence-split-details created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-sentence-split-details · decision · Sentence ends look through closing quotes/brackets; atoms never end a sentence or clause (phase 1)

A token like `"stop!"` or `(Mostly.)` ends a sentence (trailing closers are stripped before
the terminal check, leading openers before the abbreviation and single-capital check).
Abbreviations match case-sensitively. Atom tokens are never sentence or clause ends. The
clause marks are , ; : and the dashes - – —.

<!-- fr:journal kind=decision scope=plan id=p1-orp-midpoint created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-orp-midpoint · decision · ORP midpoint is floor(length / 2); a midpoint on a space picks the following word (phase 1)

`orp(text)` takes the chunk text. A word with no letters or digits pivots on its first character.

<!-- fr:journal kind=decision scope=plan id=p1-player-semantics created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-player-semantics · decision · Player choices where the spec is silent (phase 1)

- `toggle` from idle starts (from index 0 again after the end); resuming a pause replays the
  current step with a fresh ramp.
- Navigation (sentence/section/jump) while playing or stopped keeps playing from the target
  (fresh ramp, stopping again if it lands on a stop); while idle or paused it shows the target
  and leaves the player paused; while reading it only moves the position.
- `sentence(+1)` with no later sentence and `section(±1)` past either end do nothing;
  `sentence(-1)` at the first sentence replays it.
- `jumpToBlock(ref)` matches a step source by identity, the same element, or an element the
  ref's element contains (so a list's element finds its items).
- `speed` emits `settings` only when the clamped WPM changes; persisting is the host's job.
- `expand` acts only on stop/dwell steps: pauses if playing and emits a new `expand` event
  (sectionId, blockIndex, source) for the UI.
- End step: words = tokens of chunk steps plus list-whole words shown since play started;
  elapsedMs = wall time since that play started, pauses included.
- `revealedExhibits` uses a per-section high-water mark; a section becomes fully revealed only
  when playback advances out of it naturally, so jumping over a section reveals nothing in it.
- `position` is emitted when the step index changes (not on a replay of the same step).

<!-- fr:journal kind=decision scope=plan id=p1-settings-validation created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-settings-validation · decision · Settings validation fallbacks (phase 1)

Non-numeric or non-finite numbers fall back to the default (not clamped). Numbers are clamped
but not rounded. `stopLevels` keeps first-occurrence order; a non-array falls back to [1, 2].
`display` accepts overlay|dock; `tts` keeps a boolean `enabled` and a string `voiceURI`.

<!-- fr:journal kind=discovery scope=plan id=p1-toolchain created=2026-11-17T15:43:15+00:00 phase=1 -->
### p1-toolchain · discovery · Toolchain versions and tsc layout (phase 1)

typescript ^5.9, vitest ^3.2, jsdom ^26, esbuild ^0.25, @playwright/test exactly 1.63.0.
`tsc -b` builds the root `tsconfig.json`, which references `packages/core` (composite,
output under node_modules/.cache/tsc so nothing lands in the tree). Later packages add a
reference there. Test-only helpers live in `packages/core/src/testing/` (doc builders and
`fakeClock`) and are not exported from the package index.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t1 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t1 · discovery · no-refactor-because P1.T1 (phase 1)

Scaffolding only (config files, one defaults module); there is no logic yet to clean.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t2 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t2 · discovery · no-refactor-because P1.T2 (phase 1)

normalizeSettings already shares clampNumber/oneOf/normalizeExhibit helpers across every field; no duplication or unclear names were left to remove.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t4 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t4 · discovery · no-refactor-because P1.T4 (phase 1)

buildTimeline was written with its helpers (stopPrompt, summarise, directSubheadings, sentenceParts) factored out; an unused-locals check found nothing, so the refactor step changed nothing.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p1-t5 created=2026-11-17T15:43:15+00:00 phase=1 -->
### no-refactor-p1-t5 · discovery · no-refactor-because P1.T5 (phase 1)

pacing.ts is one switch over step kinds with named constants for every factor; nothing to clean.

<!-- fr:journal kind=review scope=plan id=review-p1 created=2026-11-17T15:53:16+00:00 phase=1 -->
### review-p1 · review · Phase 1 code review: 9 findings, all in scope, all fixed (phase 1)

Independent reviewer checked the phase 1 diff against spec sections 1-5 and plan 01.yaml, ran typecheck and the suite, and confirmed chunking, sentence split, ORP, step kinds, durations and ramp match the spec. Findings raised: p1-r1 to p1-r9. Fixes verified by the orchestrator: suite re-run green, 126 tests.

<!-- fr:journal kind=finding scope=plan id=p1-r1 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r1 · finding [open] (reviewer: in scope) · sentence(+/-1) after the end throws (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r2 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r2 · finding [open] (reviewer: in scope) · End-card elapsed time and words wrong when playback starts via navigation or replays (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r3 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r3 · finding [open] (reviewer: in scope) · Timer scheduled after emitting lets a listener's close or pause leave a live timer (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r4 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r4 · finding [open] (reviewer: in scope) · Navigating onto a stop while paused needed two Space presses (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r5 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r5 · finding [open] (reviewer: in scope) · All heading steps shared one source object (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r6 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r6 · finding [open] (reviewer: in scope) · Player could not take new settings or a new timeline (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r7 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r7 · finding [open] (reviewer: in scope) · Some skipped exhibits were never revealed (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r8 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r8 · finding [open] (reviewer: in scope) · .gitignore lost the acceptance report entries (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p1-r9 created=2026-11-17T15:53:16+00:00 phase=1 state=open review_scope=in -->
### p1-r9 · finding [open] (reviewer: in scope) · directSubheadings was quadratic (phase 1)

Raised by the phase 1 reviewer with file and line; in scope: caused by this phase's code.

<!-- fr:journal kind=lens scope=plan id=lens-errors-1 created=2026-11-17T15:53:16+00:00 phase=1 lens=errors step=review-phase -->
### lens-errors-1 · lens · Suggested by the phase 1 reviewer: the player threw or kept timers on edge-state commands (phase 1)

<!-- fr:journal kind=finding scope=plan id=p1-r1-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r1 -->
### p1-r1-resolved · finding [fixed] · resolves p1-r1: sentence(+/-1) after the end throws (phase 1)

After the end, -1 goes to the last landing and +1 does nothing; tests added (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r2-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r2 -->
### p1-r2-resolved · finding [fixed] · resolves p1-r2: End-card elapsed time and words wrong when playback starts via navigation or replays (phase 1)

A reading session starts on the first play after idle whatever led there; tests for jump-then-play and replay (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r3-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r3 -->
### p1-r3-resolved · finding [fixed] · resolves p1-r3: Timer scheduled after emitting lets a listener's close or pause leave a live timer (phase 1)

State settled and timer scheduled before events; generation counter drops stale timers; nothing advances once closed (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r4-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r4 -->
### p1-r4-resolved · finding [fixed] · resolves p1-r4: Navigating onto a stop while paused needed two Space presses (phase 1)

Landing on a waiting step sets stopped; one Space continues (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r5-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r5 -->
### p1-r5-resolved · finding [fixed] · resolves p1-r5: All heading steps shared one source object (phase 1)

Section heading now carries its own SourceRef used by heading steps (ebf354a).

<!-- fr:journal kind=finding scope=plan id=p1-r6-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r6 -->
### p1-r6-resolved · finding [fixed] · resolves p1-r6: Player could not take new settings or a new timeline (phase 1)

Added replaceTimeline and setSpeed, keeping position, play state, session and reveals (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r7-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r7 -->
### p1-r7-resolved · finding [fixed] · resolves p1-r7: Some skipped exhibits were never revealed (phase 1)

Exhibits reveal once the position passes their reveal step, including step-less sections and navigation (74941cc).

<!-- fr:journal kind=finding scope=plan id=p1-r8-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r8 -->
### p1-r8-resolved · finding [fixed] · resolves p1-r8: .gitignore lost the acceptance report entries (phase 1)

Entries restored (b0c6e56).

<!-- fr:journal kind=finding scope=plan id=p1-r9-resolved created=2026-11-17T15:53:16+00:00 phase=1 state=fixed resolves=p1-r9 -->
### p1-r9-resolved · finding [fixed] · resolves p1-r9: directSubheadings was quadratic (phase 1)

Iterates by index (ebf354a).

<!-- fr:journal kind=decision scope=plan id=p2-extract-inline-and-blocks created=2026-11-17T16:23:56+00:00 phase=2 -->
### p2-extract-inline-and-blocks · decision · Extraction choices where spec section 2 is silent (phase 2) (phase 2)

- Inline runs between block children (loose text in a div) become prose with the parent as source.
- img, picture, svg and canvas break an inline run, so `<p>a <img> b</p>` yields prose, image, prose.
- Inside a list item, paragraphs are flattened into the item text; exhibits (pre, table, display math,
  images, diagrams) inside an item are emitted as blocks right after the list.
- aria-hidden is honoured at block level only (as the spec says); `hidden`, display:none and
  visibility:hidden are skipped inline too. getComputedStyle is wrapped in try/catch because jsdom
  throws on MathML elements.
- Section ids are `s<n>` (prefix configurable through `ExtractOptions.idPrefix`); an untitled first
  section exists only when there is content before the first heading; an empty root yields no sections.
- A heading's text is read like inline content, so KaTeX in a heading shows its TeX source once.
- extractRange: a range inside one inline-only block becomes one prose block from the range's cloned
  contents (atoms kept); otherwise the common ancestor is extracted and blocks filtered by
  `range.intersectsNode`; a heading the range does not touch is dropped.

<!-- fr:journal kind=decision scope=plan id=p2-clone-host created=2026-11-17T16:23:56+00:00 phase=2 -->
### p2-clone-host · decision · createCloneHost is a core helper for hosts that show clones (phase 2) (phase 2)

`createCloneHost(source, { wrapperClass, onPosition, onClose })` implements `Host` by deep-cloning:
exhibits are clones of the block element, the normal-reading document is a clone of the roots with a
parallel-walk element map for `locate`/`refAt`. The demo page and the unit tests use it; the VS Code
webview (phase 4) can too. The core UI itself still never clones: only the host does.

<!-- fr:journal kind=decision scope=plan id=p2-ui-choices created=2026-11-17T16:23:56+00:00 phase=2 -->
### p2-ui-choices · decision · Reader UI choices where spec section 6 is silent (phase 2) (phase 2)

- `mountReader` options also take an optional `scheduler`; the handle also exposes `ready` (resolves
  once `store.load()` values are applied). Settings are normalized; speed-only changes go to
  `player.setSpeed`, any other change rebuilds the timeline and calls `replaceTimeline`.
- `destroy()` releases every host node still shown and does not call `host.onClose`; `onClose` fires
  when the player closes (Esc or the close button). Esc closes, in order: the expanded exhibit, the
  narrow outline drawer, the reader.
- Styles adopt into the root's scope (`getRootNode()` of an element root, or the shadow root); the
  sentinel is `--sr-sentinel: 1` on `.sr-reader`. Hosts theme through `--speed-read-*` properties.
- The 900 px breakpoint is a container query on the reader width (`container-type: inline-size`).
- Outline rows show remaining time (`done` when read) and progress from the step estimates; untitled
  sections have no row. A ready card shows before the first play.
- Clicking a block in normal reading walks up from the pressed element to the innermost element that
  is a step source, then calls `jumpToBlock` (refAt alone would return an inline child such as `code`).
- Tab and Shift+Tab both toggle normal reading on the root/stage; Tab from a reader button cycles focus
  inside the reader. Keys with Ctrl, Meta or Alt are ignored.
- Settings panel: number inputs apply on `input`, and on `change` the clamped value is written back;
  the TTS row is a disabled checkbox labelled "Text-to-speech" until phase 5.
- The demo mounts into a light-DOM element (not a shadow root) so page styles reach the clones
  wrapped in `.doc`; the demo's localStorage store key is `speed-read-demo:settings`.

<!-- fr:journal kind=discovery scope=plan id=p2-chunk-chars-caps-words created=2026-11-17T16:23:56+00:00 phase=2 -->
### p2-chunk-chars-caps-words · discovery · Words per chunk 8 is capped by the 20-character default (phase 2) (phase 2)

With the default `chunkChars` 20, raising words per chunk to 8 shows at most what fits in 20
characters ("So you can read it", five words, on the fixture). The e2e test and the visual shot assert
that chunk; the row's "change words per chunk to 1 and to 8" is shown with the character limit in force.

<!-- fr:journal kind=finding scope=plan id=p2-v1-wide-outline-hidden created=2026-11-17T16:23:56+00:00 phase=2 state=fixed review_scope=in -->
### p2-v1-wide-outline-hidden · finding [fixed] (reviewer: in scope) · Outline rail hidden in the wide layout (found by e2e) (phase 2)

The container-query overrides preceded the base .sr-outline display-none rule, so the rail never showed at 900 px and up. Moved the wide-layout block to the end of the stylesheet.

<!-- fr:journal kind=finding scope=plan id=p2-v2-visual-fixes created=2026-11-17T16:23:56+00:00 phase=2 state=fixed review_scope=in -->
### p2-v2-visual-fixes · finding [fixed] (reviewer: in scope) · Visual review fixes before recording the shots (phase 2)

Opening the screenshots showed: the item counter overlapping the top axis tick (moved above the
display); nested-item indent overriding the pivot shift (one combined margin, axis ticks move with the
depth); the narrow pane scrolling the active exhibit's caption out of view (the pane now scrolls its
own list to the item's top, never an ancestor); legends with a large gap and an unstyled Done button in
the settings panel; compositing artefacts under the translucent settings backdrop (backdrop made
transparent, the panel keeps its border and shadow); a double frame on code in the pane (demo page
styles lowered to `:where` specificity).

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p2-t2 created=2026-11-17T16:23:56+00:00 phase=2 -->
### no-refactor-p2-t2 · discovery · no-refactor-because P2.T2 (phase 2)

The shell was built with its helpers (builder, applyStyles, defaultScheduler) factored out; the refactor step only fixed a readonly icon-path type, so no duplication or unclear names were left.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p2-t6 created=2026-11-17T16:23:56+00:00 phase=2 -->
### no-refactor-p2-t6 · discovery · no-refactor-because P2.T6 (phase 2)

No refactor step: the task adds the fixture, demo page, scripts and browser tests; the visual review led to CSS fixes recorded as findings below, not to restructuring.

<!-- fr:journal kind=decision scope=plan id=p2-prose-run-source created=2026-11-17T16:37:51+00:00 phase=2 decided_by=agent -->
### p2-prose-run-source · decision · Bare prose runs share their parent container as source; line from the nearest data-line ancestor (phase 2) (phase 2)

Inline text between blocks (loose text in a div) has no element of its own. The core never wraps or mutates page text, so such a run keeps the parent container as its `SourceRef.element` (several blocks can share one element: jumpToBlock and normal-reading marks then land on the container). Its `line` comes from the nearest `data-line` ancestor, so the VS Code cursor still lands on a source line. This stays a known limit (review finding p2-r8c).

<!-- fr:journal kind=review scope=plan id=review-p2 created=2026-11-17T16:40:01+00:00 phase=2 -->
### review-p2 · review · Phase 2 code and visual review: 8 findings, all in scope, all fixed (phase 2)

Independent reviewer checked the phase 2 diff against spec sections 2, 6, 10, 11 and plan 02.yaml, ran typecheck, unit and browser suites, took and opened its own screenshots for every declared visual name and tried each control at its limits (WPM 100 and 1000, words per chunk 1 and 8 and the clamps, 360 px and 1600 px, dark theme, long heading, long word, deep list, empty document). Findings raised: p2-r1 to p2-r8. Fixes verified by the orchestrator: 247 unit and 14 browser tests pass.

<!-- fr:journal kind=finding scope=plan id=p2-r1 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r1 · finding [open] (reviewer: in scope) · Outline remaining times not recomputed on speed changes (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r2 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r2 · finding [open] (reviewer: in scope) · Normal-reading mark relied on shadow styles that cannot reach slotted content (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r3 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r3 · finding [open] (reviewer: in scope) · Esc could not close the outline drawer after a pointer press on its toggle (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r4 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r4 · finding [open] (reviewer: in scope) · Very long word shrunk to unreadable size and the sentence line overflowed (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r5 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r5 · finding [open] (reviewer: in scope) · Pivot fit ignored list depth and was not redone on resize (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r6 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r6 · finding [open] (reviewer: in scope) · Settings Done button contrast too low (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r7 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r7 · finding [open] (reviewer: in scope) · Narrow-bar menu icon squashed by a long heading (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r8 created=2026-11-17T16:40:01+00:00 phase=2 state=open review_scope=in -->
### p2-r8 · finding [open] (reviewer: in scope) · Empty and no-heading states, shared prose-run source, outline rewrote every row (phase 2)

Raised by the phase 2 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p2-r1-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r1 -->
### p2-r1-resolved · finding [fixed] · resolves p2-r1: Outline remaining times not recomputed on speed changes (phase 2)

Recomputed at the player's current speed on every speed change, including loaded settings (5a2ac57).

<!-- fr:journal kind=finding scope=plan id=p2-r2-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r2 -->
### p2-r2-resolved · finding [fixed] · resolves p2-r2: Normal-reading mark relied on shadow styles that cannot reach slotted content (phase 2)

Mark is now inline on the located element with exact restore; Host doc says a slot-returning host sizes its own content (31f4bc5).

<!-- fr:journal kind=finding scope=plan id=p2-r3-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r3 -->
### p2-r3-resolved · finding [fixed] · resolves p2-r3: Esc could not close the outline drawer after a pointer press on its toggle (phase 2)

Focus moves into the drawer on open and back to the root on close; Esc closes from anywhere (fb1a12e).

<!-- fr:journal kind=finding scope=plan id=p2-r4-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r4 -->
### p2-r4-resolved · finding [fixed] · resolves p2-r4: Very long word shrunk to unreadable size and the sentence line overflowed (phase 2)

Minimum scale 0.5 then wrap; sentence line wraps within the stage (d500c23).

<!-- fr:journal kind=finding scope=plan id=p2-r5-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r5 -->
### p2-r5-resolved · finding [fixed] · resolves p2-r5: Pivot fit ignored list depth and was not redone on resize (phase 2)

Depth offset included; ResizeObserver re-aligns (d500c23).

<!-- fr:journal kind=finding scope=plan id=p2-r6-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r6 -->
### p2-r6-resolved · finding [fixed] · resolves p2-r6: Settings Done button contrast too low (phase 2)

Control reset has zero specificity; e2e checks 4.5:1 in both themes (e0cc7ea).

<!-- fr:journal kind=finding scope=plan id=p2-r7-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r7 -->
### p2-r7-resolved · finding [fixed] · resolves p2-r7: Narrow-bar menu icon squashed by a long heading (phase 2)

Icon keeps its size; heading ellipsizes (697f1fd).

<!-- fr:journal kind=finding scope=plan id=p2-r8-resolved created=2026-11-17T16:40:01+00:00 phase=2 state=fixed resolves=p2-r8 -->
### p2-r8-resolved · finding [fixed] · resolves p2-r8: Empty and no-heading states, shared prose-run source, outline rewrote every row (phase 2)

Empty state and collapsed outline; only changed rows update; prose-run source keeps the container with nearest data-line, recorded as a known limit (f1780c0, 366e687).

<!-- fr:journal kind=discovery scope=plan id=p3-extension-loading created=2026-11-17T17:00:52+00:00 phase=3 -->
### p3-extension-loading · discovery · The unpacked extension loads headless with the chromium channel in this container (phase 3)

`chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: ['--disable-extensions-except=…', '--load-extension=…'] })`
with the preinstalled Playwright 1.63.0 browser at /opt/pw-browsers loads the extension and its service worker
appears at once in `context.serviceWorkers()`; xvfb was not needed. tests/e2e/extension.spec.ts uses one persistent
context for the file (serial), calls `__speedReadTest.openReader(tabId, mode)` through `worker.evaluate`, and finds the
tab id by matching `tabs.query({})` URLs (the `<all_urls>` grant exposes them). The Playwright webServer command now
also runs `node packages/browser-extension/build.mjs`.

<!-- fr:journal kind=decision scope=plan id=p3-bridge-and-modes created=2026-11-17T17:00:52+00:00 phase=3 -->
### p3-bridge-and-modes · decision · Content script and reader share the isolated world; the read modes and their fallbacks (phase 3)

- The content script and the injected reader.js run in the extension's one isolated world, so the reader asks the content
  script for the remembered context-menu target and the Alt+pressed block through a global (`__speedReadContent`
  with `contextTarget()` / `hoverTarget()`), not a message. Verified in Chromium by the from-here and Alt-hover tests.
- Message modes: `auto` (toolbar, command), `selection`, `from-here` (menus), `from-block` (hover). `selection` with no live
  selection reads the main content; `from-here`/`from-block` with no connected target read the main content from its start.
- From a block: the container is extracted and only blocks that are, contain, or follow the target are kept; a heading
  before the target is dropped. A block outside the generic main content gets its nearest article/main/section/[role=main]
  ancestor, else its parent, as container.
- Selection: the container passed to the host (style source and normal-reading view) is the adapter/generic container when
  it holds the whole range, else the range's common ancestor.
- The hover message is sent on the click event only; mousedown, mouseup, click and auxclick on the outlined block are all
  prevented and stopped. Alt state comes from the pointer event's altKey (so Alt pressed while unfocused still works).
- The block under the pointer is the nearest p/li/pre/blockquote/h1-6/table/figure/dd/dt/details, else the nearest
  non-inline element, never body or html.
- Opening while a reader is open replaces it. A repeated injection is a no-op through `globalThis.__speedRead`.

<!-- fr:journal kind=decision scope=plan id=p3-mount-choices created=2026-11-17T17:00:52+00:00 phase=3 -->
### p3-mount-choices · decision · Browser mount choices where spec section 7 is silent (phase 3)

- The shadow root is open (Playwright and the page's own tools can inspect it; page selectors still cannot reach it).
- Every inline style is set through the CSSOM (`style.cssText` / `setProperty`), not `setAttribute('style')`, so a page
  CSP without 'unsafe-inline' cannot block it.
- Overlay: backdrop rgba(15,23,42,0.6) and a frame inset max(16px,4vh) max(16px,4vw); clicking the backdrop closes. Page
  scroll lock is `overflow: hidden !important` on the html element; the dock margin is `margin-right: 420px !important`
  on the html element; both restore the previous inline value on close.
- keydown/keyup/keypress bubbling out of the host element are stopped, so the page's own shortcuts do not fire while the
  reader has focus.
- Close by the reader (Esc, close button, backdrop) scrolls to the last position's element and outlines it for 1.6 s;
  a re-mount or replacement closes silently.
- Display change: the store wrapper notices a saved `display` different from the mounted mode and re-mounts in the other
  mode, then `jumpToBlock` to the last position once settings load.
- Settings live under the `settings` key of `storage.local`.
- Clones: a neutral outer `div[data-sr-clone]` carries the slot name, the copied inherited properties, the background
  (white when no ancestor has one), padding 12px 16px, max-width 100% and overflow auto. Ancestor shells keep their classes
  but drop their layout and box (display block, no margin, padding, border, width or position), so page layout rules for
  those ancestors do not squeeze the clone. Ids inside the clone are kept (page `#id` rules still match; the page's
  getElementById finds the original first); only shells lose them. img and svg inside a clone get max-width 100%.
- The background requests host access fire-and-forget (`.catch`), then opens at once: activeTab covers the tab either way.
- The core now exports `blockWords` (used to recount a section's words after trimming it from a block).

<!-- fr:journal kind=decision scope=plan id=p3-site-selectors created=2026-11-17T17:00:52+00:00 phase=3 -->
### p3-site-selectors · decision · Site adapter selectors are best knowledge, untested against the real sites (phase 3)

claude.ai: replies `[data-is-streaming]`, `.font-claude-response`, `.font-claude-message`, content `.standard-markdown, .progressive-markdown`.
chatgpt.com / chat.openai.com: reply `[data-message-author-role="assistant"]`, content `.markdown`.
gemini.google.com: replies `model-response`, `message-content`, content `.markdown, .model-response-text`.
When several reply selectors nest, the outermost match is the reply. Only the selection logic is tested, on synthetic
markup; the real sites are the live row chat-site-adapters.

<!-- fr:journal kind=finding scope=plan id=p3-v1-visual-fixes created=2026-11-17T17:00:52+00:00 phase=3 state=fixed review_scope=in -->
### p3-v1-visual-fixes · finding [fixed] (reviewer: in scope) · Visual review: exhibit squeezed by ancestor padding, tall card clipped in the docked panel (phase 3)

The first capture showed (1) the styled page's code exhibit narrow and cut, because the `.site` shell kept the page's
32px padding, and (2) the chapter card in the 420 px dock clipped at its top, because `.sr-display` shrank below the
card and centred it. Fixed: shells drop padding and border; `.sr-display` no longer shrinks and centres with `safe`
alignment, and `.sr-stage` scrolls vertically, so a card taller than the stage starts at its top. Recaptured and reviewed.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p3-t1 created=2026-11-17T17:00:52+00:00 phase=3 -->
### no-refactor-p3-t1 · discovery · no-refactor-because P3.T1 (phase 3)

The package was written in its final shape (one build.mjs for bundling, icons and zips; one ext.ts shim). The only follow-up was a tsBuildInfoFile path so tsc -b does not collide with core.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p3-t2 created=2026-11-17T17:00:52+00:00 phase=3 -->
### no-refactor-p3-t2 · discovery · no-refactor-because P3.T2 (phase 3)

sites.ts is data only and generic.ts holds two small functions; findContainer in adapters/index.ts is the single entry. Nothing duplicated.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p3-t3 created=2026-11-17T17:00:52+00:00 phase=3 -->
### no-refactor-p3-t3 · discovery · no-refactor-because P3.T3 (phase 3)

host.ts was built around one cloneSafe walk and one wrap helper shared by exhibit() and document(); the later switch from setAttribute('style') to CSSOM cssText (CSP-safe) was the only cleanup.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p3-t5 created=2026-11-17T17:00:52+00:00 phase=3 -->
### no-refactor-p3-t5 · discovery · no-refactor-because P3.T5 (phase 3)

content.ts is one install function with a listener table; nothing to remove.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p3-t6 created=2026-11-17T17:00:52+00:00 phase=3 -->
### no-refactor-p3-t6 · discovery · no-refactor-because P3.T6 (phase 3)

background.ts routes every entry point through openReader plus two tiny helpers; the refactor step changed nothing.

<!-- fr:journal kind=decision scope=plan id=p3-frames-known-limit created=2026-11-17T17:19:09+00:00 phase=3 decided_by=agent -->
### p3-frames-known-limit · decision · Frames are a known limit of the browser reader (phase 3 review r11) (phase 3)

The reader is injected into, and reads, the top frame only. A context-menu item used inside an iframe (info.frameId not 0) opens the reader on the top page's main content (mode 'main'), since neither the frame's selection nor the remembered target is visible to the top-frame reader. Alt-hover inside a frame is not handled: the content script runs per frame but the reader opens in the top frame. The remembered context-menu and hover targets are handed out once and only while still in the page. The README lists frames under known limits.

<!-- fr:journal kind=review scope=plan id=review-p3 created=2026-11-17T17:21:14+00:00 phase=3 -->
### review-p3 · review · Phase 3 code, security and visual review: 15 in-scope findings fixed, 3 out of scope (phase 3)

Independent reviewer checked the phase 3 diff against spec section 7 and plan 03.yaml, ran typecheck, unit, build and browser suites, probed page-world attacks in Chromium, and took and opened its own screenshots for every declared visual name plus hostile and dark pages, dock widths, normal reading and Alt-hover edge cases. Findings raised: p3-r1 to p3-r18. Fixes verified by the orchestrator: full gate re-run green.

<!-- fr:journal kind=finding scope=plan id=p3-r1 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r1 · finding [open] (reviewer: in scope) · DOM clobbering: page ids disabled the reader, from-here and Alt-hover (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r2 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r2 · finding [open] (reviewer: in scope) · Open shadow root and untrusted events let page scripts drive the reader and write settings (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r3 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r3 · finding [open] (reviewer: in scope) · Alt+click or from-here on a list item read from the first item of the outer list (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r4 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r4 · finding [open] (reviewer: in scope) · Links in slotted clones stayed live (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r5 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r5 · finding [open] (reviewer: in scope) · Current-block mark's fill made dark page code unreadable (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r6 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r6 · finding [open] (reviewer: in scope) · Alt-hover acted inside the reader (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r7 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r7 · finding [open] (reviewer: in scope) · Page removing the host left html unscrollable or with the dock margin (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r8 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r8 · finding [open] (reviewer: in scope) · Chapter card clipped in the docked panel (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r9 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r9 · finding [open] (reviewer: in scope) · Hostile page rules restyled the wrapper and shells (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r10 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r10 · finding [open] (reviewer: in scope) · Alt+click outside main content opened an empty reader (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r11 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r11 · finding [open] (reviewer: in scope) · Context menu ignored frameId and kept a stale target (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r12 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r12 · finding [open] (reviewer: in scope) · Offline check had no remote subresource (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r13 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r13 · finding [open] (reviewer: in scope) · Clones kept ids and names (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r14 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r14 · finding [open] (reviewer: in scope) · Test hook shipped in the production background bundle (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r15 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=in -->
### p3-r15 · finding [open] (reviewer: in scope) · Clone-map logic duplicated between browser host and core (phase 3)

Raised by the phase 3 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p3-r16 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=out -->
### p3-r16 · finding [open] (reviewer: out of scope) · Dock margin does not move position:fixed page elements (phase 3)

Raised by the phase 3 reviewer and tagged out of scope. The margin technique is the one the spec prescribes; fixed-position page elements slide under the panel. Not caused by this phase's code; to be listed as a known limit and filed.

<!-- fr:journal kind=finding scope=plan id=p3-r17 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=out -->
### p3-r17 · finding [open] (reviewer: out of scope) · Chrome prompts on every toolbar press when site access is on-click (phase 3)

Raised by the phase 3 reviewer and tagged out of scope. Follows from the spec requiring permissions.request in both browsers; a spec-level change (restrict to Firefox), not this phase's defect.

<!-- fr:journal kind=finding scope=plan id=p3-r18 created=2026-11-17T17:21:14+00:00 phase=3 state=open review_scope=out -->
### p3-r18 · finding [open] (reviewer: out of scope) · Expanded exhibit limited to the stage width (phase 3)

Raised by the phase 3 reviewer and tagged out of scope. Phase 2 core layout, not changed by this phase.

<!-- fr:journal kind=finding scope=plan id=p3-r1-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r1 -->
### p3-r1-resolved · finding [fixed] · resolves p3-r1: DOM clobbering: page ids disabled the reader, from-here and Alt-hover (phase 3)

Shared state under Symbol.for keys checked as own properties; bridge functions type-checked; API shim requires a runtime; fixture and e2e added (d590660, 025d097).

<!-- fr:journal kind=finding scope=plan id=p3-r2-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r2 -->
### p3-r2-resolved · finding [fixed] · resolves p3-r2: Open shadow root and untrusted events let page scripts drive the reader and write settings (phase 3)

Closed shadow root in the packaged build; trustedEventsOnly ignores untrusted events; e2e on the packaged build (0b9ff6d, a0dded3, 512d3e1).

<!-- fr:journal kind=finding scope=plan id=p3-r3-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r3 -->
### p3-r3-resolved · finding [fixed] · resolves p3-r3: Alt+click or from-here on a list item read from the first item of the outer list (phase 3)

List read from the innermost item holding the start, numbering kept (512d3e1).

<!-- fr:journal kind=finding scope=plan id=p3-r4-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r4 -->
### p3-r4-resolved · finding [fixed] · resolves p3-r4: Links in slotted clones stayed live (phase 3)

Default actions prevented inside clones; handler attributes and javascript URLs stripped (a1d0630).

<!-- fr:journal kind=finding scope=plan id=p3-r5-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r5 -->
### p3-r5-resolved · finding [fixed] · resolves p3-r5: Current-block mark's fill made dark page code unreadable (phase 3)

Mark is outline only (0b9ff6d).

<!-- fr:journal kind=finding scope=plan id=p3-r6-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r6 -->
### p3-r6-resolved · finding [fixed] · resolves p3-r6: Alt-hover acted inside the reader (phase 3)

Targets inside the reader host ignored (d590660).

<!-- fr:journal kind=finding scope=plan id=p3-r7-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r7 -->
### p3-r7-resolved · finding [fixed] · resolves p3-r7: Page removing the host left html unscrollable or with the dock margin (phase 3)

MutationObserver runs the teardown (512d3e1).

<!-- fr:journal kind=finding scope=plan id=p3-r8-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r8 -->
### p3-r8-resolved · finding [fixed] · resolves p3-r8: Chapter card clipped in the docked panel (phase 3)

Compact cards below 900 px reader width; e2e box check at 800 px height (0b9ff6d).

<!-- fr:journal kind=finding scope=plan id=p3-r9-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r9 -->
### p3-r9-resolved · finding [fixed] · resolves p3-r9: Hostile page rules restyled the wrapper and shells (phase 3)

sr-clone wrapper and important neutral layout on shells (a1d0630).

<!-- fr:journal kind=finding scope=plan id=p3-r10-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r10 -->
### p3-r10-resolved · finding [fixed] · resolves p3-r10: Alt+click outside main content opened an empty reader (phase 3)

Falls back to the block alone, then main content (512d3e1).

<!-- fr:journal kind=finding scope=plan id=p3-r11-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r11 -->
### p3-r11-resolved · finding [fixed] · resolves p3-r11: Context menu ignored frameId and kept a stale target (phase 3)

Targets handed out once while connected; subframe use reads the top page's main content; frames recorded as a known limit (d590660, 6f641d4).

<!-- fr:journal kind=finding scope=plan id=p3-r12-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r12 -->
### p3-r12-resolved · finding [fixed] · resolves p3-r12: Offline check had no remote subresource (phase 3)

Fixture with routed remote image and stylesheet; no further request on reveal, expand or normal reading (025d097).

<!-- fr:journal kind=finding scope=plan id=p3-r13-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r13 -->
### p3-r13-resolved · finding [fixed] · resolves p3-r13: Clones kept ids and names (phase 3)

Stripped, with dangling references removed (a1d0630).

<!-- fr:journal kind=finding scope=plan id=p3-r14-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r14 -->
### p3-r14-resolved · finding [fixed] · resolves p3-r14: Test hook shipped in the production background bundle (phase 3)

Dropped by a build flag; test variant built to dist-test; build test asserts absence (a0dded3).

<!-- fr:journal kind=finding scope=plan id=p3-r15-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=fixed resolves=p3-r15 -->
### p3-r15-resolved · finding [fixed] · resolves p3-r15: Clone-map logic duplicated between browser host and core (phase 3)

One exported helper used by both (0b9ff6d, a1d0630).

<!-- fr:journal kind=finding scope=plan id=p3-r16-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=open resolves=p3-r16 out_of_scope=true -->
### p3-r16-resolved · finding [out-of-scope] · resolves p3-r16: Dock margin does not move position:fixed page elements (phase 3)

The margin technique is the one the spec prescribes; fixed-position page elements slide under the panel. Not caused by this phase's code; to be listed as a known limit and filed.

<!-- fr:journal kind=finding scope=plan id=p3-r17-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=open resolves=p3-r17 out_of_scope=true -->
### p3-r17-resolved · finding [out-of-scope] · resolves p3-r17: Chrome prompts on every toolbar press when site access is on-click (phase 3)

Follows from the spec requiring permissions.request in both browsers; a spec-level change (restrict to Firefox), not this phase's defect.

<!-- fr:journal kind=finding scope=plan id=p3-r18-resolved created=2026-11-17T17:21:14+00:00 phase=3 state=open resolves=p3-r18 out_of_scope=true -->
### p3-r18-resolved · finding [out-of-scope] · resolves p3-r18: Expanded exhibit limited to the stage width (phase 3)

Phase 2 core layout, not changed by this phase.

<!-- fr:journal kind=decision scope=plan id=p4-vscode-choices created=2026-11-17T17:50:55+00:00 phase=4 -->
### p4-vscode-choices · decision · VS Code extension choices where spec section 8 is silent (phase 4) (phase 4)

- Alt+Shift+R is two keybindings (`readSelection` when `editorHasSelection`, `readFile` otherwise), both `editorTextFocus && editorLangId == markdown`. `readSection` and `readFromLine` take a line argument, so they are hidden from the command palette. `readSelection` with an empty selection reads the file.
- The selection range does not include a last line that the selection only touches at column 0. A blank cursor line belongs to the next block. Hover appears on headings and on paragraph, list-item and blockquote text. It does not appear on fences, blank lines, table rows or thematic breaks.
- The hover MarkdownString is trusted for exactly one command, `isTrusted: { enabledCommands: ['speedRead.readFromLine'] }`.
- The read message is `{ type: 'read', markdown, startLine, endLine?, settings, format, baseUri }`. It carries the whole file; the webview renders only the range. `format: 'plain'` marks a non-Markdown file. The webview reads it as one paragraph per blank-line-separated run and never parses it as Markdown, because escaping text into Markdown collides with texmath's `\(` rule.
- Relative images resolve against `baseUri`: the document folder through `asWebviewUri`, joined with `new URL(src, baseUri)`. Remote images and any other URL scheme are shown as an `<img>` holding a local SVG data-URI placeholder that shows the alt text, so they remain image exhibits.
- Links render without `href`, with the URL kept as `title`. The reader does not navigate.
- The webview reports `ready`, and a read requested earlier is held until then. The panel HTML is written once per panel, with one nonce. Esc closing the reader disposes the panel.
- Cursor follow uses visible editors only (setting `editor.selection` and calling `revealRange` with InCenterIfOutsideViewport, never `showTextDocument`). It ignores closed documents, out-of-range lines and repeated lines. The repeat filter resets on each new read.
- Settings are written to the Global target, only for keys that changed. A malformed settings message is ignored. The core `ReaderHandle` gains `applySettings(settings)` for settings the host pushes; these are not saved back, so there is no echo loop. `speedRead.display` exists to mirror R12 but means nothing in VS Code.
- Theme: VS Code `--vscode-*` variables map onto every `--speed-read-*` property. Body class `vscode-dark` sets `color-scheme: dark` and Mermaid's `dark` theme.
- Core extraction: a block without its own `data-line` takes the line of its nearest `data-line` ancestor. This applies to the pre inside a wrapped fence and to `.katex-display` inside the math wrapper.

<!-- fr:journal kind=discovery scope=plan id=p4-render-pitfalls created=2026-11-17T17:50:55+00:00 phase=4 -->
### p4-render-pitfalls · discovery · Webview rendering pitfalls found by the browser test (phase 4) (phase 4)

- The core extractor skips `visibility: hidden` elements, and visibility is inherited. Extracting from the hidden render container therefore yields an empty document. The container now sits in an off-screen, aria-hidden frame that is `visibility: hidden` except during the synchronous `extract()` call.
- `mermaid.render(id, text, container)` empties the container it is given. Each diagram is rendered in a separate scratch element inside the frame, never in the document root.
- texmath wraps display math in `<section><eqn>`, which the extractor reads as prose. Display math is rendered directly as KaTeX `.katex-display`, and an equation number becomes `\tag`.
- The bundle builds in about 1 s (esbuild). `dist/webview.js` is about 4.0 MB minified, mostly Mermaid; the .vsix is about 2.0 MB.

<!-- fr:journal kind=discovery scope=plan id=p4-visual-fixes created=2026-11-17T17:50:55+00:00 phase=4 -->
### p4-visual-fixes · discovery · Visual review fixes before recording the phase 4 shots (phase 4)

Preview shots showed a left-to-right flowchart scaled too small in the 3-column exhibit pane. The fixture diagram is now top-down. A diagram in the pane is capped at 45vh, or 24vh under 900 px where the pane sits below the stage; it scales down inside its box with its aspect ratio kept, and E still expands it to full size.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p4-t1 created=2026-11-17T17:50:55+00:00 phase=4 -->
### no-refactor-p4-t1 · discovery · no-refactor-because P4.T1 (phase 4)

The task adds a manifest, a build script and config files; no code was duplicated and nothing needed renaming.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p4-t2 created=2026-11-17T17:50:55+00:00 phase=4 -->
### no-refactor-p4-t2 · discovery · no-refactor-because P4.T2 (phase 4)

The only change after green was replacing Array.findLastIndex (ES2023, outside the ES2022 lib) with a loop. ranges.ts already had one line scanner, cached per text, shared by every query.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p4-t3 created=2026-11-17T17:50:55+00:00 phase=4 -->
### no-refactor-p4-t3 · discovery · no-refactor-because P4.T3 (phase 4)

The providers, commands and panel were written around one `command(id, range)` helper and one message type module. Nothing was duplicated.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p4-t5 created=2026-11-17T17:50:55+00:00 phase=4 -->
### no-refactor-p4-t5 · discovery · no-refactor-because P4.T5 (phase 4)

The refactor happened inside the task: core `runSource` and `sourceOf` became one `sourceOf` with the nearest-ancestor line. Display math got one renderer shared by both block rules.

<!-- fr:journal kind=review scope=plan id=review-p4 created=2026-11-17T18:24:29+00:00 phase=4 -->
### review-p4 · review · Phase 4 code and visual review: 10 in-scope findings fixed, 1 out of scope (phase 4)

Independent reviewer read the extension-host code against the real VS Code API (the unit tests see only a stub), checked manifest, CSP, hover link, handshake, rendering hardening and ranges against spec section 8, ran typecheck, unit, build, browser and package gates, and stressed the webview with its own Markdown in dark, light and high-contrast themes at wide and 450 px widths, opening its own screenshots. No path from file content to script or remote request was found. Findings raised: p4-r1 to p4-r11. Fixes verified by the orchestrator: full gate re-run green.

<!-- fr:journal kind=finding scope=plan id=p4-r1 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r1 · finding [open] (reviewer: in scope) · KaTeX SVGs collapsed: radicals and vector arrows vanished (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r2 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r2 · finding [open] (reviewer: in scope) · Commands resolved the document from activeTextEditor (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r3 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r3 · finding [open] (reviewer: in scope) · Command titles repeated the category (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r4 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r4 · finding [open] (reviewer: in scope) · Settings write-back not serialised (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r5 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r5 · finding [open] (reviewer: in scope) · Changing localResourceRoots reloads the webview while ready stayed true (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r6 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r6 · finding [open] (reviewer: in scope) · Wide display equation clipped with no cue (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r7 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r7 · finding [open] (reviewer: in scope) · Large flowchart illegible in the pane (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r8 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r8 · finding [open] (reviewer: in scope) · Relative image in an untitled document tripped the CSP (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r9 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r9 · finding [open] (reviewer: in scope) · Edits while reading made cursor follow use stale lines (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r10 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=in -->
### p4-r10 · finding [open] (reviewer: in scope) · Reveal moved an open reader to another column (phase 4)

Raised by the phase 4 reviewer with file and line or screenshot; in scope: caused by this phase's code.

<!-- fr:journal kind=finding scope=plan id=p4-r11 created=2026-11-17T18:24:29+00:00 phase=4 state=open review_scope=out -->
### p4-r11 · finding [open] (reviewer: out of scope) · Headings with inline math show TeX source in outline and section cards (phase 4)

Raised by the phase 4 reviewer and tagged out of scope. The outline and section cards show a heading's inline math as TeX source. This follows from the core's heading text and the spec's stated limit that inline math is shown as source outside normal reading; not caused by this phase.

<!-- fr:journal kind=finding scope=plan id=p4-r1-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r1 -->
### p4-r1-resolved · finding [fixed] · resolves p4-r1: KaTeX SVGs collapsed: radicals and vector arrows vanished (phase 4)

Image rule limited to images and Mermaid SVGs, also in the core sheet; e2e checks SVG heights (6a38d72).

<!-- fr:journal kind=finding scope=plan id=p4-r2-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r2 -->
### p4-r2-resolved · finding [fixed] · resolves p4-r2: Commands resolved the document from activeTextEditor (phase 4)

Lens and hover pass the URI; palette commands fall back to the last source editor (e0cd935).

<!-- fr:journal kind=finding scope=plan id=p4-r3-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r3 -->
### p4-r3-resolved · finding [fixed] · resolves p4-r3: Command titles repeated the category (phase 4)

Titles shortened; line-argument commands hidden from the palette (16410d8).

<!-- fr:journal kind=finding scope=plan id=p4-r4-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r4 -->
### p4-r4-resolved · finding [fixed] · resolves p4-r4: Settings write-back not serialised (phase 4)

Writes queued, pushes held while pending, each key written to its effective scope (7912692).

<!-- fr:journal kind=finding scope=plan id=p4-r5-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r5 -->
### p4-r5-resolved · finding [fixed] · resolves p4-r5: Changing localResourceRoots reloads the webview while ready stayed true (phase 4)

Ready reset and the read held until the new ready (144cb1c).

<!-- fr:journal kind=finding scope=plan id=p4-r6-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r6 -->
### p4-r6-resolved · finding [fixed] · resolves p4-r6: Wide display equation clipped with no cue (phase 4)

Scales to 0.6 then scrolls with an edge fade (5357581).

<!-- fr:journal kind=finding scope=plan id=p4-r7-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r7 -->
### p4-r7-resolved · finding [fixed] · resolves p4-r7: Large flowchart illegible in the pane (phase 4)

Not scaled below half size; scrolls and shows E to expand (5357581).

<!-- fr:journal kind=finding scope=plan id=p4-r8-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r8 -->
### p4-r8-resolved · finding [fixed] · resolves p4-r8: Relative image in an untitled document tripped the CSP (phase 4)

Placeholder when no resolver (76c4545).

<!-- fr:journal kind=finding scope=plan id=p4-r9-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r9 -->
### p4-r9-resolved · finding [fixed] · resolves p4-r9: Edits while reading made cursor follow use stale lines (phase 4)

Follow stops and a Document changed notice offers Re-read (110fec1).

<!-- fr:journal kind=finding scope=plan id=p4-r10-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=fixed resolves=p4-r10 -->
### p4-r10-resolved · finding [fixed] · resolves p4-r10: Reveal moved an open reader to another column (phase 4)

reveal(undefined, false) (fe3fdda).

<!-- fr:journal kind=finding scope=plan id=p4-r11-resolved created=2026-11-17T18:24:29+00:00 phase=4 state=open resolves=p4-r11 out_of_scope=true -->
### p4-r11-resolved · finding [out-of-scope] · resolves p4-r11: Headings with inline math show TeX source in outline and section cards (phase 4)

The outline and section cards show a heading's inline math as TeX source. This follows from the core's heading text and the spec's stated limit that inline math is shown as source outside normal reading; not caused by this phase.

<!-- fr:journal kind=decision scope=plan id=p5-dial-choices created=2026-11-17T18:59:27+00:00 phase=5 -->
### p5-dial-choices · decision · Position dial choices where spec section 13 is silent (phase 5)

- `createDial({ onMove, now, requestFrame, cancelFrame })` is pure; `onMove(steps)` returns the steps actually moved, and a short move (a document end) zeroes the accumulator and the coast.
- A turn opposite to the banked fraction drops it, so a turn back moves back at once (found by the browser test: a fraction banked forwards swallowed the first notch back).
- After 400 ms without input the readout returns to x1 and the smoothed speed restarts from 0 (the mockup's reset), checked at the next turn as well as by frames.
- While the strip is held (pointer down) there is no coast; on release it coasts from the last movement. A held pointer standing still for over 40 ms ends the spin.
- Wheel deltaMode 1 counts 16 px per line, deltaMode 2 one viewport height; the dominant axis is used.
- `player.scrub(steps)` moves by whole timeline steps (item gaps included), clamped to the first and last step; from the end card only backwards. It shows each landing paused (or stopped on a stop/chapter, never holding the dial) and schedules the 700 ms resume on the player's scheduler; any other command cancels that resume. "Timed step" means a step with a pacing duration that does not wait for the reader.
- The tick strip slides 12 px per step moved; `aria-valuenow` is the position in percent of the timeline.
- `ReaderHandle.wheel(event)` is the hook a host uses to route page wheel events to the dial; it honours trustedEventsOnly.

<!-- fr:journal kind=decision scope=plan id=p5-layout-choices created=2026-11-17T18:59:27+00:00 phase=5 -->
### p5-layout-choices · decision · Floating layout and narrow push choices where spec section 13 is silent (phase 5)

- The floating root keeps pointer events (its gaps are inert): clicking between the cards does nothing and keeps focus in the reader, and in the browser every wheel event over the gaps reaches the reader's routing.
- Floating stage widths keep the cards apart: at 1180 px and wider `min(600px, 100% - 668px)` centred; 900-1179 px centred in the room left of the exhibit card; under 900 px `min(600px, 100% - 32px)`.
- Narrow floating: the stage's resting place is centred at 56 % of the reader height (the wide position), card top 8 px, stage floor 12 px above the reader bottom.
- Narrow panel (dock, narrow VS Code): the exhibit card overlays the main column 8 px below the toolbar; the stage region moves down by margin-top. With nothing revealed the exhibit card is hidden in both layouts (R28), so the old "appears here as you reach them" message shows only when wide.
- In the narrow push an exhibit body has no 420 px cap; the card itself scrolls once it reaches its maximum height.
- `ReaderHandle.relayout()` recomputes the push on demand; ResizeObserver and MutationObserver drive it otherwise.
- The expanded exhibit is inset 6 % / 4 % of the reader root (88 % x 92 %) as a card with a shadow, in both layouts.

<!-- fr:journal kind=decision scope=plan id=p5-overlay-choices created=2026-11-17T18:59:27+00:00 phase=5 -->
### p5-overlay-choices · decision · Browser overlay, dock and permission choices where spec section 13 is silent (phase 5)

- The page's effective background is the first opaque computed background from the read container up to the root, else white.
- The clear window is padded 6 px around the block, clamped to the viewport, painted outside by a 200vmax spread shadow in a veil with overflow hidden; a frame loop keeps it on the block while the page moves.
- The eased follow scrolls the block's nearest vertically scrolling ancestor (else the page) and runs after each position event until the block is within 1 px of 10 % of the viewport or the scroller cannot move; then it stops, so it never fights the user's scrollbar.
- Wheel routing inside the overlay excludes the exhibit card, the settings panel, the normal-reading view and the expanded exhibit (it scrolls its own content); the outline card turns the dial as the spec lists only those three.
- pageFade lives in core Settings (0.10-0.80, default 0.32), shown in the panel only when the host declares `hostSettings: ['pageFade']`; the browser declares it in both display modes. VS Code mirrors it as `speedRead.pageFade`, unused there.
- Closing scrolls the last block into view only when it is out of view (`block: 'nearest'`), so the overlay leaves the page where it was.
- Dock shift: an element spanning the viewport is pinned at both sides (left as measured, right moved in by 420 px, width auto), so its width shrinks by 420 px padding included; others get right moved in by 420 px and left auto. All with !important, restored to the exact previous value and priority.
- Firefox is recognised by `runtime.getURL('')` starting with `moz-extension:`, evaluated once at load; the request stays the handler's first statement.

<!-- fr:journal kind=decision scope=plan id=p5-tts-choices created=2026-11-17T18:59:27+00:00 phase=5 -->
### p5-tts-choices · decision · Text-to-speech choices where spec section 9 is silent (phase 5)

- `speak(chunks, wpm, handlers)` takes the sentence as its chunks; a title is spoken as one chunk of its words. onChunk fires only when the boundary moves into another chunk. A sentence that is all math ends without an utterance, on the next tick, never from inside speak().
- A boundary after the 1 s wait no longer changes the display; boundary-less counting is per voice and resets when a sentence gets a boundary in time.
- An utterance error moves on like an end, so playback never hangs.
- Player: speech times chunk, item-chunk and title steps when tts is enabled, the API is present and a voice is usable (picked, else the default local voice); otherwise the pacing timer runs as before. Speech starts after the step is shown; resuming mid-sentence speaks from the current chunk. Pause, stops, jumps, scrubs and close cancel through the player's one cancel path.
- The whole-sentence display is a `whole` player event the stage renders wrapped at 28 px.
- Panel: "Automatic: <voice>" (or "Choose a voice" when there is no local voice) plus every voice as "<name> (<lang>) · local|network"; a saved voice that is not listed stays as "Saved voice (not found)". Without the API the note reads "Text-to-speech is not available here".
- The mount creates the driver from the window's speechSynthesis with the document language (else navigator.language); hosts may inject one.

<!-- fr:journal kind=discovery scope=plan id=p5-readme-and-ci created=2026-11-17T18:59:27+00:00 phase=5 -->
### p5-readme-and-ci · discovery · README test, package test and CI (phase 5)

vitest now also includes tests/*.test.ts (readme.test.ts, package.test.ts). The package test lists zip entries by reading the central directory (no dependency) and skips with a message when dist/ has no packages. CI runs it after `npm run package`, and the upload names the three files with if-no-files-found error. The root `npm run package` already built and packaged every workspace.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t1 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t1 · discovery · no-refactor-because P5.T1 (phase 5)

tts.ts was written around one speak path; the only cleanup was turning the method-bound cancel into a named function shared by speak, cancel and destroy.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t3 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t3 · discovery · no-refactor-because P5.T3 (phase 5)

documentation, nothing to restructure

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t5 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t5 · discovery · no-refactor-because P5.T5 (phase 5)

The dial maths live in one pure module (dial.ts) and the strip in one UI module (dial-strip.ts) with one wheelDelta helper; nothing duplicated.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t6 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t6 · discovery · no-refactor-because P5.T6 (phase 5)

layout.ts holds one pure stagePush function and one controller shared by both layouts; nothing to clean.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t7 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t7 · discovery · no-refactor-because P5.T7 (phase 5)

Overlay veil, follow and dock shift were each written once in reader-entry.ts (createVeil, followStep, shiftFixed, makeRoom); no refactor step is owed and none was needed.

<!-- fr:journal kind=discovery scope=plan id=no-refactor-p5-t2 created=2026-11-17T18:59:27+00:00 phase=5 -->
### no-refactor-p5-t2 · discovery · no-refactor-because P5.T2 (phase 5)

The task's third step is the browser-level test and the capture, not a refactor step; no separate cleanup pass was made for this task, and its code is examined in the phase review.
